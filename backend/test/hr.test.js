// My HR + HR panel (25 Nov 2026): personal BambooHR keys (sealed, never returned), clock in / out, time-off requests,
// the 10:00 / 19:00 reminders and matching BambooHR people to CP users. BambooHR and the database are stand-ins here.
const test = require('node:test');
const assert = require('node:assert/strict');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'hr-test-secret';

// ── stand-in database ────────────────────────────────────────────────────────────────────────────────────────────────
const state = { hr: new Map(), users: [], monday: [], reminded: new Set() };
const dbPath = require.resolve('../src/db');
require.cache[dbPath] = {
  id: dbPath, filename: dbPath, loaded: true,
  exports: {
    query: async (sql, params = []) => {
      if (/^\s*(CREATE|ALTER)/i.test(sql)) return { rows: [] };
      if (/INSERT INTO user_bamboohr/.test(sql)) {
        const [user_id, subdomain, key_sealed, employee_id, name, email] = params;
        state.hr.set(user_id, { user_id, subdomain, key_sealed, employee_id, name, email, connected_at: '2026-11-25T08:00:00Z', last_ok_at: null, last_error: null });
        return { rows: [], rowCount: 1 };
      }
      if (/DELETE FROM user_bamboohr/.test(sql)) { state.hr.delete(params[0]); return { rows: [], rowCount: 1 }; }
      if (/UPDATE user_bamboohr/.test(sql)) return { rows: [], rowCount: 1 };
      if (/FROM user_bamboohr b JOIN users/.test(sql)) {
        return { rows: [...state.hr.values()].filter(r => !state.reminded.has(`${r.user_id}|${params[0]}`)) };
      }
      if (/FROM user_bamboohr WHERE user_id = \$1/.test(sql)) return { rows: state.hr.has(params[0]) ? [state.hr.get(params[0])] : [] };
      if (/FROM user_bamboohr/.test(sql)) return { rows: [...state.hr.values()] };
      if (/FROM user_monday/.test(sql)) return { rows: state.monday.map(user_id => ({ user_id })) };
      if (/FROM users/.test(sql)) return { rows: state.users };
      return { rows: [] };
    },
  },
};

// the company connection (Studio → Connections)
let companyCreds = { subdomain: 'particle', api_key: 'c0ffee'.repeat(7), source: 'settings' };
const companyPath = require.resolve('../src/lib/studio/bamboohr');
require.cache[companyPath] = { id: companyPath, filename: companyPath, loaded: true, exports: { creds: async () => companyCreds } };

// notifications are recorded, not written
const notes = [];
const storePath = require.resolve('../src/lib/notify/store');
require.cache[storePath] = {
  id: storePath, filename: storePath, loaded: true,
  exports: { ensure: async () => {}, notify: async (n) => { notes.push(n); return 1; } },
};

// ── stand-in BambooHR ────────────────────────────────────────────────────────────────────────────────────────────────
let routes = [];
const calls = [];
const json = (status, data, headers = {}) => new Response(data == null ? null : JSON.stringify(data), { status, headers: { 'content-type': 'application/json', ...headers } });
const empty = (status, msg) => new Response(null, { status, headers: msg ? { 'x-bamboohr-error-message': msg } : {} });
global.fetch = async (url, opts = {}) => {
  const u = new URL(String(url));
  const call = { url: u, path: u.pathname.replace(/^\/api\/v1|^\/api\/gateway\.php\/[^/]+\/v1/, ''), method: opts.method || 'GET', body: opts.body ? JSON.parse(opts.body) : undefined, headers: opts.headers || {} };
  calls.push(call);
  for (const [method, re, reply] of routes) if (method === call.method && re.test(call.path)) return typeof reply === 'function' ? reply(call) : reply.clone();
  return empty(404);
};

const B = require('../src/lib/hr/bamboo');
const P = require('../src/lib/hr/personal');
const R = require('../src/lib/hr/reminders');
const T = require('../src/lib/hr/team');
const W = require('../src/lib/creative/week');
const { seal, unseal } = require('../src/lib/studio/secrets');

