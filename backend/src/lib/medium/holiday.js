/**
 * MEDIUM — Holiday Builder (spec §17): one setup → the whole ticket matrix, in house style.
 *   statics      = products × static templates × tiers
 *   videos       = products × video templates
 *   GIFs         = products × tiers            (from approved "Extra" statics)
 *   iMessage     = products                    (top tier)
 *   translations = products                    (Hero only; one ticket holds every language)
 *   remarketing  = products
 * Parents are written by the normal Medium pipeline (writer → style → score → Captain). Derivatives are proposed only
 * after their parent is approved, as Lilian's one-sentence briefs — no AI needed.
 */
const db = require('../../db');
const { enqueue } = require('../captain/queue');

const STATIC_TEMPLATES = ['Hero', 'Extra / Stock-Up', 'Receipt Vertical', 'Price Drop', 'Her Note', 'Gift Search Bar'];
const VIDEO_TEMPLATES = ['Three Quick Reasons', 'Her Shopping Trip', 'Static → Motion'];
const LANGS = ['Hebrew', 'French', 'Spanish', 'Italian'];
const money = (n) => `$${Number(n).toFixed(2)}`;
const EST = { parent: 0.08, derivative: 0 };   // USD per brief (writer + score + Captain); derivatives are templated

/** Price line for a product at a tier: list × (1 − tier), or [PRICE] when the list price isn't in the Brain. Pure. */
function priceMath(product, tier, prices = []) {
  const p = prices.find(x => String(x.title).toLowerCase() === String(product).toLowerCase() || (x.data?.aliases || []).some(a => String(a).toLowerCase() === String(product).toLowerCase()));
  const list = Number(p?.data?.list_price);
  if (!list) return { product, tier, list: null, sale: null, text: `[PRICE] — add ${product}'s list price in Captain → Brain → Price list` };
  const sale = Math.round(list * (100 - tier)) / 100;
  return { product, tier, list, sale, text: `${money(list)} → ${money(sale)} (${tier}% off)` };
}

const year = (iso) => String(iso || new Date().toISOString()).slice(0, 4);
const name = (product, holiday, template, tier, suffix = '') => `${product} | ${holiday} | Meta | Medium | ${template}${tier ? ` ${tier}` : ''}${suffix ? ` ${suffix}` : ''}`;

/**
 * The matrix for a setup (pure — tested). setup: { holiday, starts, ends, lanes[], tiers: [{ tier, code }], products[],
 * static_templates[], video_templates[], derivatives: { gif, imessage, translations, remarketing } }.
 */
function planHoliday(setup, { prices = [] } = {}) {
  const holiday = String(setup.holiday || '').trim() || 'Holiday';
  const label = /\d{4}/.test(holiday) ? holiday : `${holiday} ${year(setup.ends)}`;
  const tiers = (setup.tiers || []).map(t => ({ tier: Math.round(Number(t.tier)), code: String(t.code || '').trim().toUpperCase() || null })).filter(t => t.tier > 0 && t.tier < 100);
  const products = [...new Set((setup.products || []).map(p => String(p).trim()).filter(Boolean))];
  const statics = (setup.static_templates || []).filter(Boolean);
  const videos = (setup.video_templates || []).filter(Boolean);
  const lanes = (setup.lanes || ['Particle']).filter(Boolean);
  const d = setup.derivatives || {};
  const parents = [];
  for (const lane of lanes) {
    for (const product of products) {
      for (const template of statics) {
        for (const t of tiers.length ? tiers : [{ tier: null, code: null }]) {
          parents.push({ kind: 'static', lane, product, template, tier: t.tier, code: t.code, format: 'design', ticket_name: name(product, label, template, t.tier), price: t.tier ? priceMath(product, t.tier, prices) : null });
        }
      }
      for (const template of videos) {
        const top = tiers.slice().sort((a, b) => b.tier - a.tier)[0] || { tier: null, code: null };
        parents.push({ kind: 'video', lane, product, template, tier: top.tier, code: top.code, format: 'video', ticket_name: name(product, label, template, top.tier), price: top.tier ? priceMath(product, top.tier, prices) : null });
      }
    }
  }
  const derivatives = [];
  for (const product of products) {
    if (d.gif) for (const t of tiers) derivatives.push({ kind: 'gif', product, tier: t.tier, from: 'Extra / Stock-Up' });
    if (d.imessage && tiers.length) derivatives.push({ kind: 'imessage', product, tier: Math.max(...tiers.map(t => t.tier)), from: 'Extra / Stock-Up' });
    if (d.translations) derivatives.push({ kind: 'translation', product, from: 'Hero' });
    if (d.remarketing) derivatives.push({ kind: 'remarketing', product, from: 'Hero' });
  }
  return {
    holiday: label, starts: setup.starts || null, ends: setup.ends || null, lanes, tiers, products,
    parents, derivatives, flags: { gif: !!d.gif, imessage: !!d.imessage, translations: !!d.translations, remarketing: !!d.remarketing }, counts: { statics: parents.filter(p => p.kind === 'static').length, videos: parents.filter(p => p.kind === 'video').length, derivatives: derivatives.length },
    prices: products.flatMap(p => tiers.map(t => priceMath(p, t.tier, prices))),
    est_cost: Math.round(parents.length * EST.parent * 100) / 100,
  };
}

