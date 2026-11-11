/**
 * MEDIUM → Monday: an approved brief becomes a ticket (spec §10), created with CP's token (Tomer's choice), in the
 * board's "Form Requests" group by default. The lane lives in the ticket name (no Lane column — Tomer's choice);
 * Product goes in label9. One evidence update follows (the numbers, links and quotes — never in the brief itself),
 * then Captain Caption locks the approved on-screen text to the item.
 * Only runs when medium_config.monday_submit is on, and only after a person clicked Approve.
 */
const { mondayQuery } = require('../monday');
const { BOARDS } = require('./config');
const { composeBrief } = require('./style');

const VIDEO_TYPE = [[/creator edit|footage|iteration|cut/i, 'Iterations/Cuts/Edits'], [/ai creator/i, 'AI Creator'], [/cgi|motion/i, 'Motion Design'], [/ugc|creator/i, 'UGC/Creator'], [/script/i, 'Script (<1 min)']];
const LANE_NAME = { SFY: 'Science For You', GT: 'GT', WAC: 'WAC' };
const DEPARTMENT = { video: 'Marketing/Media', design: 'Marketing' };

/** Status labels per column on a board → so an unknown label is skipped instead of failing the whole create. */
const labelCache = new Map();
async function boardLabels(boardId) {
  const hit = labelCache.get(boardId);
  if (hit && Date.now() - hit.at < 3600000) return hit.v;
  const d = await mondayQuery('query ($b: [ID!]) { boards(ids: $b) { columns { id type settings_str } } }', { b: [String(boardId)] });
  const v = {};
  for (const c of d?.boards?.[0]?.columns || []) {
    try {
      const s = JSON.parse(c.settings_str || '{}');
      if (c.type === 'status') v[c.id] = Object.values(s.labels || {}).filter(Boolean);
      else if (c.type === 'dropdown') v[c.id] = (s.labels || []).map(l => l.name);
    } catch { /* not a labelled column */ }
  }
  labelCache.set(boardId, { at: Date.now(), v });
  return v;
}

/** The ticket name, with the lane in it for magazine lanes (that's how the team filters — no Lane column). */
function ticketName(b) {
  const name = String(b.ticket_name || `${b.product} | Meta | Medium | ${b.fields?.hook || 'Brief'}`).slice(0, 255);
  const ln = LANE_NAME[b.lane];
  if (!ln || name.toLowerCase().includes(ln.toLowerCase()) || name.toLowerCase().includes(String(b.lane).toLowerCase())) return name;
  const parts = name.split('|').map(s => s.trim());
  parts.splice(1, 0, ln);
  return parts.join(' | ').slice(0, 255);
}

/**
 * Column values for create_item (pure — tested). labels = boardLabels(); unknown labels are left out.
 * Returns { values, skipped: [what couldn't be set] }.
 */
function columnValues(b, { labels = {}, requesterId = null } = {}) {
  const f = b.fields || {};
  const format = b.format === 'design' ? 'design' : 'video';
  const cols = BOARDS[format].columns;
  const values = {}, skipped = [];
  const status = (col, label) => {
    if (!col || !label) return;
    if (labels[col] && !labels[col].includes(label)) { skipped.push(`${col}: "${label}" isn't a label on the board`); return; }
    values[col] = { label };
  };
  status(cols.product, b.product);
  status(cols.department, DEPARTMENT[format]);
  status(cols.platform, 'Meta');
  const sizes = (f.sizes || []).filter(s => !labels[cols.ratio] || labels[cols.ratio].includes(s));
  if (sizes.length) values[cols.ratio] = { labels: sizes };
  if (requesterId) values[cols.requester] = { personsAndTeams: [{ id: Number(requesterId), kind: 'person' }] };
  values[cols.brief] = { text: composeBrief(f) };
  if (format === 'video') {
    if (f.hook) values[cols.hook] = String(f.hook).slice(0, 2000);
    if (f.script) values[cols.script] = { text: f.script };
    if (f.duration) values[cols.duration] = String(Math.round(Number(f.duration)));
    const type = VIDEO_TYPE.find(([re]) => re.test(f.video_type || ''))?.[1];
    if (type) status(cols.type, type);
  } else {
    if (f.copy) values[cols.copy] = { text: f.copy };
    status(cols.brand, 'Particle');
  }
  return { values, skipped };
}

