// On Air · TV — the agency report parser, the Gmail classifier and the movement between reports.
// Every number, name and address here is made up (the repo is public); the table shapes follow the agency's emails.
const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../src/lib/onair/agencyReport');
const { classify } = require('../src/lib/onair/tvMail');
const { productView, firstSeenOf } = require('../src/lib/onair/tv');
const { growthMay } = require('../src/middleware/auth');
const Media = require('../src/lib/onair/media');

const tr = (cells) => `<tr>${cells.map(c => `<td style="x"><p><span>${c}</span></p></td>`).join('')}</tr>`;
const table = (rows) => `<table border="0" cellpadding="0">${rows.map(tr).join('')}</table>`;

const faceHtml = (spentMM = '$5,000.00', ordersMM = '20') => `
<div dir="ltr">Hello all, metrics below.&nbsp; The core media performed well.<br><br>Thank you,<br>-Rep-</div>
${table([['FACE CREAM', '', '', ''], ['Network / Show', 'Time Period', 'Creative', 'Media Cost', 'Orders', 'Revenue', 'MER', 'Visits', 'CPV'],
    ['Big Game Night - 11/09', '8pm-11pm', 'Most Men', '$9,000', '10', '$900.00', '0.10', '200', '$45.00']])}
${table([['Week Of', 'Creative Aired', 'Creative Name', 'Length', 'Web Order', 'Ttl Rev', 'MER', 'CPO', 'AOV', '$ SPENT'],
    ['11/9/2026', 'PM1MMH', 'Most Men :60', '060', ordersMM, '$2,000.00', '0.40', '$250.00', '$100.00', spentMM],
    ['11/9/2026', 'PM3AGV2H', 'Aggressive 30 revised dual CTA', '030', '5', '$500.00', '0.50', '$200.00', '$100.00', '$1,000.00'],
    ['11/9/2026', 'Total', '', '', '25', '$2,500.00', '0.42', '$240.00', '$100.00', '$6,000.00']])}
${table([['Week Of', 'Station', 'Creative Aired', 'Creative Name', 'Length', 'Web Order', 'Ttl Rev', 'MER', 'CPO', 'AOV', '$ SPENT'],
    ['11/9/2026', 'OTT-FOX WEATHER', 'PM1MMH', 'Most Men :60', '060', '2', '$100.00', '0.50', '$100.00', '$50.00', '$200.00']])}
${table([['', '', ''], ['Face Cream Combined Results', '', ''], ['WEEK OF', 'APPROXIMATE SPEND', 'ORDERS', 'CPO', 'REVENUE', 'MER', 'AOV', 'VISITS', 'CPV', 'CONV. %', ''],
    ['11/09/26', '$3,000.00', '12', '$250.00', '$1,200.00', '0.40', '$100.00', '100', '$30.00', '12.00%', ''],
    ['11/10/26', '$3,000.00', '13', '$230.00', '$1,300.00', '0.43', '$100.00', '110', '$27.27', '11.82%', ''],
    ['', '$6,000.00', '25', '$240.00', '$2,500.00', '0.42', '$100.00', '210', '$28.57', '11.90%', ''],
    ['Face Cream Weekly Combined Results', '', ''], ['DATE', 'APPROXIMATE SPEND', 'ORDERS', 'CPO', 'REVENUE', 'MER', 'AOV', 'VISITS', 'CPV', 'CONV. %', ''],
    ['11/02/26', '$50,000.00', '200', '$250.00', '$20,000.00', '0.40', '$100.00', '1,000', '$50.00', '20.00%', ''],
    ['', '$1,000,000.00', '5,000', '$200.00', '$500,000.00', '0.50', '$100.00', '20,000', '$50.00', '25.00%', '']])}
${table([['', 'Agency Rep · Media']])}`;

