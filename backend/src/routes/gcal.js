const router = require('express').Router();
const { google } = require('googleapis');
const db = require('../db');
const { verifyJWT, requireAdmin } = require('../middleware/auth');

const GOOGLE_CLIENT_ID     = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const GOOGLE_REDIRECT_URI  = process.env.GOOGLE_REDIRECT_URI;

const PHASE_COLORS = {
  'Concepts': '1',        // Lavender
  'Scripting': '9',       // Blueberry
  'Pre Production': '7',  // Peacock
  'Production': '10',     // Basil
  'Post Production': '6', // Tangerine
};

async function getCalendarClient() {
  const { rows } = await db.query("SELECT google_tokens FROM settings WHERE brand_id = 'particle'");
  if (!rows[0]?.google_tokens) throw new Error('Google not connected');
  const tokens = typeof rows[0].google_tokens === 'string'
    ? JSON.parse(rows[0].google_tokens) : rows[0].google_tokens;
  const oauth2 = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI);
  oauth2.setCredentials(tokens);
  // Auto-refresh tokens
  oauth2.on('tokens', async (newTokens) => {
    const merged = { ...tokens, ...newTokens };
    await db.query("UPDATE settings SET google_tokens = $1 WHERE brand_id = 'particle'", [JSON.stringify(merged)]);
  });
  return google.calendar({ version: 'v3', auth: oauth2 });
}

async function getCalendarId() {
  const { rows } = await db.query("SELECT gcal_calendar_id FROM settings WHERE brand_id = 'particle'");
  return rows[0]?.gcal_calendar_id;
}

// ── POST /api/gcal/webhook — Google Calendar push notification (PUBLIC) ──────
router.post('/webhook', async (req, res) => {
  res.status(200).end(); // Respond immediately
  try {
    const calendar = await getCalendarClient();
    const calendarId = await getCalendarId();
    if (!calendarId) return;
    const { data } = await calendar.events.list({
      calendarId, maxResults: 500, singleEvents: true, orderBy: 'startTime',
    });
    for (const ge of (data.items || [])) {
      if (ge.status === 'cancelled') {
        await db.query('DELETE FROM gantt_events WHERE gcal_event_id = $1', [ge.id]);
        continue;
      }
      const { rows } = await db.query('SELECT * FROM gantt_events WHERE gcal_event_id = $1', [ge.id]);
      if (rows[0]) {
        const newStart = ge.start?.date || ge.start?.dateTime?.slice(0, 10);
        const newEnd = ge.end?.date || ge.end?.dateTime?.slice(0, 10);
        if (newStart !== rows[0].start_date || newEnd !== rows[0].end_date) {
          await db.query(
            'UPDATE gantt_events SET start_date = $1, end_date = $2, name = $3 WHERE gcal_event_id = $4',
            [newStart, newEnd, ge.summary?.replace(/^\[.*?\]\s*/, '') || rows[0].name, ge.id]
          );
        }
      }
    }
    await db.query("UPDATE settings SET gcal_last_sync = NOW() WHERE brand_id = 'particle'");
  } catch (err) {
    console.error('GCal webhook sync error:', err.message);
  }
});

// ── Protected routes below ──────────────────────────────────────────────────
router.use(verifyJWT);

