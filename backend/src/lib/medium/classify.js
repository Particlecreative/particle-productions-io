/**
 * MEDIUM — reading a past ticket: what kind of brief it is, which lane, which named template and persona, and
 * whether it belongs to a separate test brand (never learned from). Pure functions — backend/test/medium.test.js.
 */
const { laneOf } = require('../captain/brand');
const { DEFAULTS, TEMPLATES, PERSONAS } = require('./config');

const KINDS = ['original', 'reference_adaptation', 'template_swap', 'static_gif', 'creator_edit', 'new_hooks', 'translation'];
const KIND_LABEL = {
  original: 'Original concept', reference_adaptation: 'Reference adaptation', template_swap: 'Template swap', static_gif: 'Static → GIF',
  creator_edit: 'Creator edit', new_hooks: 'New hooks', translation: 'Translation',
};
const TOOL_TOKENS = ['Claude', 'ChatGPT', 'Upspring', 'Arcads', 'Higgsfield', 'Medium'];
const norm = (s) => String(s || '').toLowerCase();

/** The opening line says what kind of job this is (house style §3). */
function kindOf({ name = '', brief = '', script = '', copy = '', update = '' } = {}) {
  const n = norm(name), b = `${brief}\n${update}`, all = `${b}\n${script}\n${copy}`;
  if (/^\s*footage\s*:/im.test(b) || /\bcreator edit\b/i.test(name)) return 'creator_edit';
  // static → motion: "Turn the approved X static into a GIF", "Please turn assets into motion / stop motion"
  if (/\bgif\b/i.test(name) || /turn (the |this |these )?(approved )?.{0,60}into (an? )?(gif|motion|stop motion)|animate the elements in|turn (static|assets?) into/i.test(b)) return 'static_gif';
  if (/\b(additional|new|more) hooks\b|\bhooks for\b/i.test(`${name}\n${b}`)) return 'new_hooks';
  if (/\btranslat(e|ion|ed)\b/i.test(`${name}\n${b}`) || /\b(italian|arabic|hebrew|french|spanish|german) (version|copy|translation)\b/i.test(all)) return 'translation';
  // same layout, different product / season: "Copy the layout exactly…", "Same layout and fall background as the set…"
  if (/copy the layout exactly|swap the product|same layout,? (different|swap|new) product|same layout and .{0,40}as the set|^\s*swap\b|rework for .{0,40}swap/im.test(b)) return 'template_swap';
  // copy an outside or internal reference: "Please look at attached reference…", "REFERENCE — REPLICATE", "Copy the attached reference beat for beat",
  // "Same concept as reference…", "built on the … layout (reference: …)", "Reference: X. Match layout exactly."
  if (/please (look|see|check) at (the )?(attached )?reference|copy (its|the) (style|structure)|copy style,? apply to|^\s*reference\s*[—:-]+\s*(replicate|\S)|copy the (attached )?reference|same (concept|design|style) as (the )?reference|built on the .{0,60}layout \(reference|match (the )?layout exactly|adapt (the )?visual references?|similar .{0,40}to (the )?reference/im.test(b)) return 'reference_adaptation';
  if (n.includes('reference') && /copy/i.test(b)) return 'reference_adaptation';
  return 'original';
}

/** The separate test brand a ticket belongs to (Ashford, Levitas…), or null. "Test Product" is not a brand signal. */
function testBrandOf({ name = '', campaign = '', product = '', brandColumn = '' } = {}, registry = DEFAULTS.test_brands) {
  const hay = norm(`${name} | ${campaign}`);
  for (const b of registry || []) {
    if ((b.tokens || []).some(t => new RegExp(`(^|[^a-z])${t.toLowerCase()}([^a-z]|$)`).test(hay))) return b.name;
    if ((b.campaigns || []).some(c => hay.includes(c.toLowerCase()))) return b.name;
    if ((b.products || []).some(p => norm(product) === p.toLowerCase() || hay.includes(p.toLowerCase()))) return b.name;
  }
  const bc = String(brandColumn || '').trim();
  if (bc && !/^particle/i.test(bc)) return bc;
  return null;
}

/** Empty or "see reference" briefs teach nothing. */
function isThin({ brief = '', script = '', copy = '', update = '' } = {}, minChars = DEFAULTS.corpus.thin_chars) {
  const text = [brief, script, copy, update].map(s => String(s || '').trim()).join(' ').trim();
  if (!text) return true;
  if (/^(tbd|-+|n\/a|see (the )?(reference|attached|ref)\.?|as discussed\.?)$/i.test(text)) return true;
  return text.replace(/https?:\/\/\S+/g, '').trim().length < minChars;
}

function templateOf(text, templates = TEMPLATES.map(([name, , , match]) => ({ name, match }))) {
  const t = norm(text);
  const hit = templates.find(x => (x.match || []).some(m => t.includes(m.toLowerCase())));
  return hit ? hit.name : null;
}

function personaOf(name) {
  const n = String(name || '');
  return PERSONAS.find(p => new RegExp(`(^|[^A-Za-z])${p}([^A-Za-z]|$)`).test(n)) || null;
}

function toolTokensOf(name) {
  const segs = String(name || '').split('|').map(s => s.trim().toLowerCase());
  return TOOL_TOKENS.filter(t => segs.some(s => s === t.toLowerCase() || s.startsWith(`${t.toLowerCase()} `)));
}

/** Everything Medium needs from one ticket. */
function classifyTicket(t, cfg = DEFAULTS) {
  const text = [t.brief, t.script, t.copy, t.update].filter(Boolean).join('\n');
  const testBrand = testBrandOf({ name: t.name, campaign: t.campaign, product: t.product, brandColumn: t.brandColumn }, cfg.test_brands);
  const thin = isThin(t, cfg.corpus?.thin_chars);
  return {
    kind: kindOf(t),
    lane: laneOf({ names: [t.name, t.campaign], text }).name,
    template: templateOf(`${t.name}\n${text}`),
    persona: personaOf(t.name),
    tool_tokens: toolTokensOf(t.name),
    excluded: !!testBrand || thin,
    exclude_reason: testBrand ? `Test brand: ${testBrand}` : thin ? 'Thin brief' : null,
  };
}

module.exports = { KINDS, KIND_LABEL, kindOf, testBrandOf, isThin, templateOf, personaOf, toolTokensOf, classifyTicket };
