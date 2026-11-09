/**
 * Is a Monday item in the Captain's scope? Marketing/digital only — never TV.
 *   in scope  = department is allowed for the board, OR the title contains a keyword ("Meta") as a word
 *   never     = Department TV or Type TV (even with "Meta" in the title)
 * Pure: (item, config) → { ok, reason }. Every skip is logged with this reason.
 */
const norm = (s) => String(s ?? '').trim().toLowerCase();
const escapeRe = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function inScope({ discipline, department, type, title } = {}, config) {
  const sc = config.scope;
  if (department && sc.tv_departments.map(norm).includes(norm(department))) return { ok: false, reason: `TV project (Department: ${department})` };
  if (type && sc.tv_types.map(norm).includes(norm(type))) return { ok: false, reason: `TV project (Type: ${type})` };
  const allowed = (discipline === 'design' ? sc.design_departments : sc.video_departments).map(norm);
  if (department && allowed.includes(norm(department))) return { ok: true, reason: `Department: ${department}` };
  for (const kw of sc.title_keywords || []) {
    if (new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRe(kw)}($|[^\\p{L}\\p{N}])`, 'iu').test(String(title || ''))) return { ok: true, reason: `"${kw}" in the title` };
  }
  return { ok: false, reason: department ? `Out of scope (Department: ${department})` : 'Out of scope (no department set)' };
}

module.exports = { inScope };
