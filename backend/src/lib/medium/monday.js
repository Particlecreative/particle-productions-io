/**
 * MEDIUM → Monday: an approved brief becomes a ticket (spec §10), created with CP's token (Tomer's choice), in the
 * board's "Form Requests" group by default. The lane lives in the ticket name (no Lane column — Tomer's choice);
 * Product goes in label9. The update IS the brief, in the team's format (Tomer, 11 Nov 2026: "it's not the brief") —
 * header line, concept, don'ts, hook, script by beat, test — with one 'Why' line at the end; then Captain Caption
 * locks the approved on-screen text to the item.
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

/**
 * The brief as the Monday update, the way the team writes them (pure — tested): a header line, then Video Concept /
 * Concept, Don'ts, Hook (or hook variations), Script / Message laid out by beat (or Supporting Text), Test, and a
 * one-line Why at the end. Monday updates take simple HTML.
 */
function briefHtml(b, approver) {
  const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const br = (s) => esc(s).replace(/\n/g, '<br>');
  const f = b.fields || {};
  const video = b.format !== 'design';
  const sizes = (f.sizes || []).map(x => String(x).replace('x', '×')).join(', ');
  const header = [
    ['Department', DEPARTMENT[video ? 'video' : 'design']], [video ? 'Product' : 'Product / Bundle', b.product], ['Platform', 'Meta'],
    b.lane && b.lane !== 'Particle' ? ['Lane', LANE_NAME[b.lane] || b.lane] : null,
    video ? ['Type', f.video_type] : null, ['Sizes Needed', sizes], video && f.duration ? ['Est. Duration', `${Math.round(Number(f.duration))} sec`] : null,
    f.template ? ['Template', f.template] : null,
  ].filter(x => x && x[1]).map(([k, v]) => `<strong>${k}:</strong> ${esc(v)}`).join(' | ');
  const section = (title, html) => (html ? `<p><strong>${title}</strong></p>${html}` : '');
  // the concept: the Brief field (its first line is the lane's opening, e.g. "Page: …" / "Ad leads to: …")
  const concept = String(f.brief || '').trim().split(/\n{2,}/).map(par => `<p>${br(par.trim())}</p>`).join('');
  const donts = (Array.isArray(f.donts) ? f.donts : String(f.donts || '').split('\n')).map(d => String(d).replace(/^[-•–]\s*/, '').trim()).filter(Boolean);
  const hooks = String(f.hook || '').split('\n').map(h => h.trim()).filter(Boolean);
  // the script by beat: "0–4s — THE HOOK" lines bold, SCRIPT: / VISUALS: / VO: / SUPER: labels bold
  const script = String(f.script || '').trim().split('\n').map(line => {
    const t = line.trim();
    if (!t) return '';
    if (/^(?:\d{1,3}\s*[–-]\s*\d{1,3}\s*s\b|HOOK\s*\d|V\d\b)/i.test(t)) return `<p><strong>${esc(t)}</strong></p>`;
    const m = t.match(/^(SCRIPT|VISUALS?|VO|SUPERS?|ON[- ]SCREEN|SFX|MUSIC|CTA)\s*:\s*(.*)$/i);
    return m ? `<p><strong>${esc(m[1].toUpperCase())}:</strong> ${esc(m[2])}</p>` : `<p>${esc(t)}</p>`;
  }).join('');
  return [
    `<p>${header}</p>`,
    section(video ? 'Video Concept' : 'Concept / Idea', concept),
    donts.length ? section('Don\u2019ts', `<ul>${donts.map(d => `<li>${esc(d)}</li>`).join('')}</ul>`) : '',
    video && hooks.length ? section(hooks.length > 1 ? 'Hook Variations' : 'Hook', hooks.length > 1 ? `<ol>${hooks.map(h => `<li>${esc(h)}</li>`).join('')}</ol>` : `<p>${esc(hooks[0])}</p>`) : '',
    video ? section('Script / Message', script) : section('Supporting Text', f.copy ? `<p>${br(f.copy)}</p>` : ''),
    f.test ? section('What we\u2019re testing', `<p>${esc(String(f.test).replace(/^test:\s*/i, ''))}</p>`) : '',
    f.why ? `<p><em>Why: ${esc(String(f.why).replace(/^why:\s*/i, ''))}</em></p>` : '',
    `<p><em>Brief written by Medium · approved by ${esc(approver)}</em></p>`,
  ].filter(Boolean).join('');
}

/** The older evidence update (kept for reference; no longer posted). */
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
  await mondayQuery('mutation ($i: ID!, $body: String!) { create_update(item_id: $i, body: $body) { id } }', { i: itemId, body: briefHtml(b, approver) }).catch(e => skipped.push(`brief update: ${e.message}`));
  return { item_id: String(itemId), board_id: boardId, skipped };
}

module.exports = { briefHtml, submitBrief, columnValues, ticketName, evidenceHtml, boardLabels };
