const router = require('express').Router();
const db = require('../db');

// GET /api/calendar/:brandId.ics — public ICS feed for Google Calendar subscription
router.get('/:brandId.ics', async (req, res) => {
  const { brandId } = req.params;
  try {
    const { rows } = await db.query(
      `SELECT id, project_name, planned_start, planned_end, stage, producer,
              shoot_dates, delivery_date, air_date
       FROM productions WHERE brand_id = $1 ORDER BY planned_start ASC`,
      [brandId]
    );

    const now = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
    let ics = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//CP Panel//Production Calendar//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      `X-WR-CALNAME:${brandId.charAt(0).toUpperCase() + brandId.slice(1)} Productions`,
      'X-WR-TIMEZONE:Asia/Jerusalem',
    ];

    for (const prod of rows) {
      // Main production timeline
      if (prod.planned_start) {
        const start = fmtDate(prod.planned_start);
        const end = prod.planned_end ? fmtDate(prod.planned_end, 1) : fmtDate(prod.planned_start, 1);
        ics.push(
          'BEGIN:VEVENT',
          `UID:${prod.id}-timeline@cppanel`,
          `DTSTAMP:${now}`,
          `DTSTART;VALUE=DATE:${start}`,
          `DTEND;VALUE=DATE:${end}`,
          `SUMMARY:${esc(prod.project_name)}`,
          `DESCRIPTION:${esc(`Stage: ${prod.stage || 'N/A'}\\nProducer: ${prod.producer || 'N/A'}\\nID: ${prod.id}`)}`,
          `CATEGORIES:Production`,
          'END:VEVENT'
        );
      }

      // Shoot dates
      if (Array.isArray(prod.shoot_dates)) {
        prod.shoot_dates.forEach((sd, i) => {
          if (!sd) return;
          ics.push(
            'BEGIN:VEVENT',
            `UID:${prod.id}-shoot-${i}@cppanel`,
            `DTSTAMP:${now}`,
            `DTSTART;VALUE=DATE:${fmtDate(sd)}`,
            `DTEND;VALUE=DATE:${fmtDate(sd, 1)}`,
            `SUMMARY:🎬 SHOOT: ${esc(prod.project_name)}`,
            `CATEGORIES:Shoot`,
            'END:VEVENT'
          );
        });
      }

      // Delivery date
      if (prod.delivery_date) {
        ics.push(
          'BEGIN:VEVENT',
          `UID:${prod.id}-delivery@cppanel`,
          `DTSTAMP:${now}`,
          `DTSTART;VALUE=DATE:${fmtDate(prod.delivery_date)}`,
          `DTEND;VALUE=DATE:${fmtDate(prod.delivery_date, 1)}`,
          `SUMMARY:📦 DELIVERY: ${esc(prod.project_name)}`,
          `CATEGORIES:Delivery`,
          'END:VEVENT'
        );
      }

      // Air date
      if (prod.air_date) {
        ics.push(
          'BEGIN:VEVENT',
          `UID:${prod.id}-air@cppanel`,
          `DTSTAMP:${now}`,
          `DTSTART;VALUE=DATE:${fmtDate(prod.air_date)}`,
          `DTEND;VALUE=DATE:${fmtDate(prod.air_date, 1)}`,
          `SUMMARY:📺 ON AIR: ${esc(prod.project_name)}`,
          `CATEGORIES:Air Date`,
          'END:VEVENT'
        );
      }
    }

    ics.push('END:VCALENDAR');

    res.set({
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `inline; filename="${brandId}-productions.ics"`,
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    });
    res.send(ics.join('\r\n'));
  } catch (err) {
    console.error('GET /calendar error:', err);
    res.status(500).send('Error generating calendar');
  }
});

function fmtDate(d, addDays = 0) {
  const date = new Date(d);
  date.setDate(date.getDate() + addDays);
  return date.toISOString().slice(0, 10).replace(/-/g, '');
}

function esc(str) {
  return (str || '').replace(/[,;\\]/g, c => '\\' + c).replace(/\n/g, '\\n');
}

module.exports = router;
