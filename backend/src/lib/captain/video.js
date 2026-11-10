/**
 * Captain Caption — the video pipeline (one job = one trigger on one Monday task or one pasted link).
 *
 *   Monday task (brief + scope) → Frame.io folder → deliverables (version × size, master first) → newest round of each
 *   → skip what's already been checked → Gemini watches + listens → issues with exact frames → Frame.io comments
 *   (only where the posting switch allows) → one Monday summary update.
 *
 * Cut-downs (9x16 / 4x5 made from the approved 16x9 master) are compared with the master's on-screen copy.
 */
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const db = require('../../db');
const { getConfig, BOARDS } = require('./config');
const { inScope } = require('./scope');
const frameio = require('./frameio');
const figma = require('./figma');
const monday = require('./monday');
const { loadBrain, brainText } = require('./brain');
const gemini = require('./engines/gemini');
const { logEvent } = require('./log');
const { enqueue } = require('./queue');
const { insertCheck, updateCheck, lastCheckOf, insertIssue, setIssueComment } = require('./store');
const L = require('./labels');
const { frameioMatcher } = require('./dedupe');

const PREFIX = monday.PREFIX;
const PROMPT = fs.readFileSync(path.join(__dirname, 'prompts', 'qc-video.txt'), 'utf8');
const sh = (cmd, args) => new Promise((resolve, reject) => execFile(cmd, args, { maxBuffer: 1 << 24 }, (e, out) => (e ? reject(e) : resolve(out))));

// ── posting switch ───────────────────────────────────────────────────────────
function postingFor(cfg, { frameioFolderId = null, figmaFileKey = null, itemId = null }) {
  const p = cfg.posting || {};
  if (p.mode === 'live') return { mode: 'live', comments: true, monday: !!itemId };
  if (p.mode === 'test') {
    const comments = frameioFolderId ? (p.test_frameio_folders || []).includes(frameioFolderId)
      : figmaFileKey ? (p.test_figma_files || []).includes(figmaFileKey) : false;
    return { mode: 'test', comments, monday: !!itemId && (p.test_monday_items || []).map(String).includes(String(itemId)) };
  }
  return { mode: 'off', comments: false, monday: false };
}

// ── prompt pieces ────────────────────────────────────────────────────────────
function briefBlock(item) {
  if (!item) return 'No Monday brief for this check — skip every comparison with a brief or script.';
  const hooks = monday.hookVariations(item);
  const script = item.brief.script || '';
  const lines = ['Approved brief for this task (from Monday):'];
  if (hooks.length) lines.push(`Hook variation(s): ${hooks.map((h, i) => `${i + 1}. ${h}`).join('  ')}`);
  if (item.brief.versions_needed > 1) lines.push(`(The brief asked for ${item.brief.versions_needed} versions, so this video may open with a different hook. If its opening matches none of the listed hooks, report that ONCE as type "script_mismatch", severity "check".)`);
  if (script) lines.push(`Script (what the voiceover and captions should say, in this order):\n${script}`);
  lines.push('Compare the voiceover and the on-screen text with the brief. Report meaningful differences — missing or added sentences, changed meaning, different numbers/prices/claims, sentences in a different order — with severity "check". Ignore punctuation-only and capitalisation-only differences against the script.');
  return lines.join('\n');
}

function referenceBlock(master) {
  if (!master) return '';
  const copy = (master.on_screen_text || []).map(t => t.text).filter(Boolean).join(' | ');
  return `This video is a CUT-DOWN of the master "${master.label}" (round ${master.round}). The master's on-screen copy was:\n${copy}\nReport any wording difference from the master as type "size_mismatch", severity "check" (different line breaks or layout don't matter; a changed, missing or added word does).`;
}

function buildPrompt({ brain, item, master }) {
  return PROMPT.replace('{{BRAIN}}', brainText(brain)).replace('{{BRIEF}}', briefBlock(item)).replace('{{REFERENCE}}', referenceBlock(master));
}

