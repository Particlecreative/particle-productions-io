/** DEV-only On Air data — every name, code and number is made up (dates relative to today). */
const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const off = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return ymd(d); };
const at = (n, h = 16) => { const d = new Date(); d.setDate(d.getDate() + n); d.setHours(h, 20, 0, 0); return d.toISOString(); };
let seed = 7;
const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
const r2 = (n) => Math.round(n * 100) / 100;
const sundayOf = (n) => { const d = new Date(); d.setDate(d.getDate() + n); d.setDate(d.getDate() - d.getDay()); return ymd(d); };

function spot(code, name, length, spent, mer, opts = {}) {
  const revenue = r2(spent * mer);
  const aov = 88 + Math.round(rnd() * 14);
  const orders = Math.max(1, Math.round(revenue / aov));
  return {
    week_of: sundayOf(0), code, name, length, orders, revenue, mer, cpo: r2(spent / orders), aov, spent,
    moved: opts.moved === false ? null : { spent: r2(spent * (0.08 + rnd() * 0.2)), orders: Math.round(orders * (0.05 + rnd() * 0.25)), revenue: r2(revenue * 0.15), mer: r2((rnd() - 0.5) * 0.1) },
    new_in_report: !!opts.fresh, first_seen: opts.fresh ? off(-2) : off(-30), is_new: !!opts.fresh,
    week_prev: opts.fresh ? null : { spent: r2(spent * (0.7 + rnd() * 0.6)), orders: Math.round(orders * (0.7 + rnd() * 0.6)), revenue: r2(revenue * 0.9), mer: r2(mer * (0.8 + rnd() * 0.4)) },
    stations: opts.stations || [],
    library: opts.lib === false ? null : { id: `lib-${code}`, title: opts.cpName || `${name.replace(/ :\d+$/, '')} ${length}s`, product: opts.product, url: 'https://www.dropbox.com/', thumb_url: null, production_id: opts.prd || null, production_name: opts.production || null },
  };
}