const KEY = '0123456789abcdef0123456789abcdef01234567';
const U1 = '11111111-1111-4111-8111-111111111111';
const U2 = '22222222-2222-4222-8222-222222222222';
const reset = () => { B.resetForTests(); calls.length = 0; notes.length = 0; routes = []; };
const connectU1 = () => state.hr.set(U1, { user_id: U1, subdomain: 'particle', key_sealed: seal(KEY), employee_id: '123', name: 'Dana Demo', email: 'dana@example.com' });

// ── keys ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
test('key check: a long letters-and-numbers key passes (quotes and spaces around it trimmed); anything else is a friendly 400', () => {
  assert.equal(P.cleanKey(`  "${KEY}" `), KEY);
  assert.equal(P.cleanKey(KEY.toUpperCase()), KEY.toUpperCase());
  assert.equal(P.cleanKey('z'.repeat(40)), 'z'.repeat(40));   // not only hex — a valid key in another format isn't refused
  for (const badKey of ['', 'abc123', `${KEY.slice(0, 20)} ${KEY.slice(20)}`, 'a-b'.repeat(14), 'a'.repeat(81)]) {
    assert.throws(() => P.cleanKey(badKey), (e) => e.status === 400 && e.code === 'bad_key');
  }
  assert.equal(P.cleanSubdomain('https://Particle.bamboohr.com/home'), 'particle');
  assert.equal(P.cleanSubdomain(''), '');
  assert.equal(P.cleanSubdomain('bad name!'), null);
});

test('connect: tests the key with /employees/0, stores it sealed, and never hands it back', async () => {
  reset();
  state.hr.clear();
  routes = [['GET', /^\/employees\/0$/, json(200, { id: '123', firstName: 'Dana', lastName: 'Demo', workEmail: 'Dana@Example.com', jobTitle: 'Video Editor' })]];
  const r = await P.connect(U1, KEY);
  assert.equal(r.connected, true);
  assert.equal(r.employee_id, '123');
  assert.equal(r.name, 'Dana Demo');
  assert.ok(!JSON.stringify(r).includes(KEY), 'the key never goes back');
  // the documented base, the company's subdomain, Basic auth with the key as the user name
  assert.equal(calls[0].url.origin, 'https://particle.bamboohr.com');
  assert.match(calls[0].url.search, /fields=firstName/);
  assert.equal(calls[0].headers.Authorization, `Basic ${Buffer.from(`${KEY}:x`).toString('base64')}`);
  assert.equal(calls[0].headers.Accept, 'application/json');
  const stored = state.hr.get(U1);
  assert.notEqual(stored.key_sealed, KEY);
  assert.ok(!stored.key_sealed.includes(KEY));
  assert.equal(unseal(stored.key_sealed), KEY);
  assert.equal(stored.email, 'dana@example.com');
  const st = await P.status(U1);
  assert.ok(!JSON.stringify(st).includes(KEY) && !('key_sealed' in st));
});

test('connect: a key BambooHR refuses is a plain sentence (and an HTTP status that never signs you out of CP)', async () => {
  reset();
  routes = [['GET', /^\/employees\/0$/, empty(401)]];
  await assert.rejects(P.connect(U2, KEY), (e) => e.status === 400 && /didn’t accept that key/.test(e.message));
  assert.equal(state.hr.has(U2), false);
  companyCreds = null;
  await assert.rejects(P.connect(U2, KEY), (e) => e.code === 'need_subdomain');
  companyCreds = { subdomain: 'particle', api_key: 'c0ffee'.repeat(7) };
});

test('client: a route the documented base doesn’t have falls back to the legacy gateway', async () => {
  reset();
  const seen = [];
  const before = global.fetch;
  global.fetch = async (url, opts) => {
    seen.push(String(url));
    return String(url).startsWith('https://api.bamboohr.com/api/gateway.php/acme/v1/') ? json(200, { ok: true }) : new Response('<html>nope</html>', { status: 404, headers: { 'content-type': 'text/html' } });
  };
  try {
    assert.deepEqual(await B.call({ subdomain: 'acme', api_key: KEY }, 'GET', '/meta/users'), { ok: true });
    assert.equal(seen.length, 2);
    await B.call({ subdomain: 'acme', api_key: KEY }, 'GET', '/meta/users');
    assert.equal(seen.length, 3, 'remembers the base that worked');
  } finally { global.fetch = before; }
});

