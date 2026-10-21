/**
 * AI ticket creator — replaces brief-writer.particle-creative.cloud.
 * Claude turns a short chat into a complete Video / Design ticket (labels picked only from the board's real
 * options), the user reviews the form, and only an explicit Submit creates the Monday item.
 */
const db = require('../../db');
const monday = require('../monday');
const W = require('../creative/week');
const { getAnthropic } = require('../anthropic');
const { createItem, addUpdate } = require('./write');

const MODEL = 'claude-opus-5-5';
const FORM_GROUP = 'new_group__1'; // "Form Requests" on both boards

// Brief-writer fields mapped onto the boards' columns
const FIELDS = {
  video: [
    { key: 'department', col: 'label', type: 'status', label: 'Department', required: true },
    { key: 'product', col: 'label9', type: 'status', label: 'Product', required: true },
    { key: 'type', col: 'label4', type: 'status', label: 'Type', required: true },
    { key: 'task_name', type: 'name', label: 'Task name', required: true },
    { key: 'concept', col: 'long_text_mkn8c1ax', type: 'long_text', label: 'Video concept', required: true },
    { key: 'script', col: 'long_text_Mjj2uK4g', type: 'long_text', label: 'Script / message' },
    // Several opening lines in the brief; Monday's Hook column gets the first
    { key: 'hook', col: 'short_text_mkn8n4bx', type: 'long_text', write: 'first_line', label: 'Hook variations (one per line)' },
    { key: 'requested_by', col: 'person', type: 'people', label: 'Requested by', pool: 'requesters' },
    { key: 'assignee', col: 'people', type: 'people', label: 'Editor', pool: 'video' },
    { key: 'versions', col: 'numbers', type: 'number', label: 'Versions needed' },
    { key: 'priority', col: 'priority_mkm11w0a', type: 'status', label: 'Priority' },
    { key: 'sizes', col: 'multi_select_Mjj2VFZH', type: 'dropdown', label: 'Sizes needed' },
    { key: 'deadline', col: 'date_Mjj2cG7T', type: 'date', label: 'Deadline' },
    { key: 'ai_assist', col: 'color_mm1q4zbz', type: 'status', label: 'AI assist' },
    { key: 'platform', col: 'single_selectu06tevn', type: 'status', label: 'Platform' },
    // free: a campaign not on Monday's list yet still goes in the item name and the brief (like the old brief-writer)
    { key: 'campaign', col: 'dropdown_mm3n9vjc', type: 'dropdown', label: 'Campaign', free: true },
    { key: 'duration', col: 'numeric_mm209bwg', type: 'number', label: 'Estimated duration (sec)' },
  ],
  design: [
    { key: 'department', col: 'status_1__1', type: 'status', label: 'Department', required: true },
    { key: 'product', col: 'label9', type: 'status', label: 'Product', required: true },
    { key: 'task_name', type: 'name', label: 'Task name', required: true },
    { key: 'concept', col: 'long_textpvqldjpg', type: 'long_text', label: 'Concept', required: true },
    { key: 'supporting_text', col: 'long_text_mkngjytf', type: 'long_text', label: 'Supporting text / copy' },
    { key: 'requested_by', col: 'people_Mjj2RrZM', type: 'people', label: 'Requested by', pool: 'requesters' },
    { key: 'assignee', col: 'people', type: 'people', label: 'Designer', pool: 'design' },
    { key: 'versions', col: 'numberpuotbeaf', type: 'number', label: 'Versions' },
    { key: 'priority', col: 'priority__1', type: 'status', label: 'Priority' },
    { key: 'sizes', col: 'multi_select_Mjj2tEdu', type: 'dropdown', label: 'Sizes' },
    { key: 'other_sizes', col: 'short_text_Mjj2RnHq', type: 'text', label: 'Other sizes' },
    { key: 'deadline', col: 'date_Mjj20aki', type: 'date', label: 'Deadline' },
    { key: 'ai_assist', col: 'single_selectt2aekp5', type: 'status', label: 'AI assist' },
    { key: 'platform', col: 'single_selectrz7230p', type: 'status', label: 'Platform' },
    { key: 'website_task', col: 'single_selectess8b86', type: 'status', label: 'Type of website task' },
    { key: 'campaign', col: 'dropdown_mm3n7bw1', type: 'dropdown', label: 'Campaign', free: true },
  ],
};
const ALL_KEYS = [...new Set([...FIELDS.video, ...FIELDS.design].map(f => f.key))];