// ── comment wording ──────────────────────────────────────────────────────────
function commentText(issue) {
  const q = (s) => `"${String(s ?? '').trim()}"`;
  if (issue.type === 'script_mismatch' || issue.type === 'vo_script_mismatch') return `${PREFIX} please check — differs from the brief: ${q(issue.found)} (brief: ${q(issue.fix)})${issue.note ? ` · ${issue.note}` : ''}`;
  if (issue.type === 'vo_order') return `${PREFIX} please check — sentence order differs from the script${issue.note ? `: ${issue.note}` : ''}`;
  if (issue.type === 'size_mismatch') return `${PREFIX} please check — copy differs from the master: ${q(issue.found)} (master: ${q(issue.fix)})`;
  if (issue.type === 'vo_unclear') return `${PREFIX} voiceover: ${issue.note || q(issue.found)}`;
  if (issue.type === 'caption_vs_voiceover') return `${PREFIX} caption ${q(issue.found)} doesn't match the voice — says ${q(issue.fix)}`;
  const head = issue.type?.startsWith('vo_') ? `${PREFIX} voiceover says ${q(issue.found)} → ${q(issue.fix)}` : `${PREFIX} ${q(issue.found)} → ${q(issue.fix)}`;
  return issue.severity === 'check' ? `${head} (please check${issue.note ? `: ${issue.note}` : ''})` : head;
}

function normIssues(issues, fps) {
  return (issues || []).map((i, idx) => {
    const start = Math.max(0, Number(i.start) || 0);
    const end = Math.max(start, Number(i.end) || start);
    return {
      idx, start_s: start, end_s: end,
      frame: Math.round(start * fps) + 1,
      duration_frames: Math.max(1, Math.round((end - start) * fps)),
      found: i.found ?? null, fix: i.fix ?? null, type: i.type || 'other',
      severity: i.severity === 'check' ? 'check' : 'must_fix', note: i.note ?? null,
    };
  });
}

// ── one deliverable ──────────────────────────────────────────────────────────
async function grabThumb(file) {
  const out = `${file}.jpg`;
  try {
    await sh('ffmpeg', ['-y', '-loglevel', 'error', '-ss', '1', '-i', file, '-frames:v', '1', '-vf', 'scale=360:-2', '-q:v', '5', out]);
    return fs.readFileSync(out);
  } catch { return null; } finally { fs.rmSync(out, { force: true }); }
}

async function probeFps(file) {
  try {
    const out = String(await sh('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=r_frame_rate', '-of', 'csv=p=0', file])).trim();
    const [n, d] = out.split('/').map(Number);
    return d ? n / d : n || null;
  } catch { return null; }
}