// ── clock ────────────────────────────────────────────────────────────────────────────────────────────────────────────
test('clock in: POST …/clock_in with Israel time zone; the fresh state comes back', async () => {
  reset();
  connectU1();
  const today = W.localDate(Date.now());
  const start = new Date(Date.now() - 3600000).toISOString();
  routes = [
    ['POST', /^\/time_tracking\/employees\/123\/clock_in$/, json(200, { id: 9, employeeId: 123, type: 'clock', date: today, start, end: null, timezone: 'Asia/Jerusalem' })],
    ['GET', /^\/time_tracking\/timesheet_entries$/, json(200, [{ id: 9, employeeId: 123, type: 'clock', date: today, start, end: null }])],
  ];
  const r = await P.clockIn(U1, { note: 'Shoot day' });
  const post = calls.find(c => c.method === 'POST');
  assert.deepEqual(post.body, { timezone: 'Asia/Jerusalem', note: 'Shoot day' });
  assert.equal(r.ok, true);
  assert.equal(r.clock.open, true);
  assert.equal(r.clock.since, start);
  assert.ok(r.clock.today_hours > 0.9 && r.clock.today_hours < 1.1);
});

test('clock in: already in (409) and not in time tracking (412) say so in plain words', async () => {
  reset();
  connectU1();
  routes = [['POST', /clock_in$/, empty(409, 'Employee is already clocked in')]];
  await assert.rejects(P.clockIn(U1), (e) => e.status === 409 && e.message === 'You’re already clocked in.');
  reset();
  routes = [['POST', /clock_in$/, empty(412)]];
  await assert.rejects(P.clockIn(U1), (e) => e.status === 412 && /Time tracking isn’t turned on for you in BambooHR/.test(e.message));
});

test('clock in: when the underscore route is refused (403), the hyphen pair is tried', async () => {
  reset();
  connectU1();
  routes = [
    ['POST', /^\/time_tracking\/employees\/123\/clock_in$/, empty(403)],
    ['POST', /^\/time-tracking\/clock-ins$/, json(201, { id: 10, employeeId: 123, type: 'clock' })],
    ['GET', /timesheet_entries/, json(200, [])],
  ];
  const r = await P.clockIn(U1);
  assert.equal(r.ok, true);
  assert.deepEqual(calls.find(c => c.path === '/time-tracking/clock-ins').body, { employeeId: 123, timezone: 'Asia/Jerusalem' });
});

test('clock out: happy, and "not clocked in" when there is no open entry', async () => {
  reset();
  connectU1();
  routes = [['POST', /clock_out$/, json(200, { id: 9, employeeId: 123, type: 'clock', end: new Date().toISOString() })], ['GET', /timesheet_entries/, json(200, [])]];
  const r = await P.clockOut(U1);
  assert.equal(r.ok, true);
  assert.deepEqual(calls.find(c => c.method === 'POST').body, { timezone: 'Asia/Jerusalem' });
  reset();
  routes = [['POST', /clock_out$/, json(404, { message: 'No open entry' })], ['POST', /clock-outs$/, json(404, { message: 'No open entry' })]];
  await assert.rejects(P.clockOut(U1), (e) => e.status === 404 && e.message === 'You’re not clocked in right now.');
  await assert.rejects(P.clockOut(U1, { end: '25:00' }), /time you finished/);
});

