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
async function lastCheckOf(dedupeKey) {
  const { rows } = await db.query(`SELECT id, status, issue_count, raw FROM captain_checks WHERE dedupe_key = $1 AND status IN ('passed','issues') ORDER BY created_at DESC LIMIT 1`, [dedupeKey]);
  return rows[0] || null;
}

async function insertIssue(checkId, i) {
  await db.query(
    `INSERT INTO captain_issues (check_id, idx, start_s, end_s, frame, duration_frames, node_id, frame_node_id, found, fix, type, severity, note)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
    [checkId, i.idx, i.start_s ?? null, i.end_s ?? null, i.frame ?? null, i.duration_frames ?? null, i.node_id ?? null, i.frame_node_id ?? null, i.found, i.fix, i.type, i.severity, i.note],
  );
}

async function setIssueComment(checkId, idx, commentId) {
  await db.query('UPDATE captain_issues SET comment_id = $3 WHERE check_id = $1 AND idx = $2', [checkId, idx, String(commentId)]);
}

module.exports = { insertCheck, updateCheck, lastCheckOf, insertIssue, setIssueComment };
