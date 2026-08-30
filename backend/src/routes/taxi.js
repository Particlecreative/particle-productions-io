const router = require('express').Router();
const db = require('../db');
const { verifyJWT } = require('../middleware/auth');

router.use(verifyJWT);

let _anthropic = null;
function getAnthropicClient() {
  if (!_anthropic) {
    const Anthropic = require('@anthropic-ai/sdk');
    _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, timeout: 105000, maxRetries: 1 });
  }
  return _anthropic;
}

// The structured transport plan the model maintains and returns every turn.
const PLAN_TOOL = {
  name: 'set_transport_plan',
  description: 'Create or update the full taxi/transport plan for the shoot. Call this on EVERY turn with the complete, current plan (not a diff).',
  input_schema: {
    type: 'object',
    properties: {
      summary: { type: 'string', description: 'One-line human summary, e.g. "3 taxis, first pickup 06:10, everyone on set by 07:00".' },
      call_time: { type: 'string', description: 'Call time at the shoot location, HH:MM (24h), if known.' },
      shoot_location: { type: 'string', description: 'Destination address everyone is heading to.' },
      direction: { type: 'string', enum: ['to_set', 'from_set', 'both'], description: 'Whether this plan covers pickups to set, rides home after wrap, or both.' },
      taxis: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            label: { type: 'string', description: 'e.g. "Taxi 1 — North TLV".' },
            leg: { type: 'string', enum: ['to_set', 'from_set'], description: 'Which leg this ride is for.' },
            pickup_time: { type: 'string', description: 'First pickup time HH:MM (24h).' },
            arrive_by: { type: 'string', description: 'Target arrival time HH:MM at the destination.' },
            est_km: { type: 'number' },
            est_cost_ils: { type: 'number', description: 'Rough taxi fare in ILS.' },
            route_note: { type: 'string', description: 'Short pickup-order route note.' },
            passengers: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  role: { type: 'string' },
                  phone: { type: 'string' },
                  pickup_address: { type: 'string' },
                  pickup_time: { type: 'string', description: 'This passenger\'s own pickup time HH:MM.' },
                  order: { type: 'integer', description: 'Pickup order within the ride, starting at 1.' },
                  note: { type: 'string' },
                },
                required: ['name'],
              },
            },
          },
          required: ['label', 'passengers'],
        },
      },
      unassigned: {
        type: 'array',
        description: 'People intentionally not placed in a taxi (drives self, no address, etc.).',
        items: {
          type: 'object',
          properties: { name: { type: 'string' }, reason: { type: 'string' } },
          required: ['name'],
        },
      },
      notes: { type: 'array', items: { type: 'string' }, description: 'Any assumptions or open questions.' },
    },
    required: ['taxis'],
  },
};

function buildSystem(ctx) {
  const { production, people, cast, shoot } = ctx;
  const roster = [
    ...(Array.isArray(people) ? people : []).map(p => ({
      name: p.full_name || p.name, role: p.role || p.item || 'Crew',
      phone: p.phone || '', address: p.address || '', kind: 'crew',
    })),
    ...(Array.isArray(cast) ? cast : []).map(c => ({
      name: c.name, role: c.role || 'Talent', phone: c.phone || '', address: c.address || '', kind: 'cast',
    })),
  ].filter(p => p.name);

  const rosterLines = roster.length
    ? roster.map(p => `- ${p.name} (${p.role}, ${p.kind})${p.address ? ` · ${p.address}` : ' · NO ADDRESS'}${p.phone ? ` · ${p.phone}` : ''}`).join('\n')
    : '(no roster provided — ask the user who needs rides)';

  return `You are the **Taxi Wizard**, a warm, sharp transport coordinator for film & photo shoots in Israel (mostly Tel Aviv area). You get people to set on time and, when asked, home after wrap — with the fewest taxis and the least hassle.

HOW YOU WORK
- Talk like a helpful human producer: friendly, concise, practical. No jargon dumps.
- You already have the roster below — DON'T ask people to re-enter it. Ask a brief clarifying question ONLY when something essential is missing (e.g. the call time), and make a sensible default plan anyway.
- On EVERY turn, call set_transport_plan with the COMPLETE current plan. Then reply in chat with a short, natural summary of what you did or what you need.
- Group passengers by pickup proximity (same neighborhood / on the way) and keep ride sizes sane (default max 4 per taxi unless told otherwise).
- Order passengers within a ride by pickup sequence and back-calculate each pickup time from the call time using realistic TLV travel times + a small buffer, so everyone arrives ~15 min before call.
- Rough fare estimate per ride (Israel): ~12₪ base + ~3.7₪/km, rounded. Only when you can estimate distance.
- Anyone who drives themselves, has no address, or isn't going → put in "unassigned" with a one-line reason. Never invent addresses or phone numbers.
- If the user says things like "add a return trip after wrap", "fewer taxis", "Dana drives herself", "combine the Florentin pickups" — update the plan accordingly.

SHOOT
- Destination: ${shoot?.location || production?.project_name || '(ask the user)'}
- Date: ${shoot?.date || production?.planned_start || '(unknown)'}
- Call time: ${shoot?.call_time || '(unknown — ask, but draft with a reasonable assumption)'}

ROSTER (${roster.length} people)
${rosterLines}`;
}

// POST /api/taxi/:productionId/chat  { messages, people, cast, shoot }
router.post('/:productionId/chat', async (req, res) => {
  try {
    const { messages, people, cast, shoot } = req.body;
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'messages array required' });
    }
    if (!process.env.ANTHROPIC_API_KEY) {
      return res.status(500).json({ error: 'AI is not configured on this server (missing API key).' });
    }

    const { rows } = await db.query('SELECT id, project_name, planned_start FROM productions WHERE id = $1', [req.params.productionId]);
    const production = rows[0] || { id: req.params.productionId };

    const system = buildSystem({ production, people, cast, shoot });

    // Keep only role/content the API accepts.
    const apiMessages = messages
      .filter(m => m && (m.role === 'user' || m.role === 'assistant') && (m.content ?? '') !== '')
      .map(m => ({ role: m.role, content: String(m.content) }));

    const client = getAnthropicClient();
    const final = await client.beta.messages.stream({
      model: 'claude-opus-5',
      max_tokens: 8000,
      system,
      tools: [PLAN_TOOL],
      messages: apiMessages,
    }).finalMessage();

    let reply = '';
    let plan = null;
    for (const block of final.content || []) {
      if (block.type === 'text') reply += block.text;
      else if (block.type === 'tool_use' && block.name === 'set_transport_plan') plan = block.input;
    }

    res.json({ reply: reply.trim(), plan });
  } catch (err) {
    console.error('POST /taxi/:id/chat error:', err);
    res.status(500).json({ error: err.message || 'Taxi planning failed' });
  }
});

module.exports = router;
