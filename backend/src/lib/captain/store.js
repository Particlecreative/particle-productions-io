/** Saving checks and issues — shared by the video and design pipelines. */
const db = require('../../db');

const toParam = (v) => (v && typeof v === 'object' && !(v instanceof Date) && !Buffer.isBuffer(v) ? JSON.stringify(v) : v);

async function insertCheck(fields) {
  const cols = Object.keys(fields);
  const { rows } = await db.query(
    `INSERT INTO captain_checks (${cols.join(',')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(',')}) RETURNING id`,
    cols.map(c => toParam(fields[c])),
  );
  return rows[0].id;
}

async function updateCheck(id, fields) {
  const cols = Object.keys(fields);
  await db.query(`UPDATE captain_checks SET ${cols.map((c, i) => `${c} = $${i + 2}`).join(', ')} WHERE id = $1`, [id, ...cols.map(c => toParam(fields[c]))]);
}

/** The most recent finished check for a dedupe key ("already checked?"). */
// Only a check whose comments reached the file (or that found nothing) counts as "already checked": a check from the
// test-posting days kept its notes in CP only, and reusing it sent a ticket to Fixes Round with nothing on Frame.io
// (Face Cream COPYCAT | SAVE MONEY, 17 Nov 2026) — such a file is checked again, and this time the notes are posted.
async function lastCheckOf(dedupeKey) {
  const { rows } = await db.query(`SELECT id, status, issue_count, raw FROM captain_checks WHERE dedupe_key = $1 AND status IN ('passed','issues')
      AND (posted_at IS NOT NULL OR coalesce(issue_count, 0) = 0) ORDER BY created_at DESC LIMIT 1`, [dedupeKey]);
  return rows[0] || null;
}

async function insertIssue(checkId, i) {
  await db.query(
    `INSERT INTO captain_issues (check_id, idx, start_s, end_s, frame, duration_frames, node_id, frame_node_id, found, fix, type, severity, note, line_id, rule, data)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
    [checkId, i.idx, i.start_s ?? null, i.end_s ?? null, i.frame ?? null, i.duration_frames ?? null, i.node_id ?? null, i.frame_node_id ?? null, i.found, i.fix, i.type, i.severity, i.note,
      i.line_id ?? null, i.rule ?? null, i.data ? JSON.stringify(i.data) : null],
  );
}

/** The approved on-screen text locked to a Monday item by the brief pre-flight (null if its brief never went through it). */
async function approvedTextFor(itemId) {
  if (!itemId) return null;
  const { rows } = await db.query('SELECT * FROM captain_approved_text WHERE item_id = $1', [String(itemId)]).catch(() => ({ rows: [] }));
  return rows[0] || null;
}

async function setIssueComment(checkId, idx, commentId) {
  await db.query('UPDATE captain_issues SET comment_id = $3 WHERE check_id = $1 AND idx = $2', [checkId, idx, String(commentId)]);
}

/**
 * "Please check" notes already posted on an earlier round of the same deliverable (Tomer, 23 Nov 2026 — think as the
 * editor: the hook note came back in all 4 rounds of COPYCAT | RESELLERS after the editor had decided). Returns
 * seen(issue) → true when the same kind of note (same found, or same fix) was said before. Must-fixes always repeat:
 * one still there is still a must.
 */
const wordsOnly = (s) => String(s || '').normalize('NFKD').replace(/[^\p{L}\p{N}]+/gu, ' ').trim().toLowerCase();
async function saidBefore({ discipline, itemId, deliverable = null, nodeId = null, excludeId }) {
  if (!itemId) return () => false;
  const { rows } = await db.query(
    `SELECT i.type, i.found, i.fix FROM captain_issues i JOIN captain_checks c ON c.id = i.check_id
      WHERE c.discipline = $1 AND c.item_id = $2 AND c.id <> $3 AND c.posted_at IS NOT NULL AND i.severity = 'check'
        AND ($4::text IS NULL OR c.deliverable = $4) AND ($5::text IS NULL OR c.asset->>'node_id' = $5)`,
    [discipline, String(itemId), excludeId, deliverable, nodeId]).catch(() => ({ rows: [] }));
  const byFound = new Set(), byFix = new Set();
  for (const r of rows) {
    if (wordsOnly(r.found)) byFound.add(`${r.type}|${wordsOnly(r.found)}`);
    if (wordsOnly(r.fix)) byFix.add(`${r.type}|${wordsOnly(r.fix)}`);
  }
  return (i) => i?.severity === 'check' && ((wordsOnly(i.found) && byFound.has(`${i.type}|${wordsOnly(i.found)}`)) || (wordsOnly(i.fix) && byFix.has(`${i.type}|${wordsOnly(i.fix)}`)));
}

module.exports = { insertCheck, updateCheck, lastCheckOf, insertIssue, setIssueComment, approvedTextFor, saidBefore };
