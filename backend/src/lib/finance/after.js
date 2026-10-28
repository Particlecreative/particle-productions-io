/**
 * After a budget change commits: push the finance sheet, warn when the unexpected buffer runs low,
 * read new invoices with Claude, and send instant alerts. All best-effort and non-blocking.
 */
const db = require('../../db');

function afterLines(productionId, out, { invoiceChanged = [] } = {}) {
  setImmediate(async () => {
    try { require('../financeSheet').triggerFinanceSync(productionId); } catch (e) { console.error('[finance] sheet trigger:', e.message); }
    try { await checkBuffer(productionId); } catch (e) { console.error('[finance] buffer check:', e.message); }
    if (invoiceChanged.length) {
      try { require('./invoiceReader').queueLines(invoiceChanged); } catch (e) { console.error('[finance] invoice reader:', e.message); }
    }
    if (out?.events?.some(e => e.notify === 'instant')) {
      try { await require('./notify').run(); } catch (e) { console.error('[finance] notify:', e.message); }
    }
  });
}

/** Approved production past the warning line (default 80% of the unexpected used) → one email to Omer + Tomer. */
async function checkBuffer(productionId) {
  const B = require('./budget');
  const T = require('./totals');
  const fx = require('./fx');
  const cfg = await require('./config').get();
  const { rows } = await db.query('SELECT * FROM productions WHERE id = $1', [productionId]);
  const prod = rows[0];
  if (!prod || !B.isApproved(prod)) return;
  const lines = await T.loadLines(db, productionId);
  const st = B.budgetState(prod, lines, fx.latest().rate);
  const warn = st.bufferTotal > 0 && st.usedPct >= cfg.buffer_warn_pct;
  if (warn && !prod.buffer_warned_at) {
    const { rowCount } = await db.query('UPDATE productions SET buffer_warned_at = NOW() WHERE id = $1 AND buffer_warned_at IS NULL', [productionId]);
    if (!rowCount) return;   // another write already warned
    const tpl = require('./templates');
    const mail = tpl.bufferWarning({ prod, state: st });
    await require('./mailer').queue({ kind: 'buffer_warning', production_id: productionId, to: cfg.internal, subject: mail.subject, html: mail.html });
    await require('./events').record(db, [{
      brand_id: prod.brand_id, production_id: productionId, kind: 'buffer_warning', label: prod.project_name, source: 'system',
      new_value: `${st.usedPct}%`, meta: { left: st.bufferLeft, total: st.bufferTotal },
    }]);
  } else if (!warn && prod.buffer_warned_at && st.usedPct < cfg.buffer_warn_pct - 5) {
    await db.query('UPDATE productions SET buffer_warned_at = NULL WHERE id = $1', [productionId]);
  }
}

module.exports = { afterLines, checkBuffer };