// ── time off ─────────────────────────────────────────────────────────────────────────────────────────────────────────
test('time off: the PUT body BambooHR expects — Fri / Sat and holidays count 0', async () => {
  reset();
  connectU1();
  const today = W.localDate(Date.now());
  let thu = W.addDays(today, 1);
  while (W.dow(thu) !== 4) thu = W.addDays(thu, 1);
  const sun = W.addDays(thu, 3);
  const nextMon = W.addDays(thu, 4);
  routes = [
    ['GET', /^\/meta\/time_off\/types$/, json(200, { timeOffTypes: [{ id: 78, name: 'Vacation', units: 'days', color: '3BA7D8' }], defaultHours: [] })],
    ['GET', /^\/time_off\/whos_out\/?$/, json(200, [{ id: 1, type: 'holiday', name: 'Founders day', start: nextMon, end: nextMon }])],
    ['PUT', /^\/employees\/123\/time_off\/request$/, json(201, { id: 555, employeeId: 123, start: thu, end: nextMon, status: { status: 'requested' }, type: { id: 78, name: 'Vacation' }, amount: { unit: 'days', amount: '2' } })],
  ];
  const r = await P.requestTimeOff(U1, { type_id: '78', start: thu, end: nextMon, note: 'Family trip' });
  const put = calls.find(c => c.method === 'PUT');
  assert.deepEqual(put.body, {
    status: 'requested', start: thu, end: nextMon, timeOffTypeId: 78, amount: 2,
    notes: [{ from: 'employee', note: 'Family trip' }],
    dates: [{ ymd: thu, amount: 1 }, { ymd: W.addDays(thu, 1), amount: 0 }, { ymd: W.addDays(thu, 2), amount: 0 }, { ymd: sun, amount: 1 }, { ymd: nextMon, amount: 0 }],
  });
  assert.equal(r.amount, 2);
  assert.equal(r.request.id, '555');
  await assert.rejects(P.requestTimeOff(U1, { type_id: '78', start: sun, end: thu }), /before the first day/);
  await assert.rejects(P.requestTimeOff(U1, { start: thu, end: thu }), /kind of time off/);
});

test('time off: hours — half a day halves that day’s hours; BambooHR’s default hours win when set', () => {
  const sunday = '2026-11-29';
  assert.deepEqual(P.planDays({ start: sunday, end: sunday, units: 'hours', halfDay: true }), { dates: [{ ymd: sunday, amount: P.EXPECTED_DAY_HOURS / 2 }], amount: P.EXPECTED_DAY_HOURS / 2 });
  const p = P.planDays({ start: sunday, end: '2026-12-05', units: 'hours', defaultHours: [{ name: 'Sunday', amount: '8' }, { name: 'Friday', amount: '8' }] });
  assert.equal(p.dates.find(d => d.ymd === sunday).amount, 8);                  // Sunday from BambooHR
  assert.equal(p.dates.find(d => d.ymd === '2026-11-30').amount, P.EXPECTED_DAY_HOURS); // Monday: not set → ours
  assert.equal(p.dates.find(d => d.ymd === '2026-12-04').amount, 0);            // Friday is never a work day here
  assert.equal(p.amount, 8 + 4 * P.EXPECTED_DAY_HOURS);
});

test('cancel: only my own pending request', async () => {
  reset();
  connectU1();
  routes = [
    ['GET', /^\/time_off\/requests$/, json(200, [
      { id: 7, employeeId: 123, start: '2026-12-10', end: '2026-12-10', status: { status: 'requested' }, type: { id: 78, name: 'Vacation' } },
      { id: 8, employeeId: 123, start: '2026-12-20', end: '2026-12-21', status: { status: 'approved' }, type: { id: 78, name: 'Vacation' } },
    ])],
    ['POST', /^\/time-off\/requests\/7\/cancellations$/, json(200, {})],
  ];
  assert.deepEqual(await P.cancelTimeOff(U1, '7'), { ok: true });
  assert.equal(calls.find(c => c.method === 'GET' && c.path === '/time_off/requests').url.searchParams.get('action'), 'myRequests');
  await assert.rejects(P.cancelTimeOff(U1, '8'), (e) => e.status === 409);
  await assert.rejects(P.cancelTimeOff(U1, '99'), (e) => e.status === 404);
});

