/**
 * Creative Weekly persistence + orchestration (shared by routes and the Sunday cron).
 */
const db = require('../../db');
const { buildSnapshot, hashSnapshot } = require('./snapshot');
const { getCreativeConfig } = require('./config');
const { diffSnapshots } = require('./diff');
const W = require('./week');

const MAX_AUTO_VERSIONS = 20;
const inFlight = new Map(); // brand|week → promise (single-flight generate/refresh)

function singleFlight(key, fn) {
  if (inFlight.has(key)) return inFlight.get(key);
  const p = (async () => fn())().finally(() => inFlight.delete(key));
  inFlight.set(key, p);
  return p;
}

const REPORT_COLS = `id, brand_id, week_start, title, status, snapshot, snapshot_hash, overrides, template, narrative, revision,
  generated_at, generated_by, generated_by_name, generation_ms, finalized_at, finalized_by_name,
  share_token, share_expires_at, share_created_at, created_at, updated_at`;

async function getReport(id) {
  const { rows } = await db.query(`SELECT ${REPORT_COLS} FROM creative_reports WHERE id = $1`, [id]);
  return rows[0] || null;
}

async function getReportByWeek(brandId, weekStart) {
  const { rows } = await db.query(`SELECT ${REPORT_COLS} FROM creative_reports WHERE brand_id = $1 AND week_start = $2`, [brandId, weekStart]);
  return rows[0] || null;
}

async function listReports(brandId) {
  const { rows } = await db.query(
    `SELECT id, week_start, title, status, revision, generated_at, updated_at, share_token, share_expires_at,
            snapshot->'metrics'->'totals' AS totals, snapshot->'week'->>'label' AS week_label,
            (snapshot->'week'->>'number')::int AS week_number
       FROM creative_reports WHERE brand_id = $1 ORDER BY week_start DESC`, [brandId]);
  return rows;
}

async function nextVersionNumber(reportId) {
  const { rows } = await db.query('SELECT COALESCE(MAX(version_number), 0) + 1 AS n FROM creative_report_versions WHERE report_id = $1', [reportId]);
  return rows[0].n;
}

async function saveVersion(report, { reason = 'manual', label = null, user = null } = {}) {
  const n = await nextVersionNumber(report.id);
  const { rows } = await db.query(
    `INSERT INTO creative_report_versions (report_id, version_number, reason, label, report_revision, snapshot, overrides, template, narrative, created_by, created_by_name)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     RETURNING id, version_number, reason, label, report_revision, created_by_name, created_at`,
    [report.id, n, reason, label, report.revision, JSON.stringify(report.snapshot || {}), JSON.stringify(report.overrides || {}),
      JSON.stringify(report.template || {}), report.narrative ? JSON.stringify(report.narrative) : null,
      await userRef(user), user?.name || null]
  );
  if (reason !== 'manual') {
    // Keep only the most recent automatic versions
    await db.query(
      `DELETE FROM creative_report_versions WHERE report_id = $1 AND reason <> 'manual' AND id NOT IN (
         SELECT id FROM creative_report_versions WHERE report_id = $1 AND reason <> 'manual' ORDER BY version_number DESC LIMIT $2)`,
      [report.id, MAX_AUTO_VERSIONS]
    );
  }
  return rows[0];
}

function isUuid(v) { return typeof v === 'string' && /^[0-9a-f-]{36}$/i.test(v); }

/** users.id for FK columns — null when the token's user no longer exists (FK would reject it). */
async function userRef(user) {
  if (!isUuid(user?.id)) return null;
  try {
    const { rows } = await db.query('SELECT 1 FROM users WHERE id = $1', [user.id]);
    return rows[0] ? user.id : null;
  } catch { return null; }
}

function weekTitle(snapshot) {
  return `Week ${snapshot.week.number} · ${snapshot.week.label}`;
}

/**
 * Generate a new report for a week. Returns { report, created } — if one exists, { report, created: false }.
 */
async function generateReport({ brandId, weekStart, user }) {
  W.weekBounds(weekStart); // validates Sunday
  return singleFlight(`${brandId}|${weekStart}`, async () => {
    const existing = await getReportByWeek(brandId, weekStart);
    if (existing) return { report: existing, created: false };
    const config = await getCreativeConfig(brandId);
    const t0 = Date.now();
    const snapshot = await buildSnapshot({ brandId, weekStart });
    const { rows } = await db.query(
      `INSERT INTO creative_reports (brand_id, week_start, title, snapshot, snapshot_hash, overrides, template,
                                     generated_at, generated_by, generated_by_name, generation_ms)
       VALUES ($1,$2,$3,$4,$5,'{}'::jsonb,$6,NOW(),$7,$8,$9)
       ON CONFLICT (brand_id, week_start) DO NOTHING
       RETURNING ${REPORT_COLS}`,
      [brandId, weekStart, weekTitle(snapshot), JSON.stringify(snapshot), hashSnapshot(snapshot),
        JSON.stringify(config.default_template), await userRef(user), user?.name || 'Automation', Date.now() - t0]
    );
    if (!rows[0]) return { report: await getReportByWeek(brandId, weekStart), created: false };
    return { report: rows[0], created: true };
  });
}