const gravHtml = `<div>Hello all. We have sent Bending Time and it is approved on MSNow and CNN.</div>
${table([['GRAVITE', '', ''], ['Fox News Daypart', 'Creative', 'Media Cost', 'Orders', 'Revenue', 'MER', 'AOV', 'CPO'], ['Mon-Sun 5am-6am', 'Heart Rate', '$1,000', '5', '$400.00', '0.40', '$80.00', '$200.00']])}
${table([['Week Of', 'Creative Aired', 'Creative Name', 'Length', 'Web Order', 'Ttl Rev', 'MER', 'CPO', 'AOV', '$ SPENT'], ['11/9/2026', 'GC1HEARTH', 'Heart', '060', '9', '$700.00', '0.35', '$222.22', '$77.78', '$2,000.00']])}
${table([['Gravite Daily Results', '', '', '', '', 'Combined Results', '', '', '', ''], ['DATE', 'TOTAL SPEND', 'ORDERS', 'CPO', 'REVENUE', 'MER', 'AOV', 'VISITS', 'CPV', ''],
    ['11/09/26', '$2,000.00', '9', '$222.22', '$700.00', '0.35', '$77.78', '50', '$40.00', ''], ['WEEK TO DATE', '$2,000.00', '9', '$222.22', '$700.00', '0.35', '$77.78', '50', '$40.00', ''],
    ['Gravite Weekly Results', '', '', '', '', 'Total Results', '', '', '', ''], ['WEEK OF', 'WEEKLY SPEND', 'ORDERS', 'CPO', 'REVENUE', 'MER', 'AOV', 'VISITS', 'CPV', ''],
    ['11/02/26', '$9,000.00', '30', '$300.00', '$2,700.00', '0.30', '$90.00', '300', '$30.00', ''], ['CAMPAIGN TO DATE', '$90,000.00', '300', '$300.00', '$27,000.00', '0.30', '$90.00', '3,000', '$30.00', '']])}`;

test('Agency report: tables are read by their headers', () => {
  const r = L.parseReport({ html: faceHtml(), subject: 'Particle Face Cream Campaign 11/16', sentAt: '2026-11-16T14:17:53Z' });
  assert.equal(r.product, 'Face Cream');
  assert.equal(r.report_date, '2026-11-16');
  assert.match(r.note, /^Hello all, metrics below\. The core media performed well\./);
  assert.equal(r.spots.length, 2);
  assert.deepEqual(r.spots[0], { week_of: '2026-11-09', code: 'PM1MMH', name: 'Most Men :60', length: 60, orders: 20, revenue: 2000, mer: 0.4, cpo: 250, aov: 100, spent: 5000 });
  assert.equal(r.spot_totals.spent, 6000);
  assert.equal(r.stations.length, 1);
  assert.equal(r.stations[0].station, 'OTT-FOX WEATHER');
  assert.deepEqual(r.placements[0], { network: 'Big Game Night', period: '8pm-11pm', creative: 'Most Men', cost: 9000, orders: 10, revenue: 900, mer: 0.1, visits: 200, cpv: 45, date: '2026-11-09' });
  assert.deepEqual(r.daily.map(d => d.date), ['2026-11-09', '2026-11-10']);
  assert.equal(r.daily_totals.spend, 6000);
  assert.ok(Math.abs(r.daily[0].conv - 0.12) < 1e-9);
  assert.deepEqual(r.weekly.map(d => d.date), ['2026-11-02']);
  assert.equal(r.lifetime.spend, 1000000);
});

test('Agency report: the Gravité layout (dayparts, "Total Spend", "Week to date")', () => {
  const r = L.parseReport({ html: gravHtml, subject: 'Particle for Men Gravite Campaign 11/13', sentAt: '2026-11-13T14:06:10Z' });
  assert.equal(r.product, 'Gravité');
  assert.equal(r.report_date, '2026-11-13');
  assert.equal(r.dayparts.length, 1);
  assert.equal(r.dayparts[0].creative, 'Heart Rate');
  assert.equal(r.spots[0].code, 'GC1HEARTH');
  assert.equal(r.daily.length, 1);
  assert.equal(r.daily_totals.spend, 2000);
  assert.equal(r.weekly.length, 1);
  assert.equal(r.lifetime.spend, 90000);
});