/** Form definition + allowed options for both boards. people: { requesters, video, design } = [{ id, name }] */
async function ticketForm(config, people) {
  const out = { boards: {}, people };
  for (const bk of ['video', 'design']) {
    const meta = await monday.boardMeta(config.boards[bk].board_id);
    out.boards[bk] = {
      key: bk,
      label: bk === 'video' ? 'Video Projects' : 'Design Projects 2.0',
      fields: FIELDS[bk].filter(f => !f.col || meta.columns[f.col]).map(f => {
        let options = null;
        if (f.type === 'status') options = Object.values(meta.statusMaps[f.col]?.byIndex || {}).filter(v => v.label && !v.deactivated).map(v => v.label);
        if (f.type === 'dropdown') options = meta.dropdowns?.[f.col] || [];
        if (f.type === 'people') options = (people[f.pool] || []).map(p => p.name);
        return { key: f.key, label: f.label, type: f.type, required: !!f.required, free: !!f.free, options: options ? [...new Set(options)] : null };
      }),
    };
  }
  return out;
}

const DRAFT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['reply', 'board', 'fields', 'missing', 'ready'],
  properties: {
    reply: { type: 'string', description: 'Short chat reply to the user' },
    board: { type: 'string', enum: ['video', 'design'] },
    fields: {
      type: 'object',
      additionalProperties: false,
      required: ALL_KEYS,
      properties: Object.fromEntries(ALL_KEYS.map(k => [k, ['sizes', 'campaign', 'requested_by', 'assignee'].includes(k)
        ? { type: 'array', items: { type: 'string' } }
        : { type: 'string' }])),
    },
    missing: { type: 'array', items: { type: 'string' } },
    ready: { type: 'boolean' },
  },
};

const SYSTEM = `You are the ticket assistant for Particle's creative studio (Particle is a men's skincare and grooming brand; its customers are mostly men 45–65).
You help Tomer (head of creative) and Omer write Monday tickets for two boards:
- "video": Video Projects (video editors: edits, UGC, TV, motion, AI video)
- "design": Design Projects 2.0 (designers: statics, website, email, Amazon, decks)

Every turn you receive today's date, the current draft and every field's allowed options. Update the draft from the conversation and return it whole.
Rules:
- Pick the board from the request (video vs design); keep the current board unless the user clearly changes it.
- For status / dropdown / people fields use ONLY exact option texts from the lists. Never invent people, products or labels. Use "" (or []) when unknown.
  Exception — campaign: use the existing option when one matches; otherwise the campaign name as the user wrote it (it goes in the ticket name and the brief).
- Resolve relative dates ("Thursday", "next week", "end of month") to YYYY-MM-DD in Israel time from today. Studio work days are Sunday–Thursday.
- task_name: named like the team's tickets — product, platform, format and a short concept name, e.g. "Gravité Meta Static Sticky Note On Bottle", "NeoRoot Meta Thinning But Not Gone", "Mike Provenzano NeoRoot UGC Edit — Enhanced Cut x2 Hooks". Never include "/" or "|".
- Write every brief the way the studio's real briefs are written — the <reference_briefs> below are recent briefs from the team (mostly Lilian Krumholz). Match their structure, tone, density and level of visual detail. They show the STYLE: how a product works may be reused for that same product, but never their stats, study numbers, ratings, prices, discounts, codes, guarantees, testimonials, people's names or links — those come only from the user.
- Video concept: open with what's on screen — who (age, look), where, framing, light — then tone, what to take from each reference (keep the user's links exactly), footage sources and a concrete shot list, pacing (scene length), subtitles, how much product is on screen, formats and length; end with the ad headline when there is one. For edits of creator footage use "FOOTAGE: <link>" then "EDIT:" with the instructions.
- hook (video): 2–3 alternative opening lines for the first 3 seconds, one per line, no numbering — only when the video needs a hook.
- script (video): for scripted / VO ads write it out like the references — SCRIPT (voiceover) in quotes, starting with "[hook]", in the voice of a real man talking to men like him, then TEXT ON SCREEN (only these); or timed parts like "Part 1 — The comment (0:00–0:05)". The hook lines live only in the hook field — don't repeat them in the script. Plain, specific, spoken; no hype words. Leave it empty for simple edits.
- Design concept: "Please look at attached reference, copy the layout (…precise composition: subject, background colour, where the product and headline sit…), apply to <product> …", then the reference link(s), and what to remove or change. For print/packaging add size and print notes.
- supporting_text (design): the exact copy per version — "V1: …", "V2: …", "V3: …" (as many as versions), shared lines marked "(all versions)", FRONT / BACK sections for two-sided pieces.
- When the user gives no copy, hooks or script but the piece needs them, write proposed ones in the team's voice (short, specific, human, true to the product) — never placeholders like "[headline]" — and say in the reply that they're proposals to check. Don't invent claims, ratings, prices, discounts or codes.
- Simple requests (a resize, a new size, a text swap) stay short — a few clear lines, no script.
- Keep what the user already set or edited in the form unless they ask to change it.
- requested_by defaults to the person you're talking to when they are in the requesters list.
- Simple requests (a resize, a new size, a text swap) should be ready in one turn: infer sensible defaults (versions 1, priority Medium if available) instead of asking.
- missing: keys of required fields you still can't fill. ready = true only when nothing required is missing.
- reply: 1–3 short sentences. If something required is missing, ask for it in one question. If ready, say so and summarise in one line. Never claim the ticket was created — the user submits it with the button after reviewing.
- Write ticket fields in English, even if the user writes in Hebrew; reply in the user's language.`;

