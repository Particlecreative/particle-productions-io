const router = require('express').Router();
const db     = require('../db');
const { verifyJWT, requireAdmin } = require('../middleware/auth');

// ── Slack webhook helper ─────────────────────────────────────────────────────
async function sendSlack(webhookUrl, text) {
  if (!webhookUrl) return;
  try {
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
  } catch (err) {
    console.error('Slack webhook error:', err.message);
  }
}

// ── Platform notification helper ─────────────────────────────────────────────
async function createNotification(userId, type, message, productionId) {
  try {
    await db.query(
      `INSERT INTO notifications (user_id, type, message, production_id) VALUES ($1, $2, $3, $4)`,
      [userId, type, message, productionId || null]
    );
  } catch (err) {
    console.error('Notification insert error:', err.message);
  }
}

// ── Notify admin users (Tomer + Omer) ────────────────────────────────────────
async function notifyAdmins(message, productionId) {
  try {
    const { rows: admins } = await db.query(
      `SELECT id FROM users WHERE role = 'Admin' AND active = true AND deleted_at IS NULL`
    );
    for (const admin of admins) {
      await createNotification(admin.id, 'casting_alert', message, productionId);
    }
  } catch (err) {
    console.error('notifyAdmins error:', err.message);
  }
}

// ── Core automation logic (exported for scheduler use) ───────────────────────
async function runCastingAutomations() {
  const today = new Date().toISOString().slice(0, 10);
  const oneMonthFromNow = new Date();
  oneMonthFromNow.setMonth(oneMonthFromNow.getMonth() + 1);
  const monthStr = oneMonthFromNow.toISOString().slice(0, 10);

  const SLACK_WEBHOOK        = process.env.SLACK_WEBHOOK_URL;
  const SLACK_EXPIRING       = process.env.SLACK_EXPIRING_WEBHOOK_URL;
  const APP_URL              = process.env.APP_URL || 'https://cp.particleformen.com';

  const summary = {
    checked: 0,
    overdue: [],
    closeToOverdue: [],
    startDateNotified: [],
    errors: [],
  };

  try {
    const { rows: castMembers } = await db.query('SELECT * FROM casting');
    summary.checked = castMembers.length;

    for (const cast of castMembers) {
      try {
        // ── Rule 2 & 9: End Date arrives today → set Overdue, notify, Slack ──
        if (cast.end_date && cast.end_date.toISOString?.().slice(0, 10) === today ||
            (typeof cast.end_date === 'string' && cast.end_date.slice(0, 10) === today)) {
          const endDateStr = typeof cast.end_date === 'string' ? cast.end_date.slice(0, 10) : cast.end_date.toISOString().slice(0, 10);

          // Update status to Overdue (Rule 4 + 9 + 10)
          if (cast.contract_status !== 'Overdue') {
            await db.query(
              `UPDATE casting SET contract_status = 'Overdue' WHERE id = $1`,
              [cast.id]
            );
          }

          const msg = `Casting Rights OVERDUE: ${cast.name} — ${cast.project_name || cast.production_id}. End date: ${endDateStr}`;
          await notifyAdmins(msg, cast.production_id);

          // Slack to general channel
          await sendSlack(SLACK_WEBHOOK, `:rotating_light: ${msg}`);

          // Slack to #expiring-contracts
          const expiringMsg = [
            `:warning: Casting Rights Alert: ${cast.name} — ${cast.project_name || cast.production_id}`,
            `Status: Overdue`,
            `End Date: ${endDateStr}`,
            `View in CP Panel: ${APP_URL}/casting-rights`,
          ].join('\n');
          await sendSlack(SLACK_EXPIRING, expiringMsg);

          summary.overdue.push(cast.name);
        }

        // ── Rule 6: 1 month before End Date → set Close To Overdue, notify, Slack ──
        else if (
          (cast.end_date && (
            (cast.end_date.toISOString?.().slice(0, 10) === monthStr) ||
            (typeof cast.end_date === 'string' && cast.end_date.slice(0, 10) === monthStr)
          )) ||
          (cast.warning_date && (
            (cast.warning_date.toISOString?.().slice(0, 10) === today) ||
            (typeof cast.warning_date === 'string' && cast.warning_date.slice(0, 10) === today)
          ))
        ) {
          const endDateStr = cast.end_date
            ? (typeof cast.end_date === 'string' ? cast.end_date.slice(0, 10) : cast.end_date.toISOString().slice(0, 10))
            : 'N/A';

          // Update status to Close to Overdue (Rule 7 + 11)
          if (cast.contract_status !== 'Close to Overdue' && cast.contract_status !== 'Overdue') {
            await db.query(
              `UPDATE casting SET contract_status = 'Close to Overdue' WHERE id = $1`,
              [cast.id]
            );
          }

          const msg = `Casting Rights expiring soon: ${cast.name} — ${cast.project_name || cast.production_id}. End date: ${endDateStr}`;
          await notifyAdmins(msg, cast.production_id);

          // Slack to #expiring-contracts (Rule 3)
          const expiringMsg = [
            `:warning: Casting Rights Alert: ${cast.name} — ${cast.project_name || cast.production_id}`,
            `Status: Close To Overdue`,
            `End Date: ${endDateStr}`,
            `View in CP Panel: ${APP_URL}/casting-rights`,
          ].join('\n');
          await sendSlack(SLACK_EXPIRING, expiringMsg);

          summary.closeToOverdue.push(cast.name);
        }

        // ── Rule 1: Start Date arrives today → notify subscribers ──
        if (cast.start_date && (
          (cast.start_date.toISOString?.().slice(0, 10) === today) ||
          (typeof cast.start_date === 'string' && cast.start_date.slice(0, 10) === today)
        )) {
          const msg = `Casting contract started today: ${cast.name} — ${cast.project_name || cast.production_id}`;
          await notifyAdmins(msg, cast.production_id);
          summary.startDateNotified.push(cast.name);
        }

      } catch (castErr) {
        summary.errors.push(`${cast.name}: ${castErr.message}`);
      }
    }

    // Record last run timestamp
    await db.query(
      `INSERT INTO app_config (key, value) VALUES ('casting_automation_last_run', $1)
       ON CONFLICT (key) DO UPDATE SET value = $1`,
      [new Date().toISOString()]
    );

  } catch (err) {
    summary.errors.push(err.message);
    console.error('Casting automation fatal error:', err);
  }

  console.log(
    `[CastingAutomation] Checked ${summary.checked} members. ` +
    `Overdue: ${summary.overdue.length}, Close to overdue: ${summary.closeToOverdue.length}, ` +
    `Start notified: ${summary.startDateNotified.length}, Errors: ${summary.errors.length}`
  );

  return summary;
}

// ── Routes ───────────────────────────────────────────────────────────────────

router.use(verifyJWT);

// POST /api/casting-auto/run-automations  (admin only — manual trigger)
router.post('/run-automations', requireAdmin, async (req, res) => {
  try {
    const summary = await runCastingAutomations();
    res.json({ success: true, summary });
  } catch (err) {
    console.error('POST /casting-auto/run-automations error:', err);
    res.status(500).json({ error: 'Automation run failed' });
  }
});

// GET /api/casting-auto/last-run  (any authenticated user)
router.get('/last-run', async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT value FROM app_config WHERE key = 'casting_automation_last_run'`
    );
    res.json({ lastRun: rows[0]?.value || null });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Export both router and the core function (for cron/scheduler use)
module.exports = router;
module.exports.runCastingAutomations = runCastingAutomations;