test('Agency report: helpers', () => {
  assert.deepEqual(L.reportSubject('RE: Particle Face Cream Campaign 11/16'), { product: 'Face Cream', md: '11/16' });
  assert.equal(L.reportSubject('Blindfolded 30s 2026 Commercial'), null);
  assert.equal(L.num('(1,200)'), -1200);
  assert.equal(L.num('—'), null);
  assert.equal(L.ymd('11/9', 2026), '2026-11-09');
  assert.deepEqual(L.networksIn('Already sent to Fox News, CNN, MSNow, ABC, NBC, CBS and Fox Broadcast.'), ['Fox News', 'CNN', 'MSNow', 'ABC', 'NBC', 'CBS', 'Fox Broadcast']);
  assert.equal(L.cleanReply('Love this, sending now.\n\n[image: Logo] <https://x>\nAgency Rep\n\nOn Mon, Nov 16, 2026 at 11:28 AM A <a@b.example>\nwrote:\n> Hi'), 'Love this, sending now.');
  assert.deepEqual(L.creativeLinks('see https://www.dropbox.com/scl/fi/abc/x.mov?rlkey=1&dl=0. and https://example.com'), ['https://www.dropbox.com/scl/fi/abc/x.mov?rlkey=1&dl=0']);
});

const b64 = (s) => Buffer.from(s).toString('base64url');
const msg = ({ id, from, to, subject, html, plain }) => ({
  id, threadId: `t${id}`, internalDate: String(Date.parse('2026-11-16T16:28:13Z')),
  payload: { headers: [{ name: 'From', value: from }, { name: 'To', value: to }, { name: 'Subject', value: subject }],
    mimeType: 'multipart/alternative', parts: [plain && { mimeType: 'text/plain', body: { data: b64(plain) } }, html && { mimeType: 'text/html', body: { data: b64(html) } }].filter(Boolean) },
});
const AGENCY = 'Agency Rep <rep@lbd2c.com>';
const TEAMMATE = 'Teammate <growth@particleformen.com>';

test('Gmail: reports, creatives sent to the agency and replies are told apart', () => {
  const rep = classify(msg({ id: '1', from: AGENCY, to: 'team@particleformen.com', subject: 'Particle Face Cream Campaign 11/16', html: faceHtml() }));
  assert.equal(rep.kind, 'report');
  assert.equal(rep.product, 'Face Cream');
  assert.equal(rep.parsed.spots.length, 2);

  const sent = classify(msg({ id: '2', from: TEAMMATE, to: 'rep@lbd2c.com, planner@lbd2c.com', subject: 'Blindfolded 30s 2026 Commercial',
    plain: 'Hi,\nNew 30s cut for Gravité:\nhttps://www.dropbox.com/scl/fi/abc/Blindfolded.mov?rlkey=k&dl=0\nThanks' }));
  assert.equal(sent.kind, 'creative_sent');
  assert.equal(sent.product, 'Gravité');
  assert.equal(sent.links.length, 1);

  const reply = classify(msg({ id: '3', from: AGENCY, to: 'team@particleformen.com', subject: 'Re: Blindfolded 30s 2026 Commercial',
    plain: 'Already sent to Fox News, CNN and ABC.\n\nOn Mon, Nov 16, 2026 at 11:30 AM Teammate <growth@particleformen.com> wrote:\n> best one yet' }));
  assert.equal(reply.kind, 'reply');
  assert.equal(reply.body_text, 'Already sent to Fox News, CNN and ABC.');
  assert.deepEqual(reply.parsed.networks, ['Fox News', 'CNN', 'ABC']);

  const other = classify(msg({ id: '4', from: 'someone@else.example', to: 'team@particleformen.com', subject: 'Hello', plain: 'hi' }));
  assert.equal(other.kind, 'other');
});