/** The holiday note every parent brief carries to the writer (the rules the builder enforces, §17.1). */
function holidayNote(plan, p) {
  return [
    `${plan.holiday} sale${plan.starts ? ` ${plan.starts} → ${plan.ends}` : ` ends ${plan.ends}`}. Named template: ${p.template}.`,
    p.code ? `Code ${p.code} and the end date go on every version and size ("USE CODE: ${p.code}").` : 'The end date goes on every version and size.',
    p.price ? `Price math, written exactly: ${p.price.text}.` : null,
    'Theme alone doesn’t sell — give it a product benefit or a gift job. Recreate last holiday’s winning layout first, then adapt.',
    p.kind === 'video' && p.template === 'Static → Motion' ? 'Animate the approved hero static: same copy and layout, elements animate in, music, ~6–8 seconds.' : null,
  ].filter(Boolean).join(' ');
}

/** Queue the parent briefs through the normal writer. Returns { batch_id, ids }. */
async function generateParents(plan, { actor }) {
  const batch = require('crypto').randomUUID();
  const ids = [];
  for (const p of plan.parents) {
    const request = {
      lane: p.lane, format: p.format, move: 'NEW_ANGLE', kind: p.format === 'design' ? 'template_swap' : 'original', product: p.product, template: p.template,
      campaign: plan.holiday, offer: p.tier ? { tier: p.tier, code: p.code, ends: plan.ends } : null, note: holidayNote(plan, p), ticket_hint: p.ticket_name,
      author: actor, batch_id: null, holiday_batch: batch, holiday_plan: { derivatives: plan.flags },
      holiday: { name: plan.holiday, starts: plan.starts, ends: plan.ends, template: p.template, tier: p.tier, code: p.code },
    };
    const { rows } = await db.query(
      `INSERT INTO medium_briefs (status, source, author, lane, product, format, move, request) VALUES ('QUEUED', 'holiday', $1, $2, $3, $4, 'NEW_ANGLE', $5) RETURNING id`,
      [actor, p.lane, p.product, p.format, JSON.stringify(request)]);
    ids.push(rows[0].id);
    await enqueue('medium_generate', { brief_id: rows[0].id }, { dedupeKey: `medium_generate:${rows[0].id}`, priority: 7, maxAttempts: 1 });
  }
  return { batch_id: batch, ids };
}

