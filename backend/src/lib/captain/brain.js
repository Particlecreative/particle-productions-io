/**
 * Captain Caption's Brain → the text block added to his instructions at check time.
 * Only active + approved items; global ones plus those scoped to this item's product / campaign / department.
 * (He "learns" by remembering what the team teaches him — the model itself is never retrained.)
 */
const db = require('../../db');

const norm = (s) => String(s ?? '').trim().toLowerCase();

function matchesScope(scope, ctx) {
  if (!scope || !Object.keys(scope).length) return true;
  for (const key of ['product', 'campaign', 'department']) {
    const want = scope[key];
    if (!want || (Array.isArray(want) && !want.length)) continue;
    const list = (Array.isArray(want) ? want : [want]).map(norm);
    if (!list.includes(norm(ctx[key]))) return false;
  }
  return true;
}

async function loadBrain({ discipline, product = null, campaign = null, department = null } = {}) {
  const { rows } = await db.query(
    `SELECT id, type, title, content, discipline, scope FROM captain_brain
      WHERE active AND status = 'approved' AND discipline IN ($1, 'both') ORDER BY type, id`,
    [discipline],
  );
  const items = rows.filter(r => matchesScope(r.scope, { product, campaign, department }));
  const of = (t) => items.filter(i => i.type === t);
  return {
    items,
    terms: of('term'),
    doNotFlag: of('do_not_flag'),
    rules: [...of('rule'), ...of('learned')],
    insights: of('insight'),
    ids: items.map(i => i.id),
  };
}

function brainText(brain) {
  const lines = [];
  if (brain.terms.length) lines.push(`Approved terms — exact spelling, accents and capitalisation: ${brain.terms.map(t => t.title).join(', ')}`);
  if (brain.rules.length) {
    lines.push('House rules (from the team — always apply):');
    for (const r of brain.rules) lines.push(`- ${r.content || r.title}`);
  }
  if (brain.doNotFlag.length) {
    lines.push('Never report these (intentional):');
    for (const d of brain.doNotFlag) lines.push(`- ${d.title}${d.content ? ` — ${d.content}` : ''}`);
  }
  return lines.join('\n') || '(no Brain items yet)';
}

module.exports = { loadBrain, brainText, matchesScope };
