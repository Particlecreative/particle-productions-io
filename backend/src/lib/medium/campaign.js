/**
 * Every Medium ticket lands in a campaign (Tomer, 17 Nov 2026) — so it shows up in the Campaign Tracker, in its group,
 * the moment it reaches Monday. Monday's Campaign column takes one label; the ticket name follows Lilian's
 * "Product | Campaign | Meta | Name".
 * How a brief's campaign is chosen (first that applies):
 *   1. the one a person set (Holiday Builder, Freeform, or changed in the brief)
 *   2. Higgsfield drama → "Higgsfield Micro Dramas"
 *   3. a winning static turned into a video (headline → hook, static → video) → "Statics to Video"
 *   4. a named layout that is also a campaign ("5 Bucks. 5 Problems." → "5 Bucks 5 Problems")
 *   5. the Science For You lane → "Science For You"
 *   6. the concept family the brief is written in (Lilian's sets: Skeptic Videos, Wife Witness Statics…)
 *   7. otherwise "Medium Concepts"
 * Pure parts tested (test/medium.campaign.test.js).
 */
const HIGGSFIELD = 'Higgsfield Micro Dramas';
const STATICS_TO_VIDEO = 'Statics to Video';
const FALLBACK = 'Medium Concepts';

// Lilian's concept families (16 Nov 2026) — the label is "<Family> Videos" on the video board, "<Family> Statics" on design
const FAMILIES = [
  ['Skeptic', /skeptic|sceptic|didn'?t believe|\bdoubt/i],
  ['Proof-First', /proof[- ]first|\bproof\b|before[ -]?(and|&|\/)[ -]?after|\bb&a\b|side[- ]by[- ]side/i],
  ['Wife Witness', /\bwife\b|girlfriend|she noticed|\bhoney\b/i],
  ['Persona', /\bpersona\b|grandpa|golfer/i],
  ['Simplify', /simplif|\bsimple\b|one step|just swap/i],
  ['Comparison', /\bvs\.?\b|versus|comparison|\bcompare/i],
  ['Reaction', /\breact(ion|s|ing)?\b/i],
  ['Customer Call', /customer call|phone call|on the phone/i],
  ['CGI Mechanism', /\bcgi\b|mechanism/i],
  ['Unboxing', /unbox/i],
  ['Texture Opener', /texture/i],
  ['Long Form Explainer', /long[- ]form|explainer/i],
  ['Live Demo', /live demo|\bdemo\b/i],
  ['Montage', /montage/i],
  ['Customer Cut', /customer cut|testimonial/i],
  ['Timeline', /timeline|\b(day|week) \d+ to (day |week )?\d+/i],
  ['Product Motion', /product motion/i],
  ['Social Proof', /social proof|\breviews?\b|5[- ]star|five[- ]star/i],
  ['Sticky Note', /sticky note|post-it/i],
  ['Venn Diagram', /\bvenn\b/i],
];
const VIDEO_ONLY = new Set(['Reaction', 'Customer Call', 'CGI Mechanism', 'Unboxing', 'Texture Opener', 'Long Form Explainer', 'Live Demo', 'Montage', 'Customer Cut', 'Timeline', 'Product Motion']);
const STATIC_ONLY = new Set(['Social Proof', 'Sticky Note', 'Venn Diagram']);

const key = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
const same = (a, b) => { const x = key(a), y = key(b); return !!x && (x === y || x.replace(/s$/, '') === y.replace(/s$/, '')); };

/** The concept family a brief is written in: name hits count 3, hook 2, the rest 1; a tie goes to the one named first. */
function familyOf(b) {
  const f = b.fields || {};
  const format = b.format === 'design' ? 'design' : 'video';
  const name = String(b.ticket_name || '');
  const parts = [[name, 3], [f.hook, 2], [[f.brief, f.concept, f.script, f.copy, f.persona, f.template].filter(Boolean).join(' '), 1]];
  let best = null;
  for (const [fam, re] of FAMILIES) {
    if (format === 'design' ? VIDEO_ONLY.has(fam) : STATIC_ONLY.has(fam)) continue;
    let score = 0;
    for (const [text, w] of parts) if (text && re.test(String(text))) score += w;
    if (!score) continue;
    const at = name.search(re);
    const pos = at === -1 ? 9999 : at;
    if (!best || score > best.score || (score === best.score && pos < best.pos)) best = { fam, score, pos };
  }
  return best ? `${best.fam} ${format === 'design' ? 'Statics' : 'Videos'}` : null;
}

/**
 * The campaign for a brief → { name, why }. labels = the board's campaign labels (to use Monday's exact spelling
 * and to match a named layout). Never returns empty: every Medium ticket is in a campaign.
 */
function campaignFor(b, { labels = [] } = {}) {
  const spell = (n) => labels.find(l => same(l, n)) || n;
  const r = b.request || {};
  const f = b.fields || {};
  if (String(r.campaign || '').trim()) return { name: spell(String(r.campaign).trim()), why: r.campaign_by ? `set by ${r.campaign_by}` : 'set on the brief' };
  if (b.move === 'HIGGSFIELD_DRAMA') return { name: spell(HIGGSFIELD), why: 'a Higgsfield drama' };
  if (b.format !== 'design' && (b.move === 'HEADLINE_HOOK' || (b.move === 'TRANSFER_FORMAT' && (r.source_format === 'static' || r.source_format === 'design' || !r.source_format))))
    return { name: spell(STATICS_TO_VIDEO), why: 'a winning static turned into a video' };
  const layout = f.template && labels.find(l => same(l, f.template));
  if (layout) return { name: layout, why: `the “${f.template}” layout` };
  if (b.lane === 'SFY') return { name: spell('Science For You'), why: 'the Science For You lane' };
  const fam = familyOf(b);
  if (fam) return { name: spell(fam), why: 'the concept family it’s written in' };
  return { name: spell(FALLBACK), why: 'no family matched — Medium’s own concepts' };
}

/** Lilian's name: "Product | Campaign | Meta | Name" — the campaign goes second, a near-copy of it elsewhere is dropped. */
function withCampaign(name, campaign) {
  const parts = String(name || '').split('|').map(s => s.trim()).filter(Boolean);
  if (!campaign || !parts.length) return parts.join(' | ');
  const rest = parts.slice(1).filter(p => !same(p, campaign));
  return [parts[0], campaign, ...rest].join(' | ').slice(0, 255);
}

/**
 * Set the campaign on tickets Medium already created (the briefs approved before campaigns existed). Only fills an
 * empty Campaign column (never overwrites a person's choice), creates the label on that board when it's new, and
 * records it on the brief. Ticket names are left as they are (editors may be on them).
 */
async function backfill({ dry = false, only = null } = {}) {
  const db = require('../../db');
  const monday = require('../monday');
  const { BOARDS } = require('./config');
  const { boardLabels } = require('./monday');
  const { rows } = await db.query(`SELECT * FROM medium_briefs WHERE status = 'SUBMITTED' AND monday_item_id IS NOT NULL ${only ? 'AND id = ANY($1::uuid[])' : ''} ORDER BY created_at`, only ? [only] : []);
  const out = [];
  for (const b of rows) {
    const format = b.format === 'design' ? 'design' : 'video';
    const { board_id: boardId, columns } = BOARDS[format];
    const labels = (await boardLabels(boardId))[columns.campaign] || [];
    const c = campaignFor(b, { labels });
    const d = await monday.mondayQuery('query ($i: [ID!]) { items(ids: $i) { id name column_values(ids: ["' + columns.campaign + '"]) { text } } }', { i: [String(b.monday_item_id)] });
    const item = d?.items?.[0];
    const now = item?.column_values?.[0]?.text || '';
    const row = { brief: b.id, item: b.monday_item_id, name: item?.name || b.ticket_name, campaign: c.name, why: c.why, had: now || null, created_label: !labels.some(l => same(l, c.name)) };
    if (!item) { out.push({ ...row, result: 'ticket not found on Monday' }); continue; }
    if (now) { out.push({ ...row, result: 'already has a campaign — left alone' }); continue; }
    if (!dry) {
      await monday.mondayQuery(`mutation ($i: ID!, $b: ID!, $c: String!, $v: String!) { change_simple_column_value(item_id: $i, board_id: $b, column_id: $c, value: $v, create_labels_if_missing: true) { id } }`,
        { i: String(b.monday_item_id), b: String(boardId), c: columns.campaign, v: c.name });
      await db.query(`UPDATE medium_briefs SET request = COALESCE(request, '{}'::jsonb) || jsonb_build_object('campaign', $2::text, 'campaign_by', 'Medium (filled in later)'), updated_at = NOW() WHERE id = $1`, [b.id, c.name]);
    }
    out.push({ ...row, result: dry ? 'would set' : 'set' });
  }
  if (!dry) { monday.clearCache('studio:'); require('./monday').forgetLabels?.(); }
  return out;
}

module.exports = { campaignFor, familyOf, withCampaign, backfill, HIGGSFIELD, STATICS_TO_VIDEO, FALLBACK, FAMILIES, same };
