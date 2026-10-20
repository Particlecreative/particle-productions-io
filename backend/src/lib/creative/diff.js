/**
 * Snapshot diff for "Refresh live data": what changed since the deck was generated.
 */

const TRACKED_SECTIONS = ['delivered', 'in_progress', 'review', 'fixes', 'stuck', 'overdue', 'planned_next_week', 'reopened'];
const TRACKED_METRICS = ['delivered', 'video', 'design', 'in_progress', 'stuck', 'overdue', 'planned_next', 'people'];

function diffSnapshots(oldSnap = {}, newSnap = {}, overrides = {}) {
  const out = { sections: {}, items_changed: [], metrics: {}, people_added: [], people_removed: [], orphaned_overrides: [], cp_weekly_changed: false, summary: [] };

  for (const s of TRACKED_SECTIONS) {
    const a = new Set(oldSnap.sections?.[s] || []);
    const b = new Set(newSnap.sections?.[s] || []);
    const added = [...b].filter(id => !a.has(id));
    const removed = [...a].filter(id => !b.has(id));
    if (added.length || removed.length) out.sections[s] = { added, removed };
  }

  for (const [id, n] of Object.entries(newSnap.items || {})) {
    const o = oldSnap.items?.[id];
    if (!o) continue;
    const fields = [];
    if (o.status?.label !== n.status?.label) fields.push({ field: 'status', from: o.status?.label, to: n.status?.label });
    if ((o.delivered_at || null) !== (n.delivered_at || null)) fields.push({ field: 'delivered_at', from: o.delivered_at || null, to: n.delivered_at || null });
    if (o.title !== n.title) fields.push({ field: 'title', from: o.title, to: n.title });
    if (JSON.stringify(o.people) !== JSON.stringify(n.people)) fields.push({ field: 'people', from: o.people, to: n.people });
    if (fields.length) out.items_changed.push({ id, title: n.title, fields });
  }

  for (const k of TRACKED_METRICS) {
    const a = oldSnap.metrics?.totals?.[k];
    const b = newSnap.metrics?.totals?.[k];
    if (a !== b) out.metrics[k] = { from: a ?? null, to: b ?? null };
  }

  const op = new Set(Object.keys(oldSnap.people || {}));
  const np = new Set(Object.keys(newSnap.people || {}));
  out.people_added = [...np].filter(u => !op.has(u));
  out.people_removed = [...op].filter(u => !np.has(u));

  for (const id of Object.keys(overrides?.tickets || {})) {
    if (!newSnap.items?.[id]) out.orphaned_overrides.push({ kind: 'ticket', id });
  }
  for (const uid of Object.keys(overrides?.people || {})) {
    if (!newSnap.people?.[uid]) out.orphaned_overrides.push({ kind: 'person', id: uid });
  }

  out.cp_weekly_changed = (oldSnap.cp_weekly?.updated_at || null) !== (newSnap.cp_weekly?.updated_at || null);

  // Human summary
  const d = out.sections.delivered;
  if (d?.added?.length) out.summary.push(`${d.added.length} new deliver${d.added.length === 1 ? 'y' : 'ies'}`);
  if (d?.removed?.length) out.summary.push(`${d.removed.length} no longer delivered`);
  const st = out.sections.stuck;
  if (st?.added?.length) out.summary.push(`${st.added.length} moved to Stuck`);
  const nx = out.sections.planned_next_week;
  if (nx?.added?.length) out.summary.push(`${nx.added.length} newly planned for next week`);
  for (const k of ['video', 'design']) {
    const m = out.metrics[k];
    if (m) out.summary.push(`${k === 'video' ? 'Video' : 'Design'} ${m.from ?? 0}→${m.to ?? 0}`);
  }
  if (out.people_added.length) out.summary.push(`${out.people_added.length} new team member${out.people_added.length === 1 ? '' : 's'}`);
  if (out.cp_weekly_changed) out.summary.push('CP weekly updated');
  if (out.orphaned_overrides.length) out.summary.push(`${out.orphaned_overrides.length} edit${out.orphaned_overrides.length === 1 ? '' : 's'} no longer apply`);
  if (!out.summary.length) out.summary.push('No changes');
  return out;
}

module.exports = { diffSnapshots };