/** Lilian's one-sentence derivative briefs (house style §3), built from an approved parent. Pure — tested. */
function derivativeBrief(kind, parent) {
  const link = parent.monday_item_id ? `https://particle-for-men.monday.com/boards/8036329818/pulses/${parent.monday_item_id}` : '[PARENT TICKET LINK]';
  const base = String(parent.ticket_name || '').replace(/\s*\|\s*Medium\s*\|/i, ' |').trim();
  const h = parent.request?.holiday || {};
  const shared = { why: `Derivative of the approved parent “${parent.ticket_name}”.`, donts: ['Don’t change the approved copy or layout'], copy: '', hook: '' };
  if (kind === 'gif') return { format: 'video', kind: 'static_gif', ticket_name: `${base} GIF`, fields: { ...shared, brief: `Turn the approved ${h.template || 'Extra'} ${h.tier ? `${h.tier} ` : ''}static into a GIF design: ${link} — keep the layout and copy as designed, animate the elements in, and add the CTA. ~5 seconds, seamless loop, no sound. Sizes 4×5 and 9×16, export as MP4 and GIF.`, test: 'Format only — GIF vs the static, same copy. Win = CTR above the static at $1k spend.', sizes: ['4x5', '9x16'], duration: 5, video_type: 'GIF - Existing Static' } };
  if (kind === 'imessage') return { format: 'video', kind: 'static_gif', ticket_name: `${base} iMessage GIF`, fields: { ...shared, brief: `Turn the approved ${h.template || 'Extra'} ${h.tier ? `${h.tier} ` : ''}static into an iMessage-style GIF: ${link} — the offer arrives as a text-message bubble, then the product and code. Keep the approved copy, ~6 seconds, seamless loop, no sound. Sizes 4×5 and 9×16, export as MP4 and GIF.`, test: 'Format only — iMessage GIF vs the static. Win = CTR above the static at $1k spend.', sizes: ['4x5', '9x16'], duration: 6, video_type: 'GIF - Existing Static' } };
  if (kind === 'translation') return { format: 'design', kind: 'translation', ticket_name: `${base} Translations`, fields: { ...shared, brief: `Please translate the approved Hero static into ${LANGS.join(', ')}: ${link} — keep the layout exactly. Percentage only, no currency or prices in any language. One ticket holds every language. Sizes 4×5 · 1×1 · 9×16.`, test: 'Market only — same creative per language. Win = ROAS in line with the English hero at $1k spend per market.', sizes: ['4x5', '1x1', '9x16'], donts: ['No currency symbols or prices in translations', 'Don’t change the layout'] } };
  return { format: 'design', kind: 'template_swap', ticket_name: `${base} Remarketing`, fields: { ...shared, brief: `Copy the layout of the approved Hero static exactly: ${link} — swap the headline for warm audiences who visited but didn’t buy (a reminder that the sale ends ${h.ends || 'soon'}, the code${h.code ? ` ${h.code}` : ''} and the guarantee). Designer’s choice on the background tone. Sizes 4×5 · 1×1 · 9×16.`, test: 'Audience only — remarketing headline vs the hero, same layout. Win = CPA below the hero at $1k spend.', sizes: ['4x5', '1x1', '9x16'] } };
}

/** For a holiday batch: propose the derivatives whose parent is approved or on Monday (once each). */
async function proposeDerivatives(batchId, { actor }) {
  const { rows } = await db.query(`SELECT * FROM medium_briefs WHERE request->>'holiday_batch' = $1 ORDER BY created_at`, [batchId]);
  const parents = rows.filter(b => b.source === 'holiday' && ['APPROVED', 'SUBMITTED'].includes(b.status));
  const existing = new Set(rows.filter(b => b.source === 'derivative').map(b => `${b.request?.derivative_of}|${b.request?.derivative}`));
  const plan = rows.find(b => b.request?.holiday_plan)?.request?.holiday_plan || null;
  const wanted = plan?.derivatives || { gif: true, imessage: true, translations: true, remarketing: true };
  const made = [];
  for (const p of parents) {
    const h = p.request?.holiday || {};
    const kinds = [];
    if (/extra|stock/i.test(h.template || '')) { if (wanted.gif) kinds.push('gif'); if (wanted.imessage) kinds.push('imessage'); }
    if (/hero/i.test(h.template || '')) { if (wanted.translations) kinds.push('translation'); if (wanted.remarketing) kinds.push('remarketing'); }
    for (const k of kinds) {
      if (existing.has(`${p.id}|${k}`)) continue;
      const d = derivativeBrief(k, p);
      const { rows: r } = await db.query(
        `INSERT INTO medium_briefs (status, source, author, lane, product, format, move, kind, ticket_name, fields, lines, preflight, request, style)
         VALUES ('PENDING_REVIEW', 'derivative', $1, $2, $3, $4, 'TRANSFER_FORMAT', $5, $6, $7, $8, $9, $10, $11) RETURNING id`,
        [actor, p.lane, p.product, d.format, d.kind, d.ticket_name, JSON.stringify(d.fields), JSON.stringify(k === 'translation' ? [] : p.lines || []),
          JSON.stringify(p.preflight ? { ...p.preflight, note: 'Same copy as the approved parent' } : null),
          JSON.stringify({ holiday_batch: batchId, derivative_of: p.id, derivative: k, holiday: h }), JSON.stringify({ passed: true, failures: [], rewrites: 0, templated: true })]);
      made.push(r[0].id);
    }
  }
  return { proposed: made.length, ids: made, parents_ready: parents.length };
}

module.exports = { STATIC_TEMPLATES, VIDEO_TEMPLATES, priceMath, planHoliday, holidayNote, generateParents, derivativeBrief, proposeDerivatives };
