/**
 * MEDIUM → Monday: an approved brief becomes a ticket (spec §10), created with CP's token (Tomer's choice), in the
 * board's "Form Requests" group by default. The lane lives in the ticket name (no Lane column — Tomer's choice);
 * Product goes in the Product dropdown and in label9 "Product (old)", each only when it has the label (12 Nov 2026).
 * The update IS the brief, in the team's format (Tomer, 11 Nov 2026: "it's not the brief") —
 * header line, concept, don'ts, hook, script by beat, test — with one 'Why' line at the end; then Captain Caption
 * locks the approved on-screen text to the item.
 * Only runs when medium_config.monday_submit is on, and only after a person clicked Approve.
 * A brief written from a reference (16 Nov 2026) carries it: the original image / video goes in Relevant Files and
 * the update names it right under the header ("Please look at attached reference…" is then true).
 */
const monday = require('../monday');
const { mondayQuery } = monday;
const R = require('./references');
const { BOARDS } = require('./config');
const { composeBrief } = require('./style');
const { productValues } = require('../studio/product');

const VIDEO_TYPE = [[/higgsfield|drama/i, 'AI Project'], [/creator edit|footage|iteration|cut/i, 'Iterations/Cuts/Edits'], [/ai creator/i, 'AI Creator'], [/cgi|motion/i, 'Motion Design'], [/ugc|creator/i, 'UGC/Creator'], [/script/i, 'Script (<1 min)']];
const LANE_NAME = { SFY: 'Science For You', GT: 'GT', WAC: 'WAC' };
const DEPARTMENT = { video: 'Marketing/Media', design: 'Marketing' };

/** Status labels per column on a board → so an unknown label is skipped instead of failing the whole create. */
const labelCache = new Map();
const normLabel = (x) => String(x || '').toLowerCase().replace(/\s+/g, ' ').trim();

async function boardLabels(boardId) {
  const hit = labelCache.get(boardId);
  if (hit && Date.now() - hit.at < 3600000) return hit.v;
  const d = await mondayQuery('query ($b: [ID!]) { boards(ids: $b) { columns { id type settings_str } } }', { b: [String(boardId)] });
  const v = {};
  // Active labels only; a status is written by its index (a deactivated twin with the same name would fail the create)
  const index = {};
  for (const c of d?.boards?.[0]?.columns || []) {
    try {
      const s = JSON.parse(c.settings_str || '{}');
      const off = new Set((s.deactivated_labels || []).map(String));
      if (c.type === 'status') {
        const active = Object.entries(s.labels || {}).filter(([i, l]) => l && !off.has(String(i)));
        v[c.id] = active.map(([, l]) => l);
        index[c.id] = Object.fromEntries(active.map(([i, l]) => [normLabel(l), Number(i)]));
      } else if (c.type === 'dropdown') v[c.id] = (s.labels || []).filter(l => !off.has(String(l.id))).map(l => l.name);
    } catch { /* not a labelled column */ }
  }
  Object.defineProperty(v, '__index', { value: index, enumerable: false });
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
  // Product: both columns, each only with a label it already has (Bone & Joint is only in the new dropdown)
  const product = productValues(b.product, cols, (col, v) => (labels[col] ? labels[col].includes(v) : null));
  Object.assign(values, product.values);
  if (b.product && !product.written.length) skipped.push(`Product: "${b.product}" isn't a label on the board`);
  status(cols.department, DEPARTMENT[format]);
  status(cols.brand, b.request?.brand || 'Particle');   // Brands — both boards (a film can be for Clearstep, Blurr…)
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
  }
  // statuses by index when the board's active labels are known (never a deactivated twin)
  for (const [col, val] of Object.entries(values)) {
    const idx = val && typeof val === 'object' && 'label' in val ? labels.__index?.[col]?.[normLabel(val.label)] : undefined;
    if (idx != null) values[col] = { index: idx };
  }
  return { values, skipped };
}

/**
 * The brief as the Monday update, the way the team writes them (pure — tested): a header line, then Video Concept /
 * Concept, Don'ts, Hook (or hook variations), Script / Message laid out by beat (or Supporting Text), Test, and a
 * one-line Why at the end. Monday updates take simple HTML.
 */