async function checkDeliverable({ d, round, ctx, cfg, posting, master }) {
  const { item, brain, trigger, actor, force, scopeReason, target } = ctx;
  const fileId = round.file_id;
  const dedupeKey = `frameio:${fileId}`;
  const base = {
    discipline: 'video', trigger, board_id: item?.board_id || null, item_id: item?.id || null, item_name: item?.name || target.name || d.name,
    department: item?.department || null, product: item?.product || null, campaign: item?.campaign || null, person: item?.person || null,
    scope_reason: scopeReason, deliverable: d.label, round: round.round, dedupe_key: dedupeKey, requested_by: actor || null,
  };

  const prev = await lastCheckOf(dedupeKey);
  if (prev && !force) {
    const id = await insertCheck({ ...base, status: 'skipped', skip_reason: 'Already checked (same Frame.io file)', asset: { file_id: fileId, stack_id: d.stack_id, folder_id: target.folder_id, name: d.name, previous_check: prev.id }, finished_at: new Date() });
    await logEvent({ kind: 'skip', discipline: 'video', board_id: base.board_id, item_id: base.item_id, check_id: id, message: `${d.label} round ${round.round}: already checked`, actor });
    return { label: d.label, round: round.round, status: 'skipped', reason: 'already checked', check_id: id, previous: prev, on_screen_text: prev.raw?.on_screen_text || [] };
  }

  const info = await frameio.fileInfo(fileId);
  if (!info.ready) {
    // Still transcoding — try again in 5 minutes (deduped per file)
    await enqueue('video_check', { link: info.view_url, item_id: item?.id || null, item_from_link: !!ctx.fromLink, trigger, actor, only_file_id: fileId }, { dedupeKey: `wait:${fileId}`, delaySec: 300 });
    await logEvent({ kind: 'skip', discipline: 'video', board_id: base.board_id, item_id: base.item_id, message: `${d.label} round ${round.round}: Frame.io is still processing — retrying in 5 min`, actor });
    return { label: d.label, round: round.round, status: 'waiting' };
  }

  const engine = cfg.engines.video;
  const checkId = await insertCheck({
    ...base, status: 'running', engine: engine.engine, model: engine.model, posting: posting.mode, started_at: new Date(),
    asset: { file_id: fileId, stack_id: d.stack_id, folder_id: target.folder_id, project_id: info.project_id, name: info.name, fps: info.fps, duration: info.duration, view_url: info.view_url, size: d.size, variant: d.variant, master: master ? master.label : null },
  });
  await logEvent({ kind: 'check', discipline: 'video', board_id: base.board_id, item_id: base.item_id, check_id: checkId, message: `Checking ${d.label} round ${round.round}`, data: { trigger, file_id: fileId }, actor });

  const tmp = path.join('/tmp', `captain-${checkId}.mp4`);
  try {
    if (!info.video_url) throw new Error('Frame.io has no playable copy of this file yet');
    const res = await fetch(info.video_url, { signal: AbortSignal.timeout(300000) });
    if (!res.ok) throw new Error(`Downloading the video from Frame.io failed (${res.status})`);
    fs.writeFileSync(tmp, Buffer.from(await res.arrayBuffer()));
    const fps = info.fps || (await probeFps(tmp)) || 24;
    const thumb = await grabThumb(tmp);

    const prompt = buildPrompt({ brain, item, master });
    if (engine.engine !== 'gemini') throw new Error(`Video engine "${engine.engine}" isn't available yet — set Gemini in Settings`);
    const r = await gemini.checkVideo({ path: tmp, name: `${base.item_name} · ${d.label} · r${round.round}`, prompt, model: engine.model, prices: cfg.prices || {} });
    const issues = normIssues(r.issues, fps);

    for (const i of issues) await insertIssue(checkId, i);
    await updateCheck(checkId, {
      status: issues.length ? 'issues' : 'passed', issue_count: issues.length, cost_usd: r.cost_usd, duration_ms: r.ms, usage: r.usage,
      raw: { on_screen_text: r.on_screen_text, voiceover: r.voiceover, issues: r.issues, brain_ids: brain.ids, prompt_chars: prompt.length },
      thumb, finished_at: new Date(),
      asset: { file_id: fileId, stack_id: d.stack_id, folder_id: target.folder_id, project_id: info.project_id, name: info.name, fps, duration: info.duration, view_url: info.view_url, size: d.size, variant: d.variant, master: master ? master.label : null },
    });

    // Comments on the exact frame of this exact version
    if (posting.comments) {
      const already = await frameioMatcher(frameio, fileId, PREFIX);   // skip what the Captain already said here (re-runs)
      let posted = 0, skipped = 0;
      if (!issues.length) {
        const text = `${PREFIX} ${d.label} round ${round.round} passed ✅ — no typos found`;
        if (already(text, 1)) skipped++; else { await frameio.createComment(fileId, { text, timestamp: 1 }); posted++; }
      }
      for (const i of issues) {
        const text = commentText(i);
        const prev = already(text, i.frame);
        if (prev) { skipped++; await setIssueComment(checkId, i.idx, prev.id); continue; }
        const c = await frameio.createComment(fileId, { text, timestamp: i.frame, duration: i.duration_frames });
        if (c?.id) await setIssueComment(checkId, i.idx, c.id);
        posted++;
      }
      await updateCheck(checkId, { posted_at: new Date() });
      await logEvent({ kind: 'post', discipline: 'video', board_id: base.board_id, item_id: base.item_id, check_id: checkId, message: `Posted ${posted} Frame.io comment(s) on ${d.label} round ${round.round}${skipped ? ` (${skipped} already there — not posted again)` : ''}`, actor });
    }
    return { label: d.label, round: round.round, status: issues.length ? 'issues' : 'passed', issue_count: issues.length, must_fix: issues.filter(i => i.severity === 'must_fix').length, check_id: checkId, on_screen_text: r.on_screen_text, size: d.size, variant: d.variant };
  } catch (e) {
    await updateCheck(checkId, { status: 'error', error: String(e.message).slice(0, 1000), finished_at: new Date() });
    await logEvent({ kind: 'error', discipline: 'video', board_id: base.board_id, item_id: base.item_id, check_id: checkId, message: `${d.label} round ${round.round}: ${e.message}`, actor });
    return { label: d.label, round: round.round, status: 'error', error: e.message, check_id: checkId };
  } finally {
    fs.rmSync(tmp, { force: true });
  }
}

