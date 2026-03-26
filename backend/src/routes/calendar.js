const router = require('express').Router();
const db     = require('../db');

// ── Helpers ──────────────────────────────────────────

/** Format a JS Date (or date string) as ICS all-day date: YYYYMMDD */
function fmtDate(d) {
  const dt = typeof d === 'string' ? new Date(d) : d;
  const y  = dt.getUTCFullYear();
  const m  = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${y}${m}${dd}`;
}

/** Add one day (all-day DTEND is exclusive in ICS) */
function nextDay(d) {
  const dt = typeof d === 'string' ? new Date(d) : new Date(d);
  dt.setUTCDate(dt.getUTCDate() + 1);
  return fmtDate(dt);
}

/** Escape special ICS text characters */
function icsEscape(str) {
  if (!str) return '';
  return str
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

/** Build a single VEVENT block */
function vevent({ uid, dtstart, dtend, summary, description }) {
  const now = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const lines = [
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${now}`,
    `DTSTART;VALUE=DATE:${dtstart}`,
    `DTEND;VALUE=DATE:${dtend}`,
    `SUMMARY:${icsEscape(summary)}`,
  ];
  if (description) lines.push(`DESCRIPTION:${icsEscape(description)}`);
  lines.push('END:VEVENT');
  return lines.join('\r\n');
}

// ── Public ICS feed (no JWT — token query-param auth) ─

// GET /api/calendar/:brandId.ics?token=SECRET
router.get('/:brandId.ics', async (req, res) => {
  try {
    // Simple token check so the URL isn't fully public
    const expectedToken = process.env.CALENDAR_TOKEN || 'cp-cal-2026';
    if (req.query.token !== expectedToken) {
      return res.status(403).send('Forbidden');
    }

    const { brandId } = req.params;

    // Fetch brand name for the calendar title
    const brandRes = await db.query('SELECT name FROM brands WHERE id = $1', [brandId]);
    const brandName = brandRes.rows[0]?.name || brandId;

    // Fetch all productions for this brand
    const { rows: productions } = await db.query(
      `SELECT id, project_name, production_type, producer, stage,
              planned_start, planned_end, shoot_dates, delivery_date, air_date
       FROM productions
       WHERE brand_id = $1
       ORDER BY planned_start ASC NULLS LAST`,
      [brandId]
    );

    // Build VEVENT entries
    const events = [];

    for (const p of productions) {
      const desc = [
        p.production_type ? `Type: ${p.production_type}` : null,
        p.producer        ? `Producer: ${p.producer}`    : null,
        p.stage           ? `Stage: ${p.stage}`          : null,
      ].filter(Boolean).join('\\n');

      // 1. Main production timeline (planned_start -> planned_end)
      if (p.planned_start) {
        events.push(vevent({
          uid:         `${p.id}-timeline@cppanel`,
          dtstart:     fmtDate(p.planned_start),
          dtend:       p.planned_end ? nextDay(p.planned_end) : nextDay(p.planned_start),
          summary:     `${p.id} ${p.project_name}`,
          description: desc,
        }));
      }

      // 2. Shoot dates (TEXT[] column in DB)
      if (Array.isArray(p.shoot_dates) && p.shoot_dates.length) {
        p.shoot_dates.forEach((sd, idx) => {
          if (!sd) return;
          events.push(vevent({
            uid:         `${p.id}-shoot-${idx}@cppanel`,
            dtstart:     fmtDate(sd),
            dtend:       nextDay(sd),
            summary:     `[Shoot] ${p.id} ${p.project_name}`,
            description: desc,
          }));
        });
      }

      // 3. Delivery date
      if (p.delivery_date) {
        events.push(vevent({
          uid:         `${p.id}-delivery@cppanel`,
          dtstart:     fmtDate(p.delivery_date),
          dtend:       nextDay(p.delivery_date),
          summary:     `[Delivery] ${p.id} ${p.project_name}`,
          description: desc,
        }));
      }

      // 4. Air date
      if (p.air_date) {
        events.push(vevent({
          uid:         `${p.id}-airdate@cppanel`,
          dtstart:     fmtDate(p.air_date),
          dtend:       nextDay(p.air_date),
          summary:     `[Air Date] ${p.id} ${p.project_name}`,
          description: desc,
        }));
      }
    }

    // Assemble full ICS document
    const ics = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//CP Panel//Production Calendar//EN',
      'CALSCALE:GREGORIAN',
      `X-WR-CALNAME:${icsEscape(brandName)} Productions`,
      '',
      events.join('\r\n'),
      '',
      'END:VCALENDAR',
    ].join('\r\n');

    res.set('Content-Type', 'text/calendar; charset=utf-8');
    res.set('Content-Disposition', `attachment; filename="${brandId}.ics"`);
    res.send(ics);
  } catch (err) {
    console.error('Calendar feed error:', err);
    res.status(500).send('Internal server error');
  }
});

module.exports = router;