/** The evidence update: lane, source winners, why, examples, references, Captain verdict, and who approved it. */
function evidenceHtml(b, approver) {
  const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const ev = b.evidence || {};
  const rows = [`<p><strong>🔮 Medium</strong> · ${esc(b.lane)} lane · ${esc(b.move)}${b.score?.total != null ? ` · score ${b.score.total} (uncalibrated)` : ''}</p>`];
  if (b.fields?.why) rows.push(`<p><strong>Why:</strong> ${esc(b.fields.why)}</p>`);
  const items = (ev.items || []).slice(0, 8);
  if (items.length) rows.push(`<p><strong>Evidence</strong></p><ul>${items.map(i => `<li>${esc(i.claim)} <em>(${esc(i.source)})</em></li>`).join('')}</ul>`);
  const src = Array.isArray(ev.winners) ? ev.winners : Array.isArray(ev.afterlife) ? ev.afterlife : [];
  const winners = src.slice(0, 3);
  if (winners.length) rows.push(`<p><strong>Source winners (${Array.isArray(ev.winners) ? 'Upspring' : 'AfterLife'})</strong></p><ul>${winners.map(w => `<li>${esc(w.label)} — ${w.percentile != null ? `${w.percentile}th pct` : ''}${w.roas != null ? ` · ROAS ${Number(w.roas).toFixed(2)}` : ''}${w.spend ? ` · $${Math.round(w.spend).toLocaleString()} spend` : ''}</li>`).join('')}</ul>`);
  if ((ev.examples || []).length) rows.push(`<p><strong>Written in the style of:</strong> ${ev.examples.map(e => esc(e.name)).join(' · ')}</p>`);
  if (ev.transfer) rows.push(`<p><strong>Transfer</strong> — keeps: ${esc((ev.transfer.keep || []).join('; '))}<br/>swaps: ${esc((ev.transfer.swap || []).map(s => `${s.from} → ${s.to}`).join('; '))}</p>`);
  if (b.preflight?.verdict) rows.push(`<p><strong>Captain Caption pre-flight:</strong> ${b.preflight.verdict === 'passed' ? 'passed ✅' : `${b.preflight.must_fix} must-fix (approved with an override)`}</p>`);
  rows.push(`<p><em>Generated by Medium · approved by ${esc(approver)}</em></p>`);
  return rows.join('');
}

async function mondayUserId(email) {
  if (!email) return null;
  const d = await mondayQuery('query ($e: [String]) { users(emails: $e) { id } }', { e: [String(email)] }).catch(() => null);
  return d?.users?.[0]?.id || null;
}

/** Create the ticket + evidence update; returns { item_id, board_id, skipped }. */
async function submitBrief(b, { approver, approverEmail = null, cfg = {} } = {}) {
  const format = b.format === 'design' ? 'design' : 'video';
  const boardId = BOARDS[format].board_id;
  const group = cfg.monday_groups?.[format] || 'new_group__1';   // "Form Requests" on both boards
  const [labels, requesterId] = await Promise.all([boardLabels(boardId), mondayUserId(approverEmail)]);
  const { values, skipped } = columnValues(b, { labels, requesterId });
  const d = await mondayQuery(
    `mutation ($b: ID!, $g: String, $n: String!, $v: JSON) { create_item(board_id: $b, group_id: $g, item_name: $n, column_values: $v, create_labels_if_missing: false) { id } }`,
    { b: boardId, g: group, n: ticketName(b), v: JSON.stringify(values) }, { timeoutMs: 60000 });
  const itemId = d?.create_item?.id;
  if (!itemId) throw new Error('Monday did not return the new item');
  await mondayQuery('mutation ($i: ID!, $body: String!) { create_update(item_id: $i, body: $body) { id } }', { i: itemId, body: evidenceHtml(b, approver) }).catch(e => skipped.push(`evidence update: ${e.message}`));
  return { item_id: String(itemId), board_id: boardId, skipped };
}

module.exports = { submitBrief, columnValues, ticketName, evidenceHtml, boardLabels };