// ── one job ──────────────────────────────────────────────────────────────────
async function skip({ item, link, name = null, reason, trigger, actor }) {
  const id = await insertCheck({
    discipline: 'video', status: 'skipped', skip_reason: reason, trigger, board_id: item?.board_id || null, item_id: item?.id || null, item_name: item?.name || name || link || null,
    department: item?.department || null, product: item?.product || null, person: item?.person || null, requested_by: actor || null, asset: { link: link || null }, finished_at: new Date(),
  });
  await logEvent({ kind: 'skip', discipline: 'video', board_id: item?.board_id, item_id: item?.id, check_id: id, message: reason, data: { link, trigger }, actor });
  return { skipped: true, reason, check_id: id };
}

/**
 * A pasted link → its Monday task, so the brief is read: a task the Captain already tracks, one the history import
 * tied to these files, or the task with the same name on the Video board (the team names the folder after it).
 */
async function findItemForLink({ target, deliverables }) {
  const first = async (sql, args) => { try { return (await db.query(sql, args)).rows[0]?.item_id || null; } catch { return null; } };
  let id = target.folder_id ? await first(`SELECT item_id FROM captain_tracked WHERE discipline = 'video' AND frameio_folder_id = $1 ORDER BY updated_at DESC LIMIT 1`, [target.folder_id]) : null;
  const keys = deliverables.flatMap(d => d.rounds.map(r => `frameio:${r.file_id}`));
  if (!id && keys.length) id = await first(`SELECT item_id FROM captain_import_assets WHERE asset_key = ANY($1::text[]) AND item_id IS NOT NULL LIMIT 1`, [keys]);
  if (!id && target.name) id = await monday.findItemByName(BOARDS.video.board_id, target.name).catch(() => null);
  return id ? monday.readItem(id) : null;
}

/**
 * payload: { link?, item_id?, item_from_link?, trigger, actor?, force?, override_scope?, only_file_id? }
 * item_from_link = the task was found from a pasted link (brief only — no scope gate, no Monday summary).
 */
