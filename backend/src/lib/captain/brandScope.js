/**
 * Which Brain items hold for every brand and which for one (Tomer, 12 Nov 2026: "make captain smart and know which
 * comments are relevant to all brands and which only for specific ones").
 *
 * The Brain was learned mostly from Particle ads, with only Particle / Ashford / "any" to choose from: house style
 * ("Proofread every bottle label", "under eye → under-eye") got tagged Particle — so Clearstep and Biomella ads never
 * saw it — and "not a typo" feedback from Biomella ads landed as "all brands". sortBrands() asks the model, item by
 * item, with the same rule of thumb the history learner now uses; nothing changes until an admin applies a proposal.
 */
const db = require('../../db');
const { getConfig } = require('./config');
const { brandOf } = require('./brand');
const { getAnthropic } = require('../anthropic');

const MODEL = 'claude-sonnet-5-5';
const BATCH = 50;
const TYPES = ['term', 'rule', 'learned', 'insight', 'do_not_flag', 'claim'];

/** The rule of thumb for "one brand" vs "every brand" — shared with the history learner (pure — tested). */
function brandGuide(brands) {
  const list = (brands || []).map(b => `- ${b.name}${b.default ? ' (the house brand)' : ''}: ${b.about}`).join('\n');
  return `The studio makes ads for several brands:\n${list}
An item is for ONE brand only when it can only be true for that brand: its product, ingredient, campaign or bundle names; its prices, offers and discount codes; its claims and numbers (customers, reviews, studies); its URLs and CTA wording; its audience; its look (colours, logo, fonts, packaging); its tone; or a line of its ad copy kept on purpose.
An item is for EVERY brand ("any") when it is house style or craft that holds whatever the brand, even if it was learned on one brand's ad: spelling of ordinary words, grammar, punctuation, capitalisation, hyphenation, number and price formatting, legibility, subtitles, layout, editing, pacing, product shots and casting in general, compliance in general. A general rule that names one brand only as an example ("never split 'Particle Neck Cream' across frames") is still "any".`;
}

const schemaFor = (names) => ({
  type: 'object', additionalProperties: false, required: ['items'],
  properties: { items: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['id', 'brand', 'why'],
    properties: { id: { type: 'integer' }, brand: { type: 'string', enum: [...names, 'any'] }, why: { type: 'string' } } } } },
});

const clip = (s, n) => { const t = String(s || '').replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };

/** One input line per item: its id, type, current brand, which brand's ad it came from (when known) (pure — tested). */
function itemLine(r, cfg) {
  const now = r.scope?.brand || 'any';
  const from = r.item_name ? ` | learned on a ${brandOf({ itemName: r.item_name, product: r.check_product }, cfg).name} ad` : '';
  const prods = [].concat(r.scope?.product || []).filter(Boolean);
  return `${r.id}. [${r.type} | now: ${now}${prods.length ? ` | products: ${prods.join('/')}` : ''}${from}] ${clip(r.title, 160)} — ${clip(r.content, 320)}`;
}

/** Proposals = the model's answer where it differs from today (pure — tested). */
function proposalsFrom(rows, answers, names) {
  const byId = new Map(rows.map(r => [Number(r.id), r]));
  const out = [];
  for (const a of answers || []) {
    const r = byId.get(Number(a.id));
    if (!r || !(names.includes(a.brand) || a.brand === 'any')) continue;
    const from = r.scope?.brand || 'any';
    if (from === a.brand) continue;
    out.push({ id: Number(r.id), type: r.type, title: r.title, status: r.status, from, to: a.brand, why: clip(a.why, 220) });
  }
  return out;
}

async function loadItems() {
  const { rows } = await db.query(
    `SELECT b.id, b.type, b.title, b.content, b.scope, b.status, c.item_name, c.product AS check_product
       FROM captain_brain b
       LEFT JOIN captain_checks c ON c.id::text = b.evidence->>'check_id'   -- the ad a "not a typo" came from
      WHERE b.active AND b.status IN ('approved', 'pending') AND b.type = ANY($1::text[])
      ORDER BY b.id`, [TYPES]);
  return rows;
}

/** Ask the model about every item (runs on the captain-worker: job "brain_brand_sort"). → { items, proposals, cost_usd } */
async function sortBrands() {
  const cfg = await getConfig();
  const names = cfg.brands.map(b => b.name);
  const rows = await loadItems();
  const system = `You sort the "Brain" of Captain Caption, a bot that proofreads ads, by brand.\n\n${brandGuide(cfg.brands)}\n\nFor every input item answer its brand: one of ${names.map(n => `"${n}"`).join(', ')}, or "any". Keep today's answer unless it is clearly wrong. why = a few words.`;
  const answers = [];
  let cost = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const part = rows.slice(i, i + BATCH);
    const msg = await getAnthropic().beta.messages.stream({
      model: MODEL, max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default',
      output_config: { effort: 'low', format: { type: 'json_schema', schema: schemaFor(names) } },
      system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: part.map(r => itemLine(r, cfg)).join('\n') }],
    }, { maxRetries: 1 }).finalMessage();
    const u = msg.usage || {};
    cost += ((u.input_tokens || 0) * 2 + (u.cache_read_input_tokens || 0) * 0.2 + (u.cache_creation_input_tokens || 0) * 2.5 + (u.output_tokens || 0) * 10) / 1e6;
    try { answers.push(...JSON.parse((msg.content || []).filter(b => b.type === 'text').map(b => b.text).join('')).items); } catch { /* a part that didn't parse just has no proposals */ }
  }
  return { items: rows.length, proposals: proposalsFrom(rows, answers, names), cost_usd: Math.round(cost * 10000) / 10000, at: new Date().toISOString() };
}

/** Apply the proposals an admin ticked: [{ id, brand }] (brand "any" = every brand). → { changed } */
async function applyBrands(changes, actor) {
  const cfg = await getConfig();
  const names = cfg.brands.map(b => b.name);
  let changed = 0;
  for (const c of (changes || []).slice(0, 500)) {
    const brand = String(c?.brand || '');
    if (!(names.includes(brand) || brand === 'any')) continue;
    const { rows } = await db.query('SELECT * FROM captain_brain WHERE id = $1', [Number(c.id)]);
    const before = rows[0];
    if (!before) continue;
    const scope = { ...(before.scope || {}) };
    if (brand === 'any') delete scope.brand; else scope.brand = brand;
    const after = (await db.query('UPDATE captain_brain SET scope = $2 WHERE id = $1 RETURNING *', [before.id, JSON.stringify(scope)])).rows[0];
    await db.query('INSERT INTO captain_brain_history (brain_id, action, before, after, actor) VALUES ($1, $2, $3, $4, $5)',
      [before.id, 'update', JSON.stringify(before), JSON.stringify(after), actor]);
    changed++;
  }
  return { changed };
}

/** What's still to decide from the last sort: proposals whose item still has the old brand. */
async function pending(result) {
  const props = result?.proposals || [];
  if (!props.length) return [];
  const { rows } = await db.query('SELECT id, scope, active FROM captain_brain WHERE id = ANY($1::int[])', [props.map(p => p.id)]);
  const now = new Map(rows.map(r => [r.id, r]));
  return props.filter(p => { const r = now.get(p.id); return r && r.active && (r.scope?.brand || 'any') === p.from; });
}

module.exports = { brandGuide, itemLine, proposalsFrom, sortBrands, applyBrands, pending, TYPES };
