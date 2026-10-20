/**
 * Server-side deck shaping.
 *
 * publicReport(report): the payload for the share link. Pruning happens HERE (never trust the client):
 *   - hidden tickets / hidden people / custom slides marked private are removed
 *   - private notes, requester ids, emails, warnings and generation metadata are dropped
 *   - source links (Monday / Dropbox / Frame.io / Figma) are removed unless overrides.share.show_links
 *   - media refs are limited to visible items
 */

function clone(o) { return JSON.parse(JSON.stringify(o ?? null)); }

function hiddenTicketIds(overrides) {
  const t = overrides?.tickets || {};
  return new Set(Object.entries(t).filter(([, v]) => v && v.hidden).map(([k]) => String(k)));
}
function hiddenPeopleIds(overrides) {
  const p = overrides?.people || {};
  return new Set(Object.entries(p).filter(([, v]) => v && v.hidden).map(([k]) => String(k)));
}

/** Media refs a given audience may load for this report. */
function allowedMediaRefs(report, audience = 'internal') {
  const snap = report.snapshot || {};
  const ov = report.overrides || {};
  const refs = new Set();
  if (audience === 'internal') {
    for (const id of Object.keys(snap.media_refs || {})) refs.add(id);
    for (const list of Object.values(ov.extra_media || {})) for (const r of list || []) if (r?.ref) refs.add(r.ref);
    return refs;
  }
  const hidden = hiddenTicketIds(ov);
  const hiddenPeople = hiddenPeopleIds(ov);
  for (const it of Object.values(snap.items || {})) {
    if (hidden.has(String(it.id))) continue;
    if (it.people?.length && it.people.every(p => hiddenPeople.has(String(p)))) continue;
    for (const r of it.media_refs || []) refs.add(r);
  }
  return refs;
}

/** Ticket ids visible to the public audience. */
function visibleTicketIds(report) {
  const snap = report.snapshot || {};
  const hidden = hiddenTicketIds(report.overrides);
  const hiddenPeople = hiddenPeopleIds(report.overrides);
  return new Set(Object.values(snap.items || {})
    .filter(it => !hidden.has(String(it.id)))
    .filter(it => !(it.people?.length && it.people.every(p => hiddenPeople.has(String(p)))))
    .map(it => String(it.id)));
}

function publicReport(report) {
  const snap = clone(report.snapshot) || {};
  const ov = clone(report.overrides) || {};
  const showLinks = !!ov.share?.show_links;
  const visible = visibleTicketIds(report);
  const hiddenPeople = hiddenPeopleIds(ov);

  // Items
  const items = {};
  for (const [id, it] of Object.entries(snap.items || {})) {
    if (!visible.has(String(id))) continue;
    const { requested_by, monday_url, assets, ...rest } = it;
    rest.people = (rest.people || []).filter(p => !hiddenPeople.has(String(p)));
    if (!showLinks) rest.links = { frame: null, dropbox: null, figma: null, project: null };
    items[id] = rest;
  }
  snap.items = items;

  // Sections keep only visible ids (metrics/totals stay authoritative)
  for (const [k, list] of Object.entries(snap.sections || {})) snap.sections[k] = (list || []).filter(id => visible.has(String(id)));

  // People
  const people = {};
  for (const [uid, p] of Object.entries(snap.people || {})) {
    if (hiddenPeople.has(String(uid))) continue;
    const { title, ...rest } = p;
    people[uid] = rest;
  }
  snap.people = people;
  if (snap.workload?.people) for (const uid of Object.keys(snap.workload.people)) if (!people[uid]) delete snap.workload.people[uid];
  if (snap.metrics?.by_person) for (const uid of Object.keys(snap.metrics.by_person)) if (!people[uid]) delete snap.metrics.by_person[uid];
  for (const t of snap.trend || []) if (t.by_person) for (const uid of Object.keys(t.by_person)) if (!people[uid]) delete t.by_person[uid];

  // Media refs: visible items only; URLs never leave the server
  const allowed = allowedMediaRefs(report, 'public');
  const media = {};
  for (const [id, r] of Object.entries(snap.media_refs || {})) {
    if (!allowed.has(id)) continue;
    media[id] = { kind: r.kind, item_id: r.item_id, name: r.name || null, is_image: r.is_image ?? null };
  }
  snap.media_refs = media;

  // CP weekly: strip links unless allowed
  if (snap.cp_weekly && !showLinks) {
    for (const p of snap.cp_weekly.productions || []) { p.links = []; for (const b of p.bullets || []) b.link = null; }
    for (const u of snap.cp_weekly.general_updates || []) { u.link = null; if (u.file) u.file.view_url = null; }
  }

  delete snap.warnings;
  delete snap.build_ms;

  // Overrides: drop private fields
  const pubOv = clone(ov) || {};
  if (pubOv.tickets) {
    for (const [id, t] of Object.entries(pubOv.tickets)) {
      if (!visible.has(String(id))) { delete pubOv.tickets[id]; continue; }
      delete t.private_note;
    }
  }
  if (pubOv.people) for (const uid of Object.keys(pubOv.people)) if (hiddenPeople.has(String(uid))) delete pubOv.people[uid];
  if (pubOv.slides) for (const s of Object.values(pubOv.slides)) if (s) { delete s.private_notes; delete s.notes; }
  if (pubOv.custom) for (const [k, c] of Object.entries(pubOv.custom)) if (c?.private) delete pubOv.custom[k];
  delete pubOv.extra_media;

  // Narrative: drop per-person lines for hidden people
  const narrative = clone(report.narrative);
  if (narrative?.per_person) narrative.per_person = narrative.per_person.filter(p => !hiddenPeople.has(String(p.monday_user_id)));
  if (narrative) delete narrative.locked_fields;

  return {
    id: report.id,
    brand_id: report.brand_id,
    week_start: report.week_start,
    title: report.title,
    status: report.status,
    template: report.template,
    snapshot: snap,
    overrides: pubOv,
    narrative,
    updated_at: report.updated_at,
  };
}

/** Lightweight list-card summary (no full snapshot). */
function coverSummary(row) {
  const t = row.totals || row.snapshot?.metrics?.totals || {};
  return {
    id: row.id,
    week_start: row.week_start,
    title: row.title,
    status: row.status,
    revision: row.revision,
    week_label: row.week_label || row.snapshot?.week?.label || null,
    week_number: row.week_number || row.snapshot?.week?.number || null,
    totals: { delivered: t.delivered ?? 0, video: t.video ?? 0, design: t.design ?? 0, in_progress: t.in_progress ?? 0, people: t.people ?? 0 },
    shared: !!row.share_token && (!row.share_expires_at || new Date(row.share_expires_at) > new Date()),
    generated_at: row.generated_at,
    updated_at: row.updated_at,
  };
}

module.exports = { publicReport, allowedMediaRefs, visibleTicketIds, coverSummary };
