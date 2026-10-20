// Immutable helpers for the overrides document (all human edits; survives "Refresh live data").
//
// {
//   order: [slideKey], hidden: { [slideKey]: true },
//   slides:  { [slideKey]: { eyebrow, title, subtitle, notes, body, bullets, options } },
//   tickets: { [mondayItemId]: { hidden, highlighted, highlightRank, caption, cover: {refId,key,kind}, gallery: [...], private_note } },
//   people:  { [mondayUserId]: { hidden } },
//   custom:  { [slideKey]: { type: 'custom'|'section', after, title, subtitle, body, imageItem, options } },
//   share:   { show_links },
// }

const clean = (o) => {
  const out = {};
  for (const [k, v] of Object.entries(o || {})) if (v !== undefined) out[k] = v;
  return out;
};

export function setSlideField(ov, key, field, value) {
  const slides = { ...(ov.slides || {}) };
  const cur = { ...(slides[key] || {}) };
  if (value === undefined) delete cur[field]; else cur[field] = value;
  if (Object.keys(cur).length) slides[key] = cur; else delete slides[key];
  return { ...ov, slides };
}

export function setSlideOption(ov, key, opt, value) {
  const cur = ov.slides?.[key]?.options || {};
  const options = clean({ ...cur, [opt]: value });
  return setSlideField(ov, key, 'options', Object.keys(options).length ? options : undefined);
}

export function resetSlide(ov, key) {
  const slides = { ...(ov.slides || {}) };
  delete slides[key];
  return { ...ov, slides };
}

export function toggleHidden(ov, key, value) {
  const hidden = { ...(ov.hidden || {}) };
  const next = value ?? !hidden[key];
  if (next) hidden[key] = true; else delete hidden[key];
  return { ...ov, hidden };
}

export function setOrder(ov, keys) { return { ...ov, order: [...keys] }; }

export function setTicket(ov, id, patch) {
  const tickets = { ...(ov.tickets || {}) };
  const cur = clean({ ...(tickets[id] || {}), ...patch });
  for (const [k, v] of Object.entries(cur)) if (v === false || v === null || v === '' || (Array.isArray(v) && !v.length)) delete cur[k];
  if (Object.keys(cur).length) tickets[id] = cur; else delete tickets[id];
  return { ...ov, tickets };
}

export function setPerson(ov, uid, patch) {
  const people = { ...(ov.people || {}) };
  const cur = clean({ ...(people[uid] || {}), ...patch });
  for (const [k, v] of Object.entries(cur)) if (v === false || v === null || v === '') delete cur[k];
  if (Object.keys(cur).length) people[uid] = cur; else delete people[uid];
  return { ...ov, people };
}

export function addCustom(ov, { type = 'custom', after = null, title } = {}) {
  const key = `custom:${(crypto.randomUUID ? crypto.randomUUID() : String(Date.now())).slice(0, 8)}`;
  const custom = { ...(ov.custom || {}), [key]: clean({ type, after, title: title || (type === 'section' ? 'New section' : 'New slide') }) };
  let order = ov.order;
  if (Array.isArray(order) && order.length) {
    const i = after ? order.indexOf(after) : -1;
    order = [...order];
    order.splice(i >= 0 ? i + 1 : order.length, 0, key);
  }
  return [{ ...ov, custom, ...(order ? { order } : {}) }, key];
}

export function updateCustom(ov, key, patch) {
  const custom = { ...(ov.custom || {}) };
  custom[key] = clean({ ...(custom[key] || {}), ...patch });
  return { ...ov, custom };
}

export function deleteCustom(ov, key) {
  const custom = { ...(ov.custom || {}) };
  delete custom[key];
  const next = resetSlide({ ...ov, custom }, key);
  if (Array.isArray(next.order)) next.order = next.order.filter(k => k !== key);
  if (next.hidden?.[key]) { next.hidden = { ...next.hidden }; delete next.hidden[key]; }
  return next;
}

export function countEdits(ov) {
  return Object.keys(ov?.slides || {}).length + Object.keys(ov?.tickets || {}).length + Object.keys(ov?.custom || {}).length
    + Object.keys(ov?.hidden || {}).length + Object.keys(ov?.people || {}).length;
}
