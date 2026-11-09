/** Captain Caption activity log — every event, including skips. Never throws (logging must not break a check). */
const db = require('../../db');

async function logEvent({ kind, discipline = null, board_id = null, item_id = null, check_id = null, message = null, data = {}, actor = null }) {
  try {
    await db.query(
      `INSERT INTO captain_events (kind, discipline, board_id, item_id, check_id, message, data, actor) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [kind, discipline, board_id ? String(board_id) : null, item_id ? String(item_id) : null, check_id, message, JSON.stringify(data || {}), actor],
    );
  } catch (e) { console.warn('[captain] log failed:', e.message); }
  if (kind === 'error') console.warn(`[captain] ${message}`);
}

module.exports = { logEvent };
