const db = require('../db');

/**
 * Log any user action to change_history.
 * Works for ALL entities — not just productions.
 *
 * @param {object} opts
 * @param {string} opts.production_id - Production ID (nullable for non-production entities)
 * @param {string} opts.entity - Entity type: 'production', 'line_item', 'invoice', 'comment', 'casting', 'link', 'script', 'supplier', 'gantt', 'cc_purchase', 'call_sheet'
 * @param {string} opts.entity_id - The specific entity ID (e.g., line item ID, invoice ID)
 * @param {string} opts.action - 'create', 'update', 'delete', 'status_change'
 * @param {string} opts.field - Field changed (e.g., 'stage', 'amount', 'status')
 * @param {string} opts.old_value - Previous value (nullable)
 * @param {string} opts.new_value - New value
 * @param {string} opts.user_id - User ID
 * @param {string} opts.user_name - User display name
 * @param {string} opts.summary - Human-readable summary (e.g., "Added line item 'Director' to PRD26-01")
 */
async function logAction(opts) {
  try {
    await db.query(
      `INSERT INTO change_history (production_id, field, old_value, new_value, user_id, user_name)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        opts.production_id || null,
        opts.summary || `${opts.action || 'update'}: ${opts.entity || ''}${opts.field ? ' → ' + opts.field : ''}`,
        opts.old_value || null,
        opts.new_value || opts.summary || null,
        opts.user_id || null,
        opts.user_name || null,
      ]
    );
  } catch (err) {
    console.warn('[AUDIT] Log failed:', err.message);
  }
}

module.exports = { logAction };
