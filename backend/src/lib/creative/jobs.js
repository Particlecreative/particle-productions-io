/**
 * Creative Weekly scheduled jobs (node-cron, Asia/Jerusalem):
 *   Sun 08:00  auto-generate last week's deck + narrative, Slack ping (opt-in: creative_config.auto_generate.enabled)
 *   daily 03:15  Frame.io token keepalive (Adobe refresh tokens lapse after ~14 days unused)
 *   daily 04:10  prune the media cache
 */
const db = require('../../db');
const W = require('./week');
const { getCreativeConfig } = require('./config');
const service = require('./service');

const TZ = { timezone: 'Asia/Jerusalem' };

async function slack(text, blocks) {
  const url = process.env.SLACK_CREATIVE_WEBHOOK_URL || process.env.SLACK_WEBHOOK_URL;
  if (!url) return;
  try {
    await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, blocks }), signal: AbortSignal.timeout(10000) });
  } catch (e) { console.warn('[creative] Slack post failed:', e.message); }
}

async function autoGenerate({ brandId = 'particle' } = {}) {
  const config = await getCreativeConfig(brandId);
  if (!config.auto_generate?.enabled) return { skipped: 'disabled' };
  const client = await db.connect();
  try {
    const { rows } = await client.query("SELECT pg_try_advisory_lock(hashtext('creative_autogen')) AS ok");
    if (!rows[0]?.ok) return { skipped: 'locked' };
    try {
      const weekStart = W.addDays(W.sundayOf(Date.now()), -7);
      const { report, created } = await service.generateReport({ brandId, weekStart, user: { name: 'Sunday automation' } });
      if (created && process.env.ANTHROPIC_API_KEY) {
        try {
          const { generateNarrative } = require('./narrative');
          const narrative = await generateNarrative(report);
          await service.updateReport(report.id, report.revision, { narrative });
        } catch (e) { console.warn('[creative] auto narrative failed:', e.message); }
      }
      const t = report.snapshot?.metrics?.totals || {};
      const appUrl = (process.env.APP_URL || '').replace(/\/$/, '');
      const link = `${appUrl}/creative-reports/${report.id}`;
      const text = `Creative Weekly ready: ${report.snapshot?.week?.label} — ${t.video ?? 0} videos, ${t.design ?? 0} designs delivered`;
      await slack(text, [
        { type: 'section', text: { type: 'mrkdwn', text: `*Creative Weekly is ready* — ${report.snapshot?.week?.label}` } },
        { type: 'section', fields: [
          { type: 'mrkdwn', text: `*Videos delivered*\n${t.video ?? 0}` },
          { type: 'mrkdwn', text: `*Designs delivered*\n${t.design ?? 0}` },
          { type: 'mrkdwn', text: `*In progress*\n${t.in_progress ?? 0}` },
          { type: 'mrkdwn', text: `*Planned next week*\n${t.planned_next ?? 0}` },
        ] },
        { type: 'actions', elements: [{ type: 'button', text: { type: 'plain_text', text: 'Open the deck' }, url: link, style: 'primary' }] },
      ]);
      return { ok: true, report_id: report.id, created };
    } finally {
      await client.query("SELECT pg_advisory_unlock(hashtext('creative_autogen'))").catch(() => null);
    }
  } finally { client.release(); }
}

function schedule(cron) {
  cron.schedule('0 8 * * 0', async () => {
    try { console.log('[CRON] Creative Weekly auto-generate:', await autoGenerate()); } catch (e) { console.error('[CRON] Creative Weekly auto-generate failed:', e.message); }
  }, TZ);

  cron.schedule('15 3 * * *', async () => {
    try {
      const fio = require('./providers/frameio');
      await fio.keepalive();
    } catch (e) {
      console.error('[CRON] Frame.io keepalive failed:', e.message);
      await slack(`Frame.io connection for Creative Weekly needs attention: ${e.message}. Reconnect it from Creative Weekly → Integrations.`);
    }
  }, TZ);

  cron.schedule('10 4 * * *', async () => {
    try { console.log('[CRON] Creative media cache prune:', await require('./media').pruneCache()); } catch (e) { console.error('[CRON] Creative media prune failed:', e.message); }
  }, TZ);
}

module.exports = { schedule, autoGenerate };