test('TV view: what moved since the previous report of the same week, and which spots are new', () => {
  const at = (d) => `${d}T14:00:00Z`;
  const r = (date, html) => ({ product: 'Face Cream', report_date: date, sent_at: at(date), thread_id: 'x', body_text: 'note', parsed: L.parseReport({ html, subject: `Particle Face Cream Campaign ${date.slice(5, 7)}/${date.slice(8)}`, sentAt: at(date) }) });
  const older = r('2026-11-02', faceHtml('$4,000.00', '15').replace(/PM3AGV2H/g, 'PM1OLDH'));
  const prev = r('2026-11-15', faceHtml('$4,000.00', '15').replace(/PM3AGV2H/g, 'PM1OLDH'));
  const cur = r('2026-11-16', faceHtml('$5,000.00', '20'));
  const rs = [cur, prev, older];
  const v = productView(rs, firstSeenOf(rs), {}, '2026-11-17');
  const mm = v.spots.find(s => s.code === 'PM1MMH');
  assert.deepEqual(mm.moved, { spent: 1000, orders: 5, revenue: 0, mer: 0 });
  assert.equal(mm.is_new, false);              // seen since the oldest report we have
  const ag = v.spots.find(s => s.code === 'PM3AGV2H');
  assert.equal(ag.new_in_report, true);
  assert.equal(ag.is_new, true);               // first seen 16 Nov
  assert.equal(v.previous_report, '2026-11-15');
  assert.equal(v.week.spent, 6000);
  assert.equal(v.last_day.vs.orders, 1);
});

test('On Air: Growth reads TV only, can not refresh it; thumbnails are signed', () => {
  assert.ok(growthMay('GET', '/api/onair/tv'));
  assert.ok(!growthMay('GET', '/api/onair/media'));
  assert.ok(!growthMay('POST', '/api/onair/tv/refresh'));
  const url = Media.thumbUrl('/media/ads/123-t.jpg');
  const q = new URLSearchParams(url.split('?')[1]);
  assert.ok(Media.verifyThumb(q.get('p'), q.get('e'), q.get('s')));
  assert.ok(!Media.verifyThumb('/media/ads/999-t.jpg', q.get('e'), q.get('s')));
  assert.equal(Media.thumbUrl('/etc/passwd'), null);
  assert.equal(Media.thumbUrl('/media/../x.jpg'), null);
});

test('TV history: last week per spot, weeks and months from all reports', () => {
  const at = (d) => `${d}T14:00:00Z`;
  const r = (date, html) => ({ product: 'Face Cream', report_date: date, sent_at: at(date), thread_id: 'x', body_text: 'note', parsed: L.parseReport({ html, subject: `Particle Face Cream Campaign ${date.slice(5, 7)}/${date.slice(8)}`, sentAt: at(date) }) });
  const lastWeek = r('2026-11-09', faceHtml('$4,000.00', '15').replace(/11\/9\/2026/g, '11/2/2026'));
  const cur = r('2026-11-16', faceHtml('$5,000.00', '20'));
  const rs = [cur, lastWeek];
  const v = productView(rs, firstSeenOf(rs), {}, '2026-11-17');
  assert.equal(v.spots.find(s => s.code === 'PM1MMH').week_prev.spent, 4000);
  assert.deepEqual(v.history.weekly.map(w => [w.date, w.partial]), [['2026-11-02', false], ['2026-11-09', true]]);
  assert.equal(v.periods.week.prev.date, '2026-11-02');
  assert.equal(v.month.month, '2026-11');
  const mm = v.month.spots.find(s => s.code === 'PM1MMH');
  assert.equal(mm.spent, 9000);
  assert.equal(mm.weeks, 2);
  assert.equal(v.history.monthly.find(m => m.month === '2026-11').spend, 56000);
});

test('On Air viewer: file links are signed over both ids (AfterLife asset ids can be board:item:var)', () => {
  const u = Media.videoUrl('120211111111', '8036329818:8036347118:var1');
  const q = new URLSearchParams(u.split('?')[1]);
  assert.ok(Media.verifyVideo(q.get('ad'), q.get('asset'), q.get('e'), q.get('s')));
  assert.ok(!Media.verifyVideo(q.get('ad'), 'another:asset', q.get('e'), q.get('s')));
  assert.ok(!Media.verifyVideo('', q.get('asset'), q.get('e'), q.get('s')));
  const f = new URLSearchParams(Media.videoUrl('', 'abc:1:var1').split('?')[1]);
  assert.ok(Media.verifyVideo(f.get('ad'), f.get('asset'), f.get('e'), f.get('s')));
  assert.equal(Media.videoUrl('not-an-ad', ''), null);
  assert.equal(Media.videoUrl('', '../etc'), null);
});