function emptyFields() { return Object.fromEntries(ALL_KEYS.map(k => [k, ['sizes', 'campaign', 'requested_by', 'assignee'].includes(k) ? [] : ''])); }

// ── Style references: the team's real briefs ───────────────────────────────
const BRIEF_RE = /^Department:/;
/**
 * Recent real briefs from each board — the brief-writer update that starts with "Department:" — preferring the
 * configured style authors (Lilian), varied by type. Cached 12h; if Monday is unavailable the writer just has none.
 */
async function styleExamples(config) {
  const authors = (config.tickets?.style_authors || []).map(String);
  return monday.cached('studio:tickets:style', 12 * 3600 * 1000, async () => {
    const out = {};
    for (const bk of ['video', 'design']) {
      const reqCol = FIELDS[bk].find(f => f.key === 'requested_by').col;
      const recent = async (rules) => {
        const d = await monday.mondayQuery(
          `query ($b: [ID!], $qp: ItemsQuery) { boards(ids: $b) { items_page(limit: 30, query_params: $qp) { items { id updates(limit: 6) { text_body creator { id } } } } } }`,
          { b: [String(config.boards[bk].board_id)], qp: { rules, order_by: [{ column_id: '__creation_log__', direction: 'desc' }] } }
        );
        return d?.boards?.[0]?.items_page?.items || [];
      };
      let items = [];
      try {
        if (authors.length) items = await recent([{ column_id: reqCol, compare_value: authors.map(a => `person-${a}`), operator: 'any_of' }]);
        if (items.length < 6) items = [...items, ...await recent([])];
      } catch { items = []; }
      const briefs = [];
      const seen = new Set();
      for (const it of items) {
        if (seen.has(it.id)) continue;
        seen.add(it.id);
        const ups = (it.updates || []).filter(u => BRIEF_RE.test(u.text_body || ''));
        const u = ups.find(x => authors.includes(String(x.creator?.id))) || ups[0];
        if (!u || u.text_body.length < 250) continue;
        const text = u.text_body.replace(/\n*📎 Reference files are attached[^\n]*/g, '').trim();
        const type = (text.match(/\|\s*Type:\s*([^|\n]+)/) || [])[1]?.trim() || '';
        briefs.push({ text: text.length > 3500 ? `${text.slice(0, 3500)}\n[…]` : text, type, mine: authors.includes(String(u.creator?.id)) });
      }
      // Lilian's first, a spread of types, newest first
      briefs.sort((a, b) => Number(b.mine) - Number(a.mine));
      const pick = [];
      for (const br of briefs) if (pick.length < 4 && !pick.some(p => p.type === br.type)) pick.push(br);
      for (const br of briefs) if (pick.length < 4 && !pick.includes(br)) pick.push(br);
      out[bk] = pick.map(p => p.text);
    }
    return out;
  });
}

function referenceBlock(examples) {
  const part = (bk, label) => (examples?.[bk]?.length
    ? `<${bk}_briefs>\n${examples[bk].map((t, i) => `<brief n="${i + 1}">\n${t}\n</brief>`).join('\n')}\n</${bk}_briefs>` : '');
  const body = [part('video'), part('design')].filter(Boolean).join('\n');
  return body ? `<reference_briefs>\nRecent real briefs from the team — imitate their style, never their facts.\n${body}\n</reference_briefs>` : '';
}

