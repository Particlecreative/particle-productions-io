/**
 * Completed = closed (Tomer, 25 Nov 2026: "make all completed closed"). A production that reaches Completed has its
 * budget locked (🔒 — closed for finance) by itself; the ones already Completed but never locked are closed in one go
 * from the Finance dashboard. The lock is written to change history and the finance log like a hand-made one, but
 * sends no email — finance already got the "completed" email (and a bulk close mustn't flood anyone).
 */
const db = require('../../db');
const B = require('./budget');
const Events = require('./events');

/** Lock one production if it isn't locked yet (inside `client`, a pool or a transaction). → true when it locked it. */
async function closeOne(client, prod, { actor = 'CP', note = 'Closed automatically — the production is Completed.', userId = null } = {}) {
  const { rows } = await client.query(
    `UPDATE productions SET locked = TRUE, locked_at = NOW(), locked_by = $2, updated_at = NOW()
      WHERE id = $1 AND NOT COALESCE(locked, FALSE) RETURNING id, brand_id, project_name`, [prod.id, actor]);
  if (!rows[0]) return false;
  await client.query(
    `INSERT INTO change_history (production_id, field, old_value, new_value, user_id, user_name) VALUES ($1, 'locked', 'Open', 'Closed', $2, $3)`,
    [prod.id, userId, actor]);
  await Events.record(client, [{
    brand_id: rows[0].brand_id, production_id: prod.id, kind: 'locked', label: rows[0].project_name,
    old_value: 'open', new_value: 'closed', note, notify: null, source: 'system', user_name: actor,
  }]);
  return true;
}

/** Completed productions whose budget isn't locked yet. */
async function openCompleted() {
  const { rows } = await db.query(
    `SELECT id, brand_id, project_name, stage FROM productions WHERE NOT COALESCE(locked, FALSE) AND stage IS NOT NULL ORDER BY id`);
  return rows.filter(p => B.normalizeStage(p.stage) === 'Completed');
}

/** Close them all (one transaction each, so one problem doesn't stop the rest). → { closed, ids, failed } */
async function closeAllCompleted({ actor = 'CP', userId = null } = {}) {
  const list = await openCompleted();
  const ids = [], failed = [];
  for (const p of list) {
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      if (await closeOne(client, p, { actor, userId, note: `Closed with “Close all completed” by ${actor}.` })) ids.push(p.id);
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      failed.push({ id: p.id, error: e.message });
    } finally { client.release(); }
  }
  for (const id of ids) { try { require('../financeSheet').triggerFinanceSync(id); } catch { /* the sheet is best-effort */ } }
  return { closed: ids.length, ids, failed };
}

module.exports = { closeOne, openCompleted, closeAllCompleted };
