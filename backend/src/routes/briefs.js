const router = require('express').Router();
const { verifyJWT } = require('../middleware/auth');

async function callClaude(systemPrompt, userPrompt) {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY not configured');
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-5',
      max_tokens: 1500,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    }),
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error(data.error?.message || `Anthropic API ${resp.status}`);
  return data.content?.[0]?.text || '';
}
const MONDAY_TOKEN = process.env.MONDAY_API_TOKEN;
const MONDAY_URL = 'https://api.monday.com/v2';

router.use(verifyJWT);

// ── Monday GraphQL helper ───────────────────────────────────
async function mondayQuery(query, variables = {}) {
  if (!MONDAY_TOKEN) throw new Error('Monday.com API token not configured');
  const res = await fetch(MONDAY_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': MONDAY_TOKEN,
      'API-Version': '2024-10',
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`Monday API error: ${res.status}`);
  const data = await res.json();
  if (data.errors) throw new Error(data.errors[0]?.message || 'Monday query failed');
  return data.data;
}

// GET /api/briefs/boards — list active boards
router.get('/boards', async (req, res) => {
  try {
    const data = await mondayQuery(`{
      boards(limit: 50, state: active) {
        id name board_kind items_count description
      }
    }`);
    const boards = (data.boards || []).filter(b => b.board_kind !== 'sub_items_board');
    res.json({ boards });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/briefs/boards/:boardId/items — list items from a board (first 50)
router.get('/boards/:boardId/items', async (req, res) => {
  const { boardId } = req.params;
  const { search } = req.query;
  try {
    // Get items with basic info (paginated, first 50)
    const data = await mondayQuery(`
      query GetItems($boardIds: [ID!]!) {
        boards(ids: $boardIds) {
          name
          items_page(limit: 50) {
            items {
              id
              name
              state
              group { id title }
              column_values(types: [status, date, text, people]) {
                id title text
              }
            }
          }
        }
      }
    `, { boardIds: [boardId] });

    const board = data.boards?.[0];
    if (!board) return res.status(404).json({ error: 'Board not found' });

    let items = board.items_page?.items || [];
    if (search) {
      const q = search.toLowerCase();
      items = items.filter(i => i.name.toLowerCase().includes(q));
    }

    res.json({ board_name: board.name, items });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/briefs/generate — fetch Monday item + call Claude to generate brief
router.post('/generate', async (req, res) => {
  const { board_id, item_id, extra_context } = req.body;
  if (!item_id) return res.status(400).json({ error: 'item_id is required' });

  try {
    // 1. Fetch full Monday item
    const data = await mondayQuery(`
      query GetItem($ids: [ID!]!) {
        items(ids: $ids) {
          id
          name
          state
          board { id name }
          group { id title }
          column_values {
            id title text value type
          }
          updates(limit: 5) {
            id body created_at creator { name }
          }
        }
      }
    `, { ids: [item_id] });

    const item = data.items?.[0];
    if (!item) return res.status(404).json({ error: 'Item not found' });

    // 2. Build readable context from Monday item
    const columnLines = (item.column_values || [])
      .filter(cv => cv.text && cv.text.trim() && cv.text !== '{}')
      .map(cv => `- **${cv.title}**: ${cv.text}`)
      .join('\n');

    const updateLines = (item.updates || [])
      .map(u => {
        const clean = u.body.replace(/<[^>]+>/g, '').trim();
        return clean ? `[${u.creator?.name || 'Unknown'} on ${u.created_at?.slice(0,10)}]: ${clean}` : null;
      })
      .filter(Boolean)
      .join('\n\n');

    const mondayContext = [
      `Item: ${item.name}`,
      `Board: ${item.board?.name || ''}`,
      `Group: ${item.group?.title || ''}`,
      columnLines ? `\nFields:\n${columnLines}` : '',
      updateLines ? `\nComments/Updates:\n${updateLines}` : '',
      extra_context ? `\nAdditional context from requester:\n${extra_context}` : '',
    ].filter(Boolean).join('\n');

    // 3. Call Claude to generate the brief
    const systemPrompt = `You are a creative production brief writer for a video and design production company.
Given Monday.com project data, generate a structured, professional creative brief in JSON format.
Return ONLY valid JSON matching this exact schema:
{
  "title": "Brief title (concise, action-oriented)",
  "objective": "1-2 sentences: What is this project trying to achieve?",
  "target_audience": "Who is this for? Demographics, psychographics, platform.",
  "key_messages": ["Message 1", "Message 2", "Message 3"],
  "tone": "e.g. Energetic & Bold / Warm & Inspirational / Professional & Clean",
  "deliverables": [
    { "type": "e.g. :30s Video", "format": "e.g. 16:9 + 9:16", "platform": "e.g. Instagram, YouTube", "quantity": 1 }
  ],
  "timeline": {
    "deadline": "YYYY-MM-DD or 'TBD'",
    "milestones": ["Milestone 1", "Milestone 2"]
  },
  "creative_direction": "2-3 sentences on visual style, mood, references, do's and don'ts.",
  "budget_notes": "Any budget info extracted, or 'Not specified'",
  "notes": "Any other relevant info, constraints, or open questions."
}`;

    const userPrompt = `Generate a creative production brief from this Monday.com request:\n\n${mondayContext}`;

    const raw = await callClaude(systemPrompt, userPrompt);
    // Extract JSON from response
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('Claude did not return valid JSON');
    const brief = JSON.parse(jsonMatch[0]);

    res.json({
      brief,
      source: {
        item_id: item.id,
        item_name: item.name,
        board_id: item.board?.id,
        board_name: item.board?.name,
      },
    });
  } catch (err) {
    console.error('[briefs/generate] error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