test('me: one failing part (balances 403) doesn’t hide the rest; the key is nowhere in it', async () => {
  reset();
  connectU1();
  const today = W.localDate(Date.now());
  const start = new Date(Date.now() - 2 * 3600000).toISOString();
  routes = [
    ['GET', /^\/employees\/0$/, json(200, { id: '123', firstName: 'Dana', lastName: 'Demo', jobTitle: 'Video Editor', hireDate: '2021-03-04', supervisor: 'Wilf, Tomer' })],
    ['GET', /timesheet_entries/, json(200, [{ id: 1, employeeId: 123, type: 'clock', date: today, start, end: null }])],
    ['GET', /whos_out/, json(200, [])],
    ['GET', /\/meta\/time_off\/types/, json(200, { timeOffTypes: [{ id: 78, name: 'Vacation', units: 'days' }] })],
    ['GET', /time_off\/calculator/, empty(403)],
    ['GET', /^\/time_off\/requests$/, json(200, [])],
  ];
  const r = await P.me(U1);
  assert.equal(r.connected, true);
  assert.equal(r.profile.name, 'Dana Demo');
  assert.equal(r.profile.manager, 'Tomer Wilf');
  assert.equal(r.profile.anniversary.next_date.slice(5), '03-04');
  assert.equal(r.clock.open, true);
  assert.equal(r.time_off.types.length, 1);
  assert.match(r.time_off.errors.balances, /isn’t allowed/);
  assert.ok(!JSON.stringify(r).includes(KEY));
});

test('anniversary: next date, years, today', () => {
  assert.deepEqual(P.anniversary('2021-03-04', '2026-11-25'), { next_date: '2027-03-04', days_until: 99, years_at_next: 6, years_so_far: 5, is_today: false });
  assert.equal(P.anniversary('2020-11-25', '2026-11-25').is_today, true);
  assert.equal(P.anniversary('2020-02-29', '2026-11-25').next_date, '2027-02-28');
});

// ── reminders ────────────────────────────────────────────────────────────────────────────────────────────────────────
test('reminder windows: Sun–Thu, 10:00–10:45 and 19:00–19:45 Israel time (winter and summer)', () => {
  assert.equal(R.windowAt(new Date('2026-11-25T08:10:00Z')), 'morning');   // Wed 10:10 (UTC+2)
  assert.equal(R.windowAt(new Date('2026-11-25T08:00:00Z')), 'morning');   // 10:00
  assert.equal(R.windowAt(new Date('2026-11-25T08:45:00Z')), 'morning');   // 10:45
  assert.equal(R.windowAt(new Date('2026-11-25T08:46:00Z')), null);        // 10:46
  assert.equal(R.windowAt(new Date('2026-11-25T07:59:00Z')), null);        // 09:59
  assert.equal(R.windowAt(new Date('2026-11-25T17:30:00Z')), 'evening');   // 19:30
  assert.equal(R.windowAt(new Date('2026-11-25T17:50:00Z')), null);        // 19:50
  assert.equal(R.windowAt(new Date('2026-11-27T08:10:00Z')), null);        // Friday
  assert.equal(R.windowAt(new Date('2026-11-28T17:10:00Z')), null);        // Saturday
  assert.equal(R.windowAt(new Date('2026-11-29T08:05:00Z')), 'morning');   // Sunday is a work day
  assert.equal(R.windowAt(new Date('2026-07-01T07:05:00Z')), 'morning');   // summer: 10:05 (UTC+3)
  assert.equal(R.windowAt(new Date('2026-07-01T08:05:00Z')), null);        // summer: 11:05
  assert.equal(R.dedupeKey('morning', '2026-11-25'), 'hr:in:2026-11-25');
  assert.equal(R.dedupeKey('evening', '2026-11-25'), 'hr:out:2026-11-25');
});

test('reminder decisions: morning only with nothing today; evening only while still clocked in', () => {
  const today = '2026-11-25';
  assert.equal(R.decide('morning', [], today), 'clock_in');
  assert.equal(R.decide('morning', [{ date: today, start: '2026-11-25T07:00:00Z', end: '2026-11-25T08:00:00Z' }], today), null);
  assert.equal(R.decide('morning', [{ date: '2026-11-24', start: '2026-11-24T07:00:00Z', end: null }], today), null); // still in from yesterday
  assert.equal(R.decide('evening', [{ date: today, start: '2026-11-25T07:00:00Z', end: null }], today), 'clock_out');
  assert.equal(R.decide('evening', [{ date: today, start: '2026-11-25T07:00:00Z', end: '2026-11-25T15:00:00Z' }], today), null);
  assert.equal(R.decide('evening', [], today), null);
});