function briefHtml(b, approver, refs = []) {
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
  // the reference it's written from — where the file is, and a link to the original
  const money = (n) => `$${Math.round(n).toLocaleString('en-US')}`;
  const refLine = (r) => {
    const st = r.stats || {};
    const perf = [st.roas != null ? `ROAS ${Number(st.roas).toFixed(2)}` : null, st.spend ? `${money(st.spend)} spend` : null, st.percentile != null ? `${st.percentile}th pct` : null].filter(Boolean).join(' · ');
    const where = r.attached === 'column' ? '📎 in Relevant Files' : r.attached === 'update' ? '📎 attached below' : null;
    const link = r.link ? `<a href="${esc(r.link)}">${r.kind === 'winner' || r.kind === 'upspring' ? 'Open in Upspring' : r.kind === 'monday' ? 'Open the ticket' : 'Open'}</a>` : null;
    const tail = [where, link].filter(Boolean);
    return `<li>${esc(r.label)}${r.kind === 'winner' ? ` — ${r.format === 'video' ? 'video' : 'static'} winner${perf ? ` (${esc(perf)})` : ''}` : ''}${tail.length ? ` · ${tail.join(' · ')}` : ''}</li>`;
  };
  const shown = (refs || []).filter(r => r && r.label);
  return [
    `<p>${header}</p>`,
    shown.length ? section(shown.length > 1 ? 'References' : 'Reference', `<ul>${shown.map(refLine).join('')}</ul>`) : '',
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

/**
 * Upload the reference media to the item: Relevant Files first; what the column refuses goes on the update (finish),
 * then the item is read back — a file counts only when Monday has it.
 */
async function attachReferences(itemId, format, refs) {
  const { files, failed } = await R.download(refs).catch(e => ({ files: [], failed: [`references: ${e.message}`] }));
  const column = BOARDS[format].columns.files;
  const done = [], later = [];
  for (const f of files) {
    try {
      const r = await monday.addFileToColumn(itemId, column, f);
      if (!r?.add_file_to_column?.id) throw new Error('Monday returned no file');
      done.push({ id: String(r.add_file_to_column.id), f, where: 'column' });
    } catch (e) { later.push({ f, why: e.message }); }
  }
  const finish = async (updateId) => {
    for (const { f, why } of later) {
      try {
        if (!updateId) throw new Error(why);
        const r = await monday.addFileToUpdate(updateId, f);
        if (!r?.add_file_to_update?.id) throw new Error('Monday returned no file');
        done.push({ id: String(r.add_file_to_update.id), f, where: 'update' });
      } catch (e) { failed.push(`${f.name} (${e.message})`); }
    }
    if (done.length) {
      const have = await monday.itemAssetIds(itemId).catch(() => null);
      if (have) for (const d of done.filter(x => !have.has(x.id))) { failed.push(`${d.f.name} (uploaded, but Monday doesn't show it on the ticket)`); d.lost = true; }
    }
    return { attached: done.filter(d => !d.lost).map(d => ({ name: d.f.name, where: d.where, label: d.f.ref.label })), failed };
  };
  return { done, later, failed, finish };
}

/** Create the ticket + the brief update (+ the reference files); returns { item_id, board_id, skipped, references }. */
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
  // the reference first, so the update can say where it is
  const refs = R.referencesOf(b, { upspringLink: cfg.upspring_link });
  const up = R.attachable(refs).length ? await attachReferences(itemId, format, refs) : null;
  const inColumn = new Set((up?.done || []).map(d => d.f.ref));
  const inUpdate = new Set((up?.later || []).map(l => l.f.ref));
  const shown = refs.map(r => ({ ...r, attached: inColumn.has(r) ? 'column' : inUpdate.has(r) ? 'update' : null }));
  const u = await mondayQuery('mutation ($i: ID!, $body: String!) { create_update(item_id: $i, body: $body) { id } }', { i: itemId, body: briefHtml(b, approver, shown) })
    .catch(e => { skipped.push(`brief update: ${e.message}`); return null; });
  const references = up ? await up.finish(u?.create_update?.id || null) : { attached: [], failed: [] };
  if (references.failed.length) skipped.push(`reference: ${references.failed.join('; ')}`);
  return { item_id: String(itemId), board_id: boardId, skipped, references };
}

module.exports = { briefHtml, submitBrief, columnValues, ticketName, evidenceHtml, boardLabels, attachReferences };