async function runVideoJob(payload) {
  const { item_id = null, trigger = 'manual', actor = null, force = false, override_scope = false, only_file_id = null } = payload;
  const cfg = await getConfig();
  let item = item_id ? await monday.readItem(item_id) : null;
  let fromLink = !!(item && payload.item_from_link);
  if (item_id && !item) return skip({ item: null, link: payload.link, reason: `Monday item ${item_id} not found`, trigger, actor });
  if (item && item.discipline !== 'video') return skip({ item, link: payload.link, reason: 'Not a Video board item', trigger, actor });
  const link = payload.link || item?.link;
  if (!link) return skip({ item, link, reason: 'No Frame.io link on the item yet', trigger, actor });
  if (figma.parseUrl(link)) return skip({ item, link, reason: 'Data-quality flag: a Figma link on a video item', trigger, actor });

  let scopeReason = fromLink ? `Manual check (pasted link) · Monday task found` : 'Manual check (pasted link)';
  if (item && !fromLink) {
    const s = inScope({ discipline: 'video', department: item.department, type: item.type, title: item.name }, cfg);
    if (!s.ok && !override_scope) return skip({ item, link, reason: s.reason, trigger, actor });
    scopeReason = s.ok ? s.reason : `Admin override — ${s.reason}`;
  }

  const target = await frameio.resolveTarget(link);
  if (!target || !['folder', 'stack', 'file', 'share'].includes(target.kind)) return skip({ item, link, reason: "Couldn't open the Frame.io link (no access, or not a folder, share link or video)", trigger, actor });

  let deliverables = await frameio.deliverablesForTarget(target);
  if (only_file_id) deliverables = deliverables.filter(d => d.rounds.some(r => r.file_id === only_file_id)).map(d => ({ ...d, head: d.rounds.find(r => r.file_id === only_file_id) }));
  if (!deliverables.length) return skip({ item, link, name: target.name, reason: 'No videos found at the Frame.io link yet', trigger, actor });

  if (!item) {
    const found = await findItemForLink({ target, deliverables }).catch(() => null);
    if (found?.discipline === 'video') { item = found; fromLink = true; scopeReason = 'Manual check (pasted link) · Monday task found'; }
  }

  if (item && !fromLink) {
    await db.query(
      `INSERT INTO captain_tracked (board_id, item_id, discipline, item_name, link, frameio_folder_id, frameio_project_id)
       VALUES ($1,$2,'video',$3,$4,$5,$6)
       ON CONFLICT (board_id, item_id) DO UPDATE SET item_name = EXCLUDED.item_name, link = EXCLUDED.link, frameio_folder_id = EXCLUDED.frameio_folder_id,
         frameio_project_id = EXCLUDED.frameio_project_id, active = true, updated_at = NOW()`,
      [item.board_id, item.id, item.name, link, target.folder_id, target.project_id],
    );
  }

  const brain = await loadBrain({ discipline: 'video', product: item?.product, campaign: item?.campaign, department: item?.department });
  const posting = postingFor(cfg, { frameioFolderId: target.folder_id, itemId: fromLink ? null : item?.id });
  const ctx = { item, brain, trigger, actor, force, scopeReason, target, fromLink };

  // Master first (biggest size per version); cut-downs are compared with their master's copy
  const results = [];
  const masters = {};
  for (const d of deliverables) {
    const key = d.variant || 0;
    const master = masters[key] && L.sizeRank(d.size) > L.sizeRank(masters[key].size) ? masters[key] : null;
    const r = await checkDeliverable({ d, round: d.head, ctx, cfg, posting, master });
    results.push(r);
    if (!masters[key] && (r.status === 'passed' || r.status === 'issues' || r.status === 'skipped') && r.on_screen_text?.length) {
      masters[key] = { label: d.label, round: d.head.round, size: d.size, on_screen_text: r.on_screen_text };
    }
  }

  // One Monday summary per Monday trigger (a pasted link only borrows the task's brief)
  const done = results.filter(r => ['passed', 'issues', 'error'].includes(r.status));
  if (item && !fromLink && done.length) {
    const errors = done.filter(r => r.status === 'error');
    const parts = done.map(r => r.status === 'error' ? `${r.label} (round ${r.round}): couldn't check — ${r.error}` : r.status === 'passed' ? `${r.label} (round ${r.round}) passed ✅` : `${r.label} (round ${r.round}): ${r.issue_count} issue${r.issue_count === 1 ? '' : 's'}`);
    const anyIssues = done.some(r => r.status === 'issues');
    const tail = anyIssues ? (posting.comments ? ' — see Frame.io comments' : '') : '';
    const body = `${PREFIX} ${parts.join(' · ')}${tail}${errors.length ? ' ⚠️' : ''}`;
    if (posting.monday) {
      try {
        await monday.postUpdate(item.id, body);
        await logEvent({ kind: 'post', discipline: 'video', board_id: item.board_id, item_id: item.id, message: 'Posted the Monday summary', data: { body }, actor });
      } catch (e) { await logEvent({ kind: 'error', discipline: 'video', board_id: item.board_id, item_id: item.id, message: `Monday update failed: ${e.message}`, actor }); }
    } else {
      await logEvent({ kind: 'post', discipline: 'video', board_id: item.board_id, item_id: item.id, message: `Monday summary not posted (posting: ${posting.mode})`, data: { body, would_post: true }, actor });
    }
  }
  return { results: results.map(({ on_screen_text, ...r }) => r), posting };
}

module.exports = { runVideoJob, findItemForLink, postingFor, commentText, normIssues, buildPrompt, briefBlock, grabThumb };