// ── POST /api/gcal/setup — Create CP Panel calendar ─────────────────────────
router.post('/setup', requireAdmin, async (req, res) => {
  try {
    const calendar = await getCalendarClient();
    // Check if already set up
    const existingId = await getCalendarId();
    if (existingId) {
      try {
        await calendar.calendars.get({ calendarId: existingId });
        return res.json({ calendarId: existingId, message: 'Calendar already exists' });
      } catch { /* calendar was deleted, recreate */ }
    }
    // Create new calendar
    const { data } = await calendar.calendars.insert({
      requestBody: {
        summary: 'CP Panel — Particle Productions',
        description: 'Auto-synced production timeline from CP Panel',
        timeZone: 'Asia/Jerusalem',
      },
    });
    await db.query("UPDATE settings SET gcal_calendar_id = $1 WHERE brand_id = 'particle'", [data.id]);
    res.json({ calendarId: data.id, message: 'Calendar created' });
  } catch (err) {
    console.error('GCal setup error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/gcal/reset — Delete old calendar + clear ID (so /setup creates fresh) ──
router.post('/reset', requireAdmin, async (req, res) => {
  try {
    const calendarId = await getCalendarId();
    if (calendarId) {
      try {
        const calendar = await getCalendarClient();
        await calendar.calendars.delete({ calendarId });
      } catch (e) {
        console.log('Calendar delete failed (may already be gone):', e.message);
      }
      await db.query("UPDATE settings SET gcal_calendar_id = NULL WHERE brand_id = 'particle'");
    }
    res.json({ success: true, message: 'Calendar reset. Call /setup to create a new one.' });
  } catch (err) {
    console.error('GCal reset error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/gcal/sync-to-google — Push local events → Google Calendar ─────
router.post('/sync-to-google', async (req, res) => {
  try {
    const calendar = await getCalendarClient();
    const calendarId = await getCalendarId();
    if (!calendarId) return res.status(400).json({ error: 'Calendar not set up. Run setup first.' });

    const { rows: events } = await db.query(`
      SELECT ge.*, p.project_name, p.id as prod_id
      FROM gantt_events ge
      LEFT JOIN productions p ON ge.production_id = p.id
      ORDER BY ge.start_date
    `);

    let created = 0, updated = 0, errors = 0;

    for (const evt of events) {
      const eventBody = {
        summary: `[${evt.prod_id || 'GEN'}] ${evt.name || 'Event'}${evt.phase ? ' \u2014 ' + evt.phase : ''}`,
        description: `Phase: ${evt.phase || ''}\nProduction: ${evt.project_name || ''}\nID: ${evt.id}`,
        start: { date: evt.start_date },
        end: { date: evt.end_date || evt.start_date },
        colorId: PHASE_COLORS[evt.phase] || '8',
      };

      try {
        if (evt.gcal_event_id) {
          // Update existing
          await calendar.events.update({
            calendarId,
            eventId: evt.gcal_event_id,
            requestBody: eventBody,
          });
          updated++;
        } else {
          // Create new
          const { data } = await calendar.events.insert({
            calendarId,
            requestBody: eventBody,
          });
          await db.query('UPDATE gantt_events SET gcal_event_id = $1 WHERE id = $2', [data.id, evt.id]);
          created++;
        }
      } catch (err) {
        console.error(`GCal sync error for event ${evt.id}:`, err.message);
        errors++;
      }
    }

    await db.query("UPDATE settings SET gcal_last_sync = NOW() WHERE brand_id = 'particle'");
    res.json({ created, updated, errors, total: events.length });
  } catch (err) {
    console.error('GCal sync-to-google error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/gcal/sync-from-google — Pull Google Calendar changes → local ──
router.post('/sync-from-google', async (req, res) => {
  try {
    const calendar = await getCalendarClient();
    const calendarId = await getCalendarId();
    if (!calendarId) return res.status(400).json({ error: 'Calendar not set up' });

    // Get all events from Google Calendar
    const { data } = await calendar.events.list({
      calendarId,
      maxResults: 500,
      singleEvents: true,
      orderBy: 'startTime',
    });

    const gcalEvents = data.items || [];
    let updated = 0, deleted = 0;

    for (const ge of gcalEvents) {
      if (ge.status === 'cancelled') {
        // Event deleted in Google → delete local
        const { rows } = await db.query('DELETE FROM gantt_events WHERE gcal_event_id = $1 RETURNING id', [ge.id]);
        if (rows.length) deleted++;
        continue;
      }

      // Find local event
      const { rows } = await db.query('SELECT * FROM gantt_events WHERE gcal_event_id = $1', [ge.id]);
      if (rows[0]) {
        // Update local dates if changed in Google
        const newStart = ge.start?.date || ge.start?.dateTime?.slice(0, 10);
        const newEnd = ge.end?.date || ge.end?.dateTime?.slice(0, 10);
        if (newStart !== rows[0].start_date || newEnd !== rows[0].end_date) {
          await db.query(
            'UPDATE gantt_events SET start_date = $1, end_date = $2 WHERE gcal_event_id = $3',
            [newStart, newEnd, ge.id]
          );
          updated++;
        }
      }
      // Don't create new local events from Google (only sync existing ones)
    }

    await db.query("UPDATE settings SET gcal_last_sync = NOW() WHERE brand_id = 'particle'");
    res.json({ updated, deleted, totalGoogleEvents: gcalEvents.length });
  } catch (err) {
    console.error('GCal sync-from-google error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/gcal/status ─────────────────────────────────────────────────────
router.get('/status', async (req, res) => {
  try {
    const { rows } = await db.query(
      "SELECT gcal_calendar_id, gcal_last_sync FROM settings WHERE brand_id = 'particle'"
    );
    const s = rows[0] || {};
    res.json({
      connected: !!s.gcal_calendar_id,
      calendarId: s.gcal_calendar_id || null,
      lastSync: s.gcal_last_sync || null,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Helper: sync single event to Google (fire-and-forget) ───────────────────
async function syncEventToGoogle(eventId) {
  try {
    const calendar = await getCalendarClient();
    const calendarId = await getCalendarId();
    if (!calendarId) return;

    const { rows } = await db.query(`
      SELECT ge.*, p.project_name, p.id as prod_id
      FROM gantt_events ge
      LEFT JOIN productions p ON ge.production_id = p.id
      WHERE ge.id = $1
    `, [eventId]);

    if (!rows[0]) return;
    const evt = rows[0];

    const eventBody = {
      summary: `[${evt.prod_id || 'GEN'}] ${evt.name || 'Event'}${evt.phase ? ' \u2014 ' + evt.phase : ''}`,
      description: `Phase: ${evt.phase || ''}\nProduction: ${evt.project_name || ''}`,
      start: { date: evt.start_date },
      end: { date: evt.end_date || evt.start_date },
      colorId: PHASE_COLORS[evt.phase] || '8',
    };

    if (evt.gcal_event_id) {
      await calendar.events.update({ calendarId, eventId: evt.gcal_event_id, requestBody: eventBody });
    } else {
      const { data } = await calendar.events.insert({ calendarId, requestBody: eventBody });
      await db.query('UPDATE gantt_events SET gcal_event_id = $1 WHERE id = $2', [data.id, evt.id]);
    }
  } catch (err) {
    console.error('GCal single-event sync error:', err.message);
  }
}

async function deleteEventFromGoogle(gcalEventId) {
  try {
    const calendar = await getCalendarClient();
    const calendarId = await getCalendarId();
    if (!calendarId || !gcalEventId) return;
    await calendar.events.delete({ calendarId, eventId: gcalEventId });
  } catch (err) {
    console.error('GCal delete error:', err.message);
  }
}

// ── POST /api/gcal/watch — Register webhook with Google ─────────────────────
router.post('/watch', requireAdmin, async (req, res) => {
  try {
    const calendar = await getCalendarClient();
    const calendarId = await getCalendarId();
    if (!calendarId) return res.status(400).json({ error: 'Calendar not set up' });

    const { data } = await calendar.events.watch({
      calendarId,
      requestBody: {
        id: `cp-panel-watch-${Date.now()}`,
        type: 'web_hook',
        address: `https://particlepdio.particleface.com/api/gcal/webhook`,
        expiration: String(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      },
    });
    res.json({ message: 'Webhook registered', expiration: data.expiration });
  } catch (err) {
    console.error('GCal watch error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
module.exports.syncEventToGoogle = syncEventToGoogle;
module.exports.deleteEventFromGoogle = deleteEventFromGoogle;