function product(name, spots, base) {
  const total = spots.reduce((a, s) => a + s.spent, 0);
  const daily = Array.from({ length: 7 }, (_, i) => {
    const spend = r2(base * (0.6 + rnd() * 0.8));
    const mer = r2(0.3 + rnd() * 0.45);
    const revenue = r2(spend * mer);
    const orders = Math.round(revenue / 93);
    return { date: off(-7 + i), spend, orders, cpo: r2(spend / Math.max(1, orders)), revenue, mer, aov: 93, visits: Math.round(orders * 4.5), cpv: 40, conv: 0.2 };
  });
  const weekly = Array.from({ length: 7 }, (_, i) => {
    const spend = r2(base * 7 * (0.7 + rnd() * 0.6));
    const mer = r2(0.35 + rnd() * 0.3);
    return { date: sundayOf(-7 * (7 - i)), spend, orders: Math.round((spend * mer) / 93), cpo: 190, revenue: r2(spend * mer), mer, aov: 93, visits: 2500, cpv: 45, conv: 0.22 };
  });
  const last = daily[6], before = daily[5];
  const months = Array.from({ length: 13 }, (_, i) => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 12 + i); const m = `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; const spend = r2(base * 30 * (0.7 + rnd() * 0.5) * (i === 12 ? 0.55 : 1)); const mer = r2(0.38 + rnd() * 0.25); return { month: m, partial: i === 12, spend, orders: Math.round(spend * mer / 93), revenue: r2(spend * mer), mer, aov: 93, cpo: r2(93 / mer) }; });
  const cut = (x, f) => ({ ...x, spend: r2(x.spend * f), orders: Math.round(x.orders * f), revenue: r2(x.revenue * f), partial: undefined });
  const store = (f) => ({ tv_revenue: Math.round(base * 2.2 * f), tv_orders: Math.round(base * 0.024 * f), new_customers: Math.round(base * 0.016 * f), returning_customers: Math.round(base * 0.008 * f), tv_code_revenue: Math.round(base * 1.3 * f), non_tv_code_revenue: Math.round(base * 0.3 * f), no_code_revenue: Math.round(base * 0.6 * f) });
  const side = (f) => ({ sessions: { sessions: Math.round(base * 0.9 * f) }, store: store(f) });
  const weekly12 = Array.from({ length: 12 }, (_, i) => { const spend = r2(base * 7 * (0.7 + rnd() * 0.6) * (i === 11 ? 0.45 : 1)); const mer = r2(0.35 + rnd() * 0.3); return { date: sundayOf(-7 * (11 - i)), spend, orders: Math.round(spend * mer / 93), revenue: r2(spend * mer), mer, aov: 93, cpo: r2(93 / mer), partial: i === 11 }; });
  const week = { spent: r2(total), orders: spots.reduce((a, s) => a + s.orders, 0), revenue: r2(spots.reduce((a, s) => a + s.revenue, 0)) };
  week.mer = r2(week.revenue / week.spent); week.aov = r2(week.revenue / week.orders); week.cpo = r2(week.spent / week.orders); week.visits = week.orders * 5;
  return {
    product: name, report_date: off(-1), received_at: at(-1), previous_report: off(-2), week_of: sundayOf(0),
    note: { text: name === 'Gravité'
      ? 'Hello all, metrics through yesterday below. The new spot did well in the early-morning daypart but not over the weekend. We sent the 30s cut to the networks and hope to test it tomorrow for comparison.'
      : 'Hello all, updated metrics attached. The week ended close to goal. Core media performed well; the two high-profile placements fell short. We are trimming back on one network, which explains yesterday.', at: at(-1), link: null },
    week, last_day: { ...last, vs: { spend: r2(last.spend - before.spend), orders: last.orders - before.orders, mer: r2(last.mer - before.mer) } },
    spots: spots.map(s => ({ ...s, share: s.spent / total })).sort((a, b) => b.spent - a.spent),
    daily, weekly, lifetime: null,
    placements: name === 'Face Cream'
      ? [{ network: 'Thursday Night Game', period: '8pm-11pm', creative: 'Morning Routine', cost: 15800, orders: 18, revenue: 1690, mer: 0.11, visits: 380, cpv: 41.6, date: off(-6) }, { network: 'Sunday Movie Night', period: '8pm-11pm', creative: 'The Mirror', cost: 4400, orders: 3, revenue: 300, mer: 0.07, visits: 120, cpv: 36.7, date: null }]
      : [{ network: 'Evening Newsmagazine', period: '9pm-10pm', creative: 'Pulse', cost: 3100, orders: 26, revenue: 2050, mer: 0.66, visits: 210, cpv: 14.8, date: null }],
    dayparts: name === 'Gravité' ? [{ daypart: 'Mon-Sun 5am-6am', creative: 'Pulse', cost: 4200, orders: 31, revenue: 2500, mer: 0.6, aov: 80.6, cpo: 135 }, { daypart: 'Sat-Sun 9am-12pm', creative: 'Pulse', cost: 11800, orders: 40, revenue: 3100, mer: 0.26, aov: 77.5, cpo: 295 }] : [],
    reports: Array.from({ length: 7 }, (_, i) => ({ date: off(-1 - i), at: at(-1 - i), spent: base * (7 - i), mer: r2(0.4 + rnd() * 0.2) })),
    history: { daily: [...Array.from({ length: 14 }, (_, i) => { const spend = r2(base * (0.6 + rnd() * 0.8)); const mer = r2(0.3 + rnd() * 0.45); return { date: off(-21 + i), spend, orders: Math.round(spend * mer / 93), revenue: r2(spend * mer), mer, aov: 93, cpo: r2(93 / mer) }; }), ...daily], weekly: weekly12, monthly: months },
    periods: {
      day: { label: last.date, ...last, prev: before },
      week: { label: sundayOf(0), ...weekly12[11], prev: weekly12[10], prev_same: cut(weekly12[10], 0.42), days: 3 },
      month: { label: months[12].month, ...months[12], prev: months[11], prev_same: cut(months[11], 0.58), days: 18 },
    },
    source: 'brain',
    brain: {
      last: off(-1), products: [name.toLowerCase()],
      site: { day: side(1), day_prev: side(0.9), week: side(3.2), week_prev: side(6.6), month: side(17), month_prev: side(29) },
      estimated: { days: [{ date: off(0), spend: r2(base * 1.1) }], after_last: [{ date: off(0), spend: r2(base * 1.1) }], spend_after_last: r2(base * 1.1) },
    },
    air: (() => {
      const mk = (f, pf) => spots.map(sp => ({ code: sp.code, name: sp.name, spent: r2(sp.spent * f), orders: Math.round(sp.orders * f), revenue: r2(sp.revenue * f), mer: sp.mer, cpo: sp.cpo, aov: sp.aov, spots: Math.max(1, Math.round(sp.spent * f / 600)),
        share: sp.spent / total, prev: sp.is_new ? null : { spend: r2(sp.spent * pf), orders: Math.round(sp.orders * pf), mer: r2(sp.mer * (0.8 + rnd() * 0.4)) },
        first: { date: sp.is_new ? off(-2) : off(-60), time: ['10:42P', '6:05A', '8:30P', '9:15A'][Math.floor(rnd() * 4)], station: ['FOX NEWS', 'CNN', 'WPHL', 'ACCUWEATHER'][Math.floor(rnd() * 4)] },
        first_seen: sp.is_new ? off(-2) : off(-60), is_new: sp.is_new, library: sp.library })).sort((a2, b2) => b2.spent - a2.spent);
      const st = (f) => ['FOX NEWS', 'CNN', 'WPHL', 'ACCUWEATHER', 'AMC', 'HISTORY', 'NBC NEWS OTT', 'NEWSMAX'].map((n, i) => ({ station: n, market: i === 2 ? 'Philadelphia' : i === 6 ? 'National OTT' : 'National Cable', spend: Math.round(base * f * (1.6 - i * 0.18)), orders: Math.round(base * f * (1.6 - i * 0.18) * 0.004), spots: Math.round(20 * f), mer: r2(0.25 + rnd() * 0.5) }));
      const dp = (f) => [['Morning', 0.28], ['Daytime', 0.18], ['Early evening', 0.14], ['Prime', 0.3], ['Late night', 0.1]].map(([n, w]) => ({ daypart: n, spend: Math.round(base * f * w * 5), spots: Math.round(60 * f * w), mer: r2(0.25 + rnd() * 0.5) }));
      const mkt = (f) => [['National Cable', 0.62], ['National OTT', 0.24], ['Philadelphia', 0.09], ['National Network', 0.05]].map(([n, w]) => ({ market: n, spend: Math.round(base * f * w * 5), orders: Math.round(base * f * w * 0.02), spots: Math.round(80 * f * w), mer: r2(0.25 + rnd() * 0.5) }));
      return { last: off(-1), source: 'brain', markets: { day: mkt(0.2), week: mkt(1), month: mkt(3) }, spots: { day: mk(0.14, 0.13), week: mk(1, 0.9), month: mk(2.6, 3.1) }, stations: { day: st(0.2), week: st(1), month: st(3) }, dayparts: { day: dp(0.2), week: dp(1), month: dp(3) },
        daypart_hours: { Morning: '6a–12p', Daytime: '12p–5p', 'Early evening': '5p–8p', Prime: '8p–11p', 'Late night': '11p–6a' } };
    })(),
    plan: { week: sundayOf(0), lines: 91, unassigned: 48, total: { spots: 852, cost: Math.round(base * 10.5) },
      markets: [{ market: 'National Cable', cost: Math.round(base * 6), spots: 520 }, { market: 'National OTT', cost: Math.round(base * 2.5), spots: 260 }, { market: 'Philadelphia', cost: Math.round(base * 1.2), spots: 50 }, { market: 'National Network', cost: Math.round(base * 0.8), spots: 22 }],
      creatives: spots.slice(0, 6).map((sp, i) => ({ name: sp.name.replace(/ :\d+$/, ''), lines: 19 - i * 3, stations: 12 - i, cost: Math.round(base * (3 - i * 0.4)), share: 0.28 - i * 0.04, code: i === 4 ? null : sp.code, aired: i !== 4, library: i === 4 ? null : sp.library })) },
    month: { month: months[12].month, prev_month: months[11].month, spots: spots.map(sp => ({ code: sp.code, name: sp.name, length: sp.length, spent: r2(sp.spent * 2.6), orders: sp.orders * 3, revenue: r2(sp.revenue * 2.6), mer: sp.mer, cpo: sp.cpo, aov: sp.aov, weeks: sp.is_new ? 1 : 3, share: sp.spent / total, prev: sp.is_new ? null : { spent: r2(sp.spent * 3.4), orders: sp.orders * 4, revenue: r2(sp.revenue * 3), mer: r2(sp.mer * (0.8 + rnd() * 0.4)) }, first_seen: sp.first_seen, is_new: sp.is_new, on_air_now: true, library: sp.library })).sort((a, b) => b.spent - a.spent) },
  };
}

export function tvFixture() {
  seed = 7;
  const face = product('Face Cream', [
    spot('FC1MORNH', 'Morning Routine :60', 60, 29400, 0.24, { product: 'Face Cream', prd: 'PRD26-02', production: 'Morning Routine 2026', cpName: 'Morning Routine 2026 60s', stations: [{ station: 'OTT-WEATHER', spent: 210, orders: 2, mer: 0.42 }] }),
    spot('FC1MIRRH', 'The Mirror', 60, 20100, 0.55, { product: 'Face Cream' }),
    spot('FC1BDAYH', 'Turning 60', 60, 12600, 0.61, { product: 'Face Cream', prd: 'PRD26-11', production: 'Birthday Spot', cpName: 'Birthday Host 60s' }),
    spot('FC9LONGH', 'Long Form :90', 90, 12400, 0.53, { product: 'Face Cream' }),
    spot('FC1TRUH', 'Straight Talk', 60, 7700, 0.5, { product: 'Face Cream' }),
    spot('FC3MIRV2H', 'The Mirror 30 dual CTA', 30, 5600, 0.52, { product: 'Face Cream', fresh: true, prd: 'PRD26-29', production: 'Mirror Cutdowns', cpName: 'The Mirror 30s with middle CTA', stations: [{ station: 'OTT-BUSINESS', spent: 2800, orders: 15, mer: 0.63 }, { station: 'OTT-NEWS', spent: 1800, orders: 9, mer: 0.47 }] }),
    spot('FC1SILVH', 'Silver Lining', 60, 4600, 0.56, { product: 'Face Cream' }),
    spot('FC1HUNTH', 'The Chase', 60, 2100, 0.49, { product: 'Face Cream', lib: false }),
  ], 15000);
  const grav = product('Gravité', [
    spot('GR1PULSEH', 'Pulse', 60, 48100, 0.4, { product: 'Gravité', fresh: true, prd: 'PRD26-33', production: 'The Pulse Test', cpName: 'The Pulse Test 60s' }),
    spot('GR1EXCH', 'Excited', 60, 11800, 0.33, { product: 'Gravité' }),
    spot('GR1PULDH', 'Pulse W/Disclaimer', 60, 3400, 0.3, { product: 'Gravité', fresh: true }),
    spot('GR1TALKH', 'The Talk', 60, 3100, 0.24, { product: 'Gravité' }),
    spot('GR1LINEH', 'The Lineup', 60, 1300, 0.21, { product: 'Gravité' }),
  ], 9500);
  return {
    today: off(0), generated_at: new Date().toISOString(),
    google: { connected: true, can_read: true }, sync: { ok: true, checked: 41, added: 3, at: at(0, 17) },
    brain: { configured: true, via: 'afterlife', backfilled: true, sync: { ok: true, at: at(0, 16) } },
    products: [face, grav],
    pipeline: [
      { title: 'Blindfold 30s 2026 Commercial', product: 'Gravité', sent_by: 'Growth teammate', sent_at: at(-1, 18), links: ['https://www.dropbox.com/'], note: 'A 30-second version of our top performer — please add for testing as soon as possible.', link: null,
        agency: [{ by: 'Agency rep', at: at(-1, 18), text: 'Love this, sending now.', networks: [] }, { by: 'Agency rep', at: at(-1, 19), text: 'Already sent to Fox News, CNN, MSNow, ABC, NBC, CBS and Fox Broadcast.', networks: ['Fox News', 'CNN', 'MSNow', 'ABC', 'NBC', 'CBS', 'Fox Broadcast'] }],
        networks: ['Fox News', 'CNN', 'MSNow', 'ABC', 'NBC', 'CBS', 'Fox Broadcast'], library: { id: 'lib-x', title: 'Blindfold 30s', code: 'GR3BLINDH', production_id: 'PRD26-35', production_name: 'Blindfold 2026' }, on_air_since: null, status: 'confirmed' },
      { title: 'Pulse 60s Commercial', product: 'Gravité', sent_by: 'Growth teammate', sent_at: at(-9, 15), links: ['https://www.dropbox.com/'], note: 'Final 60s for the networks.', link: null,
        agency: [{ by: 'Agency rep', at: at(-9, 16), text: 'Got it — trafficking to Fox News for Thursday.', networks: ['Fox News'] }], networks: ['Fox News'], library: { id: 'lib-y', title: 'The Pulse Test 60s', code: 'GR1PULSEH', production_id: 'PRD26-33', production_name: 'The Pulse Test' }, on_air_since: off(-4), status: 'on_air' },
      { title: 'Bending Light 60s Commercial', product: 'Gravité', sent_by: 'Growth teammate', sent_at: at(-3, 12), links: ['https://www.dropbox.com/'], note: '', link: null, agency: [], networks: [], library: null, on_air_since: null, status: 'sent' },
    ],
    notes: [
      { kind: 'reply', product: 'Gravité', subject: 'Blindfold 30s 2026 Commercial', by: 'Agency rep', at: at(-1, 19), text: 'Already sent to Fox News, CNN, MSNow, ABC, NBC, CBS and Fox Broadcast.', networks: ['Fox News', 'CNN', 'MSNow', 'ABC', 'NBC', 'CBS', 'Fox Broadcast'], link: null },
      { kind: 'report', product: 'Gravité', subject: 'Particle Gravite Campaign', by: 'Agency rep', at: at(-1), text: grav.note.text, networks: [], link: null },
      { kind: 'report', product: 'Face Cream', subject: 'Particle Face Cream Campaign', by: 'Agency rep', at: at(-1, 15), text: face.note.text, networks: [], link: null },
    ],
  };
}

const MAKERS = ['Doron Levi', 'Yael Cohen', 'Omer Ben Simon', 'Kerry Bershtein', null];
const TEAMS = { 'Doron Levi': 'video', 'Omer Ben Simon': 'video', 'Yael Cohen': 'design', 'Kerry Bershtein': 'design' };
const BASE = {
  video: { creatives: 212, spend: 1840000, revenue: 4230000, roas: 2.3, ctr: 0.0112, hook: 0.26, hold: 0.09, avg_watch: 4.2, p50: 0.21, aov: 96, cpa: 41, cpm: 18.5 },
  static: { creatives: 486, spend: 1210000, revenue: 2540000, roas: 2.1, ctr: 0.0094, hook: null, hold: null, avg_watch: null, p50: null, aov: 92, cpa: 44, cpm: 14.2 },
};
function versus(format, seedish) {
  const base = BASE[format === 'video' ? 'video' : 'static'];
  const out = {};
  for (const m of ['roas', 'ctr', 'hook', 'hold', 'avg_watch', 'p50', 'aov', 'cpa', 'cpm']) {
    if (base[m] == null) continue;
    const ratio = 0.55 + rnd() * 1.0 + (seedish % 3 === 0 && (m === 'hook' || m === 'ctr') ? 0.5 : 0);
    const v = base[m] * ratio;
    const good = m === 'cpa' || m === 'cpm' ? 1 / ratio : ratio;
    const score = Math.max(2, Math.min(99, Math.round(50 + (good - 1) * 90)));
    out[m] = { v, avg: base[m], ratio, pct: m === 'cpa' || m === 'cpm' ? 100 - score : score };   // the raw percentile, like the export
  }
  return out;
}
export function mediaFixture() {
  seed = 11;
  const days = 14;
  const dates = Array.from({ length: days }, (_, i) => off(-days + i));
  const labels = [
    ['Gravité · Mirror test UGC v3', 'video', 'Gravité', 'Higgsfield cinematic'], ['Face Cream · 3 reasons static', 'static', 'Face Cream', 'Evergreen'],
    ['Face Cream · Before/after 9x16', 'video', 'Face Cream', 'Statics to Video'], ['Anti-Gray · Barber chair hook', 'video', 'Anti-Gray Serum', 'Holiday'],
    ['Gravité · Lineup cutdown 15s', 'video', 'Gravité', 'TV cutdowns'], ['Face Cream · Holiday bundle', 'static', 'Face Cream', 'Holiday'],
    ['Hand Cream · Winter hands', 'video', 'Hand Cream', 'Holiday'], ['Face Cream · Founder story', 'video', 'Face Cream', 'Evergreen'],
    ['Gravité · Science carousel', 'static', 'Gravité', 'Medium Concepts'], ['Face Cream · Wife reacts', 'video', 'Face Cream', 'UGC'],
    ['Anti-Gray · 2 weeks later', 'video', 'Anti-Gray Serum', 'Evergreen'], ['Face Cream · Gift guide', 'static', 'Face Cream', 'Holiday'],
  ];
  const creatives = labels.map(([label, format, prod, campaign], i) => {
    const startIdx = i < 4 ? 9 + (i % 4) : Math.floor(rnd() * 3);
    const level = 200 + rnd() * 1800;
    const series = dates.map((d, j) => {
      if (j < startIdx) return { d, spend: 0, roas: null, ctr: null, hook: null };
      const grow = Math.min(1, (j - startIdx + 1) / 4);
      const spend = Math.round(level * grow * (0.75 + rnd() * 0.5));
      return { d, spend, roas: r2(0.9 + rnd() * 2.4), ctr: r2(0.006 + rnd() * 0.018) , hook: format === 'video' ? r2(0.18 + rnd() * 0.22) : null };
    });
    const last7 = series.slice(-7), prev7 = series.slice(-14, -7);
    const s7 = last7.reduce((a, x) => a + x.spend, 0), sp = prev7.reduce((a, x) => a + x.spend, 0);
    const roas7 = r2(1.1 + rnd() * 2.2);
    const live = i !== 7 && i !== 10;
    return {
      key: `k${i}`, label, format, lane: 'Particle', product: prod, campaign, maker: MAKERS[i % MAKERS.length], maker_source: 'monday', team: TEAMS[MAKERS[i % MAKERS.length]] || null,
      thumb: null, thumb_url: null, live, new: startIdx >= 7, first_spend: startIdx >= 7 ? dates[startIdx] : off(-30 - i * 3), last_spend: live ? dates[days - 1] : dates[days - 3], ads: 1 + (i % 3),
      lifetime: { spend: Math.round(s7 * (startIdx >= 7 ? 1.1 : 4.5)), revenue: Math.round(s7 * 4 * roas7), roas: roas7 },
      d28: { spend: Math.round(s7 * 2.5), roas: roas7, ctr: r2(0.01 + rnd() * 0.012), hook: format === 'video' ? r2(0.2 + rnd() * 0.2) : null, hold: format === 'video' ? r2(0.08 + rnd() * 0.15) : null, avg_watch: format === 'video' ? r2(2.5 + rnd() * 6) : null, cpa: r2(30 + rnd() * 40), purchases: Math.round(s7 / 45), aov: r2(80 + rnd() * 40) },
      d7: { spend: s7, revenue: Math.round(s7 * roas7), roas: roas7, ctr: r2(0.008 + rnd() * 0.016), hook: format === 'video' ? r2(0.18 + rnd() * 0.22) : null, purchases: Math.round(s7 / 45), aov: r2(80 + rnd() * 40), comments: Math.round(rnd() * 60), reactions: Math.round(rnd() * 900), shares: Math.round(rnd() * 40), saves: Math.round(rnd() * 25) },
      prev7: { spend: sp, roas: sp ? r2(roas7 * (0.7 + rnd() * 0.6)) : null, ctr: sp ? r2(0.008 + rnd() * 0.016) : null },
      today: { day: dates[days - 1], spend: series[days - 1].spend, roas: series[days - 1].roas }, yesterday: { spend: series[days - 2].spend, roas: series[days - 2].roas },
      series,
      vs: { basis: 'year', spend: Math.round(s7 * 3), impressions: Math.round(s7 * 60), judged: i !== 3, metrics: versus(format, i) },
      periods: (() => {
        const P = (spend, f = 1) => ({ spend, revenue: Math.round(spend * roas7 * f), roas: spend ? r2(roas7 * f) : null, impressions: spend * 55, ctr: r2((0.008 + rnd() * 0.016)), hook: format === 'video' ? r2(0.18 + rnd() * 0.22) : null, hold: format === 'video' ? r2(0.08 + rnd() * 0.2) : null, avg_watch: format === 'video' ? r2(2.5 + rnd() * 5) : null, purchases: Math.round(spend / 45), aov: r2(80 + rnd() * 40), cpa: r2(35 + rnd() * 30), comments: Math.round(rnd() * spend / 60), reactions: Math.round(rnd() * spend / 4), shares: Math.round(rnd() * spend / 90), saves: Math.round(rnd() * spend / 120) });
        return { day: P(series[days - 1].spend), day_prev: P(series[days - 2].spend, 0.9 + rnd() * 0.3), week: P(s7), week_prev: P(sp, 0.8 + rnd() * 0.4), month: P(Math.round(s7 * 3.6)), month_prev: P(startIdx >= 7 ? 0 : Math.round(s7 * 3.1), 0.85 + rnd() * 0.3) };
      })(),
      wseries: Array.from({ length: 8 }, (_, w) => ({ end: off(-7 * (7 - w)), spend: startIdx >= 7 && w < 7 ? 0 : Math.round(level * 6 * (0.6 + rnd() * 0.7)), roas: r2(1 + rnd() * 2) })),
      asset_id: i % 4 === 3 ? null : `asset${i}`, ad_id: `12021${100000 + i}`, ad_account: 'act_1', afterlife: i % 4 === 3 ? null : 'https://afterlife.example/asset/x', ads_manager: 'https://adsmanager.facebook.com/',
      video_url: null,
      body: i % 2 ? 'Most men use the wrong face cream. Here’s what 1 million men switched to — and why their wives noticed first. 👉 Try it risk-free.' : 'Black Friday: 25% off everything. Our best sellers, our lowest price of the year.',
    };
  }).sort((a, b) => Number(b.live) - Number(a.live) || b.d7.spend - a.d7.spend);
  return {
    connected: true, ready: true, last_day: dates[days - 1], since: dates[0], days, afterlife_url: 'https://afterlife.example',
    benchmarks: {
      since: '2026-01-01', until: dates[days - 1], min_peer_spend: 300,
      teams: {
        video: { ...BASE.video, creatives: 198 },
        design: { creatives: 470, spend: 1150000, revenue: 2400000, roas: 2.09, ctr: 0.0093, hook: 0.22, hold: 0.07, avg_watch: 3.1, p50: 0.16, aov: 91, cpa: 45, cpm: 14 },
        external: { creatives: 140, spend: 690000, revenue: 1290000, roas: 1.87, ctr: 0.021, hook: 0.31, hold: 0.11, avg_watch: 5.0, p50: 0.25, aov: 88, cpa: 52, cpm: 16 },
      },
      internal: BASE, peers: { video: 160, static: 380 },
    },
    totals: (() => {
      const daily = Array.from({ length: 28 }, (_, i) => ({ d: off(-28 + i), spend: Math.round(14000 + rnd() * 9000), roas: r2(1.4 + rnd() * 0.9) }));
      const weekly = Array.from({ length: 12 }, (_, i) => ({ end: off(-1 - 7 * (11 - i)), start: off(-7 - 7 * (11 - i)), spend: Math.round(110000 + rnd() * 50000), roas: r2(1.4 + rnd() * 0.8) }));
      const now = new Date();
      const monthly = Array.from({ length: now.getMonth() + 1 }, (_, i) => ({ m: `${now.getFullYear()}-${pad(i + 1)}`, spend: Math.round((420000 + rnd() * 220000) * (i === now.getMonth() ? 0.55 : 1)), roas: r2(1.3 + rnd() * 0.8), partial: i === now.getMonth() }));
      return { series: daily.slice(-14), daily, weekly, monthly };
    })(),
    creatives, fetched_at: new Date().toISOString(),
  };
}