test('reminder tick: notifies who hasn’t clocked in, skips time off, holidays and people already reminded', async () => {
  reset();
  state.hr.clear();
  state.hr.set(U1, { user_id: U1, subdomain: 'particle', key_sealed: seal(KEY), employee_id: '123' });
  state.hr.set(U2, { user_id: U2, subdomain: 'particle', key_sealed: seal(KEY.replace(/0/g, 'e')), employee_id: '456' });
  const now = new Date('2026-11-25T08:10:00Z');
  routes = [
    ['GET', /whos_out/, (c) => json(200, c.headers.Authorization.includes(Buffer.from(`${companyCreds.api_key}:x`).toString('base64'))
      ? [{ id: 1, type: 'timeOff', employeeId: 456, name: 'Ori Sample', start: '2026-11-24', end: '2026-11-26' }] : [])],
    ['GET', /timesheet_entries/, json(200, [])],
  ];
  const r = await R.tick(now);
  assert.deepEqual({ window: r.window, checked: r.checked, notified: r.notified, off: r.off }, { window: 'morning', checked: 2, notified: 1, off: 1 });
  assert.equal(notes.length, 1);
  assert.deepEqual({ ...notes[0], message: undefined }, { userIds: [U1], type: 'hr', link: '/my-hr', message: undefined, meta: { action: 'clock_in', date: '2026-11-25' }, actor: 'My HR', dedupe: 'hr:in:2026-11-25' });
  assert.match(notes[0].message, /haven’t clocked in yet today/);

  // already reminded today → not even asked
  reset();
  routes = [['GET', /whos_out/, json(200, [])], ['GET', /timesheet_entries/, json(200, [])]];
  state.reminded.add(`${U1}|hr:in:2026-11-25`).add(`${U2}|hr:in:2026-11-25`);
  assert.equal((await R.tick(now)).checked, 0);
  state.reminded.clear();

  // a company holiday → nobody
  reset();
  routes = [['GET', /whos_out/, json(200, [{ id: 2, type: 'holiday', name: 'Holiday', start: '2026-11-25', end: '2026-11-25' }])], ['GET', /timesheet_entries/, json(200, [])]];
  const h = await R.tick(now);
  assert.equal(h.holiday, true);
  assert.equal(notes.length, 0);

  // outside the windows → nothing at all
  reset();
  assert.ok((await R.tick(new Date('2026-11-25T12:00:00Z'))).skipped);
  assert.equal(calls.length, 0);

  // evening: still clocked in → "clock out?"
  reset();
  routes = [['GET', /whos_out/, json(200, [])], ['GET', /timesheet_entries/, (c) => json(200, c.url.searchParams.get('employeeIds') === '123' ? [{ id: 5, employeeId: 123, type: 'clock', date: '2026-11-25', start: '2026-11-25T07:00:00Z', end: null }] : [])]];
  const ev = await R.tick(new Date('2026-11-25T17:15:00Z'));
  assert.equal(ev.notified, 1);
  assert.equal(notes[0].dedupe, 'hr:out:2026-11-25');
  assert.equal(notes[0].meta.action, 'clock_out');
  assert.deepEqual(notes[0].userIds, [U1]);
});

// ── HR panel ─────────────────────────────────────────────────────────────────────────────────────────────────────────
test('team matching: My HR link first, then work email, then name (accents and case ignored)', () => {
  const users = [
    { id: 'u1', name: 'Dana Demo', email: 'dana@example.com' },
    { id: 'u2', name: 'Óri Sample', email: null },
    { id: 'u3', name: 'Gil Placeholder', email: 'gil.personal@example.com' },
    { id: 'u4', name: 'Nobody Here', email: 'nobody@example.com' },
  ];
  const employees = [
    { id: '1', name: 'Dana D.', email: 'DANA@example.com' },
    { id: '2', name: 'Someone Else', first_name: 'Ori', last_name: 'Sample', email: 'ori@example.com' },
    { id: '3', name: 'Gil P.', email: 'gil@example.com' },
  ];
  const { byUser, byEmployee } = T.matchPeople(users, employees, { u3: '3' });
  assert.equal(byUser.get('u1').id, '1');
  assert.equal(byUser.get('u2').id, '2');
  assert.equal(byUser.get('u3').id, '3');
  assert.equal(byUser.has('u4'), false);
  assert.equal(byEmployee.get('2').id, 'u2');
});