/**
 * Rebuild the snapshot from live data, keep overrides. Saves a pre_refresh version first.
 */
async function refreshReport(report, { user, dryRun = false } = {}) {
  return singleFlight(`${report.brand_id}|${report.week_start}|refresh`, async () => {
    const t0 = Date.now();
    const snapshot = await buildSnapshot({ brandId: report.brand_id, weekStart: report.week_start, force: true });
    // Links added by hand (production videos / images) aren't on any ticket — keep them
    for (const [refId, ref] of Object.entries(report.snapshot?.media_refs || {})) {
      if (ref?.custom && !snapshot.media_refs[refId]) snapshot.media_refs[refId] = ref;
    }
    const diff = diffSnapshots(report.snapshot || {}, snapshot, report.overrides || {});
    if (dryRun) return { report, diff };
    await saveVersion(report, { reason: 'pre_refresh', user });
    const { rows } = await db.query(
      `UPDATE creative_reports SET snapshot = $2, snapshot_hash = $3, generated_at = NOW(), generation_ms = $4,
              revision = revision + 1, updated_at = NOW()
        WHERE id = $1 RETURNING ${REPORT_COLS}`,
      [report.id, JSON.stringify(snapshot), hashSnapshot(snapshot), Date.now() - t0]
    );
    return { report: rows[0], diff };
  });
}

/** Optimistic-locked partial update. Returns { report } or { conflict: currentRevision }. */
async function updateReport(id, baseRevision, patch) {
  const sets = [];
  const vals = [id, baseRevision];
  const add = (col, val, json = true) => { vals.push(json ? JSON.stringify(val) : val); sets.push(`${col} = $${vals.length}`); };
  if ('overrides' in patch) add('overrides', patch.overrides || {});
  if ('template' in patch) add('template', patch.template || {});
  if ('narrative' in patch) add('narrative', patch.narrative ?? null);
  if ('title' in patch) add('title', String(patch.title || '').slice(0, 200), false);
  if ('snapshot' in patch) { add('snapshot', patch.snapshot); add('snapshot_hash', hashSnapshot(patch.snapshot), false); }
  if (!sets.length) return { report: await getReport(id) };
  const { rows } = await db.query(
    `UPDATE creative_reports SET ${sets.join(', ')}, revision = revision + 1, updated_at = NOW()
      WHERE id = $1 AND revision = $2 RETURNING ${REPORT_COLS}`, vals);
  if (rows[0]) return { report: rows[0] };
  const cur = await getReport(id);
  if (!cur) return { notFound: true };
  return { conflict: cur.revision, report: cur };
}

async function setStatus(report, status, user) {
  if (status === 'final') await saveVersion(report, { reason: 'finalize', user });
  const { rows } = await db.query(
    `UPDATE creative_reports SET status = $2,
            finalized_at = CASE WHEN $2 = 'final' THEN NOW() ELSE NULL END,
            finalized_by_name = CASE WHEN $2 = 'final' THEN $3 ELSE NULL END,
            revision = revision + 1, updated_at = NOW()
      WHERE id = $1 RETURNING ${REPORT_COLS}`, [report.id, status, user?.name || null]);
  return rows[0];
}

async function listVersions(reportId) {
  const { rows } = await db.query(
    `SELECT id, version_number, reason, label, report_revision, created_by_name, created_at
       FROM creative_report_versions WHERE report_id = $1 ORDER BY version_number DESC`, [reportId]);
  return rows;
}

async function getVersion(reportId, versionId) {
  const { rows } = await db.query('SELECT * FROM creative_report_versions WHERE report_id = $1 AND id = $2', [reportId, versionId]);
  return rows[0] || null;
}

async function restoreVersion(report, version, user) {
  await saveVersion(report, { reason: 'pre_restore', user });
  const { rows } = await db.query(
    `UPDATE creative_reports SET snapshot = $2, snapshot_hash = $3, overrides = $4, template = $5, narrative = $6,
            revision = revision + 1, updated_at = NOW()
      WHERE id = $1 RETURNING ${REPORT_COLS}`,
    [report.id, JSON.stringify(version.snapshot), hashSnapshot(version.snapshot), JSON.stringify(version.overrides),
      JSON.stringify(version.template), version.narrative ? JSON.stringify(version.narrative) : null]);
  return rows[0];
}

module.exports = {
  REPORT_COLS, getReport, getReportByWeek, listReports, generateReport, refreshReport, updateReport,
  setStatus, saveVersion, listVersions, getVersion, restoreVersion, weekTitle, isUuid,
};