async function draftTicket({ form, messages, draft, board, userName, config }) {
  const client = getAnthropic();
  const refs = config ? referenceBlock(await styleExamples(config).catch(() => null)) : '';
  const context = {
    today: W.localDate(Date.now()),
    today_weekday: new Date().toLocaleDateString('en-US', { weekday: 'long', timeZone: 'Asia/Jerusalem' }),
    you_are_talking_to: userName || null,
    current_board: board || null,
    current_draft: draft || emptyFields(),
    boards: Object.fromEntries(Object.entries(form.boards).map(([k, b]) => [k, b.fields.map(f => ({ key: f.key, label: f.label, required: f.required, type: f.type, options: f.options }))])),
  };
  const convo = (messages || []).slice(-20).map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content || '').slice(0, 8000) }))
    .filter(m => m.content);
  if (!convo.length || convo[convo.length - 1].role !== 'user') throw Object.assign(new Error('Say what the ticket is about'), { status: 400 });
  convo[convo.length - 1] = { role: 'user', content: `${convo[convo.length - 1].content}\n\n<context>${JSON.stringify(context)}</context>` };

  const stream = client.beta.messages.stream({
    model: MODEL,
    max_tokens: 6000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'low', format: { type: 'json_schema', schema: DRAFT_SCHEMA } },
    system: [{ type: 'text', text: refs ? `${SYSTEM}\n\n${refs}` : SYSTEM, cache_control: { type: 'ephemeral' } }],
    messages: convo,
  });
  const msg = await stream.finalMessage();
  if (msg.stop_reason === 'refusal') throw new Error('Claude declined this request');
  if (msg.stop_reason === 'max_tokens') throw new Error('The draft was cut off — try a shorter message');
  const text = (msg.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
  let out;
  try { out = JSON.parse(text); } catch { throw new Error('Claude returned an unreadable draft — try again'); }
  out.fields = sanitize(form, out.board, out.fields);
  out.missing = missingRequired(form, out.board, out.fields);
  out.ready = !out.missing.length;
  return out;
}

