// Tickets by product, week by week (Tomer, 24 Nov 2026: "they should be able to see tickets by product per week —
// video and design — so they know which tickets are on the way to Meta and which not").
// Pure (no React, no JSX) so it can be tested from node.
//
// A ticket belongs to the week of its delivery date: the end of its Monday timeline, else its deadline, else the
// timeline's start. Weeks run Sunday → Saturday, like the rest of the studio. Open tickets dated before the first week
// are "Overdue"; open tickets with no date at all are "No date". Finished tickets only count inside the weeks shown.

const addDays = (s, n) => { const d = new Date(`${s}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const sundayOf = (s) => addDays(s, -new Date(`${s}T12:00:00Z`).getUTCDay());

/** Meta = Meta / Facebook / Instagram on the Platform column. */
export const isMeta = (platform) => /\b(meta|facebook|instagram|fb|ig)\b/i.test(String(platform || ''));

/** The day a ticket is due (YYYY-MM-DD) or null. */
export function dueOf(it) {
  const d = it?.timeline?.to || it?.deadline || it?.timeline?.from || null;
  return d ? String(d).slice(0, 10) : null;
}

export const NO_PRODUCT = 'No product';

/**
 * items: the studio's tasks. Returns
 *   { cols: [{ key, kind: 'late'|'week'|'none', from? }], rows: [{ label, color, total, cells: { [col]: { video: [], design: [] } } }],
 *     totals: { [col]: { video, design, meta, done } }, noPlatform }
 */
export function productWeeks(items, { start, weeks = 4, board = 'all', platform = 'all' } = {}) {
  const first = sundayOf(start);
  const weekKeys = Array.from({ length: weeks }, (_, i) => addDays(first, 7 * i));
  const end = addDays(first, 7 * weeks);   // exclusive
  const rows = new Map();
  const totals = {};
  let late = false, none = false, noPlatform = 0;

  for (const it of items || []) {
    if (it.board !== 'video' && it.board !== 'design') continue;
    if (board !== 'all' && it.board !== board) continue;
    const meta = isMeta(it.platform);
    if (platform === 'meta' && !meta) continue;
    if (platform === 'other' && meta) continue;
    const open = it.status?.category !== 'delivered';
    const due = dueOf(it);
    let col;
    if (!due) { if (!open) continue; col = 'none'; none = true; }
    else if (due < first) { if (!open) continue; col = 'late'; late = true; }
    else if (due >= end) continue;
    else col = sundayOf(due);

    const label = it.product?.label && it.product.label !== '-' ? it.product.label : NO_PRODUCT;
    const row = rows.get(label) || { label, color: label === NO_PRODUCT ? '#c4c4c4' : (it.product?.color || '#579bfc'), total: 0, cells: {} };
    const cell = row.cells[col] || (row.cells[col] = { video: [], design: [] });
    cell[it.board].push(it);
    row.total++;
    rows.set(label, row);

    const t = totals[col] || (totals[col] = { video: 0, design: 0, meta: 0, done: 0 });
    t[it.board]++;
    if (meta) t.meta++;
    if (!open) t.done++;
    if (!String(it.platform || '').trim()) noPlatform++;
  }

  const cols = [
    ...(late ? [{ key: 'late', kind: 'late' }] : []),
    ...weekKeys.map(k => ({ key: k, kind: 'week', from: k })),
    ...(none ? [{ key: 'none', kind: 'none' }] : []),
  ];
  const sorted = [...rows.values()].sort((a, b) => (a.label === NO_PRODUCT) - (b.label === NO_PRODUCT) || b.total - a.total || a.label.localeCompare(b.label));
  for (const r of sorted) for (const c of Object.values(r.cells)) for (const k of ['video', 'design']) c[k].sort((a, b) => String(dueOf(a) || '9').localeCompare(String(dueOf(b) || '9')));
  return { cols, rows: sorted, totals, noPlatform };
}