test('team helpers: week starts on Sunday; a day’s state for the Today board', () => {
  assert.equal(T.weekStartOf('2026-11-25'), '2026-11-22');
  assert.equal(T.weekStartOf('2026-11-22'), '2026-11-22');
  assert.equal(T.weekStartOf('2026-11-28'), '2026-11-22');
  assert.equal(T.dayState({ day: { open: true, in: 'x', hours: 2, entries: 1 } }).state, 'in');
  assert.equal(T.dayState({ day: { open: false, in: 'a', out: 'b', hours: 8, entries: 1 } }).state, 'done');
  assert.equal(T.dayState({ day: null, off: { start: '2026-11-25' }, workday: true }).state, 'off');
  assert.equal(T.dayState({ day: null, workday: true }).state, 'not_in');
  assert.equal(T.dayState({ day: null, workday: false }).state, 'weekend');
});

test('team panel: today board, week grid, pending requests and connections from the company key', async () => {
  reset();
  state.hr.clear();
  connectU1();
  state.users = [{ id: U1, name: 'Dana Demo', email: 'dana@example.com', role: 'Creative' }, { id: U2, name: 'Ori Sample', email: 'ori@example.com', role: 'Growth' }];
  state.monday = [U2];
  const today = W.localDate(Date.now());
  const start = new Date(Date.now() - 3600000).toISOString();
  routes = [
    ['GET', /^\/employees\/directory$/, json(200, { employees: [{ id: 123, displayName: 'Dana Demo', workEmail: 'dana@example.com' }, { id: 456, displayName: 'Ori Sample', workEmail: 'ori@example.com' }] })],
    ['GET', /timesheet_entries/, json(200, [{ id: 1, employeeId: 123, type: 'clock', date: today, start, end: null }])],
    ['GET', /whos_out/, json(200, [{ id: 3, type: 'timeOff', employeeId: 456, name: 'Ori Sample', start: today, end: today }])],
    ['GET', /^\/time_off\/requests$/, json(200, [{ id: 77, employeeId: 456, name: 'Ori Sample', start: W.addDays(today, 10), end: W.addDays(today, 11), status: { status: 'requested' }, type: { id: 78, name: 'Vacation' }, amount: { unit: 'days', amount: '2' } }])],
    ['POST', /^\/time-off\/requests\/77\/approvals$/, json(200, {})],
  ];
  const t = await T.team({});
  assert.equal(t.connected, true);
  assert.equal(t.board.find(p => p.id === '123').state, 'in');
  assert.equal(t.board.find(p => p.id === '456').state, 'off');
  assert.equal(t.grid.find(p => p.id === '123').cp_user_id, U1);
  assert.equal(t.requests[0].id, '77');
  assert.equal(t.requests[0].cp_user_id, U2);
  const conn = Object.fromEntries(t.connections.map(c => [c.id, c]));
  assert.equal(conn[U1].hr.connected, true);
  assert.equal(conn[U1].monday, false);
  assert.equal(conn[U2].hr.connected, false);
  assert.equal(conn[U2].monday, true);
  assert.equal(conn[U2].bamboo.id, '456');
  const pend = calls.find(c => c.path === '/time_off/requests');
  assert.equal(pend.url.searchParams.get('action'), 'approve');
  assert.equal(pend.url.searchParams.get('status'), 'requested');

  // approve → BambooHR, then the person hears about it in CP
  const a = await T.approve('77', { note: 'Enjoy!', actor: 'Tomer' });
  assert.deepEqual(a, { ok: true, id: '77', status: 'approved' });
  assert.deepEqual(calls.find(c => c.method === 'POST').body, { managerNote: 'Enjoy!' });
  assert.equal(notes.length, 1);
  assert.deepEqual(notes[0].userIds, [U2]);
  assert.equal(notes[0].dedupe, 'hr:req:77:approve');
  assert.match(notes[0].message, /Vacation .* was approved/);

  // no company connection → a clear reason, connections still listed
  companyCreds = null;
  const off = await T.team({});
  assert.equal(off.connected, false);
  assert.match(off.reason, /Studio → Connections/);
  assert.equal(off.connections.length, 2);
  companyCreds = { subdomain: 'particle', api_key: 'c0ffee'.repeat(7) };
});