// Option matching ignores case, curly quotes and spacing ("Creators Oct ’26" = "creators oct '26")
const canon = (x) => String(x || '').toLowerCase().replace(/[’‘`´]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, ' ').trim();

/** Keep only valid option values, so nothing invalid can reach Monday (free fields keep new names for the name + brief). */
function sanitize(form, board, fields) {
  const def = form.boards[board];
  const out = emptyFields();
  for (const f of def?.fields || []) {
    const v = fields?.[f.key];
    const pick = (x) => f.options?.find(o => canon(o) === canon(x)) || null;
    const free = (x) => String(x || '').replace(/[|/]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60) || null;
    if (f.type === 'status') out[f.key] = pick(v) || '';
    else if (f.type === 'dropdown' || f.type === 'people') out[f.key] = [...new Set((Array.isArray(v) ? v : v ? [v] : []).map(x => pick(x) || (f.free ? free(x) : null)).filter(Boolean))];
    else if (f.type === 'date') out[f.key] = /^\d{4}-\d{2}-\d{2}$/.test(v || '') ? v : '';
    else if (f.type === 'number') out[f.key] = v === '' || v == null || Number.isNaN(Number(v)) ? '' : String(Number(v));
    else out[f.key] = String(v || '').replace(f.key === 'task_name' ? /\//g : /$^/, ' ').slice(0, f.type === 'long_text' ? 6000 : 300).trim();
  }
  return out;
}

function missingRequired(form, board, fields) {
  return (form.boards[board]?.fields || []).filter(f => f.required && !(Array.isArray(fields[f.key]) ? fields[f.key].length : fields[f.key])).map(f => f.key);
}

/** Monday item name the way the brief-writer composed it: "Product | Campaign | Platform | AI tool | Task name". */
function itemName(fields) {
  const ai = fields.ai_assist && !/^(none|no|-)$/i.test(fields.ai_assist) ? fields.ai_assist : null;
  const platform = fields.platform && !/^(other|-)$/i.test(fields.platform) ? fields.platform : null;
  return [fields.product, fields.campaign?.[0], platform, ai, fields.task_name].filter(Boolean).join(' | ').replace(/\//g, ' ').slice(0, 255);
}

const lines = (v) => String(v || '').split('\n').map(l => l.replace(/^\s*(\d+[.)]|[-•*])\s*/, '').trim()).filter(Boolean);

/** The brief in the brief-writer's format: one header line, then underlined sections (same as the team's briefs). */
function briefText(board, f) {
  const list = (v) => (Array.isArray(v) ? v.join(', ') : v);
  const header = (board === 'video' ? [
    ['Department', f.department], ['Product', f.product], ['Platform', f.platform], ['Type', f.type], ['Campaign', list(f.campaign)],
    ['Requestor', list(f.requested_by)], ['Editor / Designer', list(f.assignee)], ['Versions Needed', f.versions], ['Priority', f.priority],
    ['Sizes Needed', list(f.sizes)], ['Deadline', f.deadline], ['Est. Duration', f.duration && `${f.duration} sec`],
  ] : [
    ['Department', f.department], ['Product / Bundle', f.product], ['Platform', f.platform], ['Campaign', list(f.campaign)],
    ['Requestor', list(f.requested_by)], ['Editor / Designer', list(f.assignee)], ['Priority', f.priority], ['Amount of Versions', f.versions],
    ['Sizes', [list(f.sizes), f.other_sizes].filter(Boolean).join(', ')], ['Website task', f.website_task], ['Deadline', f.deadline],
  ]).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join(' | ');
  const section = (title, body) => (body ? `${title}\n${'-'.repeat(title.length)}\n\n${body}` : '');
  const hooks = lines(f.hook);
  return [
    header,
    section(board === 'video' ? 'Video Concept' : 'Concept / Idea', f.concept),
    board === 'video' && section('Hook Variations', hooks.map((h, i) => `${i + 1}. ${h}`).join('\n\n')),
    board === 'video' && section('Script / Message', f.script),
    board === 'design' && section('Supporting Text', f.supporting_text),
  ].filter(Boolean).join('\n\n');
}

/** Create the ticket on Monday (after the user approved it in the UI). */
async function submitTicket({ config, form, board, fields, people, user, conversation }) {
  const def = form.boards[board];
  if (!def) throw Object.assign(new Error('Unknown board'), { status: 400 });
  const clean = sanitize(form, board, fields);
  const missing = missingRequired(form, board, clean);
  if (missing.length) throw Object.assign(new Error(`Missing: ${missing.join(', ')}`), { status: 400 });
  const byName = (pool, name) => (people[pool] || []).find(p => p.name === name)?.id;
  const values = {};
  for (const f of FIELDS[board]) {
    const v = clean[f.key];
    if (!f.col || v === '' || (Array.isArray(v) && !v.length)) continue;
    if (f.type === 'status') values[f.col] = { label: v };
    else if (f.type === 'dropdown') {
      // Only labels Monday already has (a new campaign lives in the name and brief until it's added there)
      const known = v.filter(x => def.fields.find(d => d.key === f.key)?.options?.includes(x));
      if (known.length) values[f.col] = { labels: known };
    }
    else if (f.type === 'people') {
      const ids = v.map(n => byName(f.pool, n)).filter(Boolean);
      if (ids.length) values[f.col] = { personsAndTeams: ids.map(id => ({ id: Number(id), kind: 'person' })) };
    } else if (f.type === 'date') values[f.col] = { date: v };
    else if (f.write === 'first_line') values[f.col] = lines(v)[0] || '';
    else if (f.type === 'long_text') values[f.col] = { text: v };
    else if (f.type === 'number') values[f.col] = String(v);
    else values[f.col] = v;
  }
  const name = itemName(clean);
  const item = await createItem({ boardId: config.boards[board].board_id, groupId: FORM_GROUP, name, columnValues: values });
  if (!item?.id) throw new Error('Monday did not return the new item');
  // Same shape as the team's briefs (starts with "Department:"); who wrote it goes at the end
  const html = briefText(board, clean).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\n/g, '<br>');
  try { await addUpdate(item.id, `${html}<br><br><em>— brief from CP Studio, by ${(user?.name || 'the studio').replace(/</g, '&lt;')}</em>`); } catch { /* the item exists; the update is a nicety */ }
  try {
    await db.query(
      `INSERT INTO studio_tickets (board, item_id, item_url, name, fields, conversation, created_by_name) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [board, String(item.id), item.url || null, name, JSON.stringify(clean), JSON.stringify((conversation || []).slice(-30)), user?.name || user?.email || null]
    );
  } catch { /* history is best-effort */ }
  return { id: String(item.id), url: item.url || null, name };
}

async function recentTickets(limit = 20) {
  try {
    const { rows } = await db.query('SELECT board, item_id, item_url, name, created_by_name, created_at FROM studio_tickets ORDER BY created_at DESC LIMIT $1', [limit]);
    return rows;
  } catch { return []; }
}

module.exports = { ticketForm, draftTicket, submitTicket, recentTickets, itemName, sanitize, briefText, styleExamples, FIELDS, emptyFields };
