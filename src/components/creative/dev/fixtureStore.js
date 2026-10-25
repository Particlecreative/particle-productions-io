// Offline dev store for Creative Weekly (used only when running `npm run dev` without VITE_CREATIVE_LIVE).
// Synthetic people (the repo is public); real Particle product names + Monday label colours.
import { DEFAULT_TEMPLATE } from '../deck/defaultTemplate';
import { addDays, shortDate, sundayOf } from '../deck/format';

const KEY = 'cp_creative_reports_fixture';
const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; } };
const write = (list) => localStorage.setItem(KEY, JSON.stringify(list));
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);
const delay = (ms) => new Promise(r => setTimeout(r, ms));

const PRODUCTS = [
  ['Face Cream', '#579bfc'], ['Gravité', '#037f4c'], ['NeoRoot', '#5559df'], ['Anti Gray Serum', '#9d50dd'],
  ['Test Product', '#cab641'], ['Instant Eye Firming Cream', '#9d99b9'], ['Shampoo', '#a1e3f6'], ['Hand Cream', '#175a63'],
];
const PEOPLE = [
  ['9001', 'Noa Peretz', 'video'], ['9002', 'Itai Cohen', 'video'], ['9003', 'Dana Mizrahi', 'video'],
  ['9004', 'Tal Ben-Ami', 'design'], ['9005', 'Lior Katz', 'design'], ['9006', 'Shira Golan', 'design'], ['9007', 'Eden Avraham', 'design'],
];
const VIDEO_TYPES = [['Iterations/Cuts/Edits', '#007eb5'], ['TV', '#ff7575'], ['UGC/Creator', '#9d99b9'], ['Script (<1 min)', '#00c875'], ['Motion Design', '#9d50dd']];
const CAMPAIGNS = ['The Line Up', 'Levitas 1.0', 'OuterSignal', 'Creators Oct', 'Amazon UK', 'Fall Flash Sale', 'Heart Rate Test', 'Couple Testimonials'];
const DEPARTMENTS = [['Marketing/Media', '#00c875'], ['Marketing/Media', '#00c875'], ['Amazon', '#fdab3d'], ['CRM', '#579bfc'], ['TV', '#ff7575']];
const CONCEPTS = ['Hero cut 30s', 'Digital versions', 'Before & After', 'Product in setting', 'Hook variants x3', 'Founder story', 'Static carousel', 'TV commercial offline', 'One woman slogan', 'Comedy cutdown'];

function rand(seed) { let s = seed; return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; }

function thumb(color, title, board, i) {
  const g = board === 'video' ? '▶' : '◆';
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='640' height='800'>
<defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='${color}'/><stop offset='1' stop-color='#030b2e'/></linearGradient>
<radialGradient id='r' cx='.75' cy='.2' r='.8'><stop offset='0' stop-color='#ffffff' stop-opacity='.35'/><stop offset='1' stop-color='#ffffff' stop-opacity='0'/></radialGradient></defs>
<rect width='640' height='800' fill='url(#g)'/><rect width='640' height='800' fill='url(#r)'/>
<circle cx='${120 + (i * 53) % 400}' cy='${200 + (i * 97) % 380}' r='${90 + (i * 31) % 120}' fill='#ffffff' fill-opacity='.08'/>
<text x='60' y='690' font-family='Helvetica' font-size='120' fill='#ffffff' fill-opacity='.85'>${g}</text>
<text x='60' y='140' font-family='Helvetica' font-weight='700' font-size='46' fill='#ffffff' fill-opacity='.9'>${title.slice(0, 18).replace(/&/g, '&amp;')}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export function buildFixtureSnapshot(weekStart, seed = 7) {
  const r = rand(seed + Number(weekStart.replace(/-/g, '')) % 1000);
  const items = {};
  const sections = { delivered: [], in_progress: [], review: [], fixes: [], stuck: [], paused: [], overdue: [], planned_next_week: [], active_this_week: [], reopened: [] };
  const media_refs = {};
  const days = [0, 1, 2, 3, 4].map(i => addDays(weekStart, i));
  const nextDays = [0, 1, 2, 3, 4].map(i => addDays(weekStart, 7 + i));
  let n = 0;
  const make = (status, cat, deliveredDay) => {
    const p = PEOPLE[Math.floor(r() * PEOPLE.length)];
    const [prod, color] = PRODUCTS[Math.floor(r() * PRODUCTS.length)];
    const camp = CAMPAIGNS[Math.floor(r() * CAMPAIGNS.length)];
    const concept = CONCEPTS[Math.floor(r() * CONCEPTS.length)];
    const id = String(13000000000 + (++n));
    const board = p[2];
    const vt = VIDEO_TYPES[Math.floor(r() * VIDEO_TYPES.length)];
    const refId = `fx${n}`;
    media_refs[refId] = { kind: 'dropbox_folder', item_id: id };
    const refs = [refId];
    if (board === 'design') { media_refs[`${refId}f`] = { kind: 'figma', item_id: id, url: 'https://www.figma.com/design/abc123/Fixture' }; refs.unshift(`${refId}f`); }
    if (board === 'video') { media_refs[`${refId}v`] = { kind: 'frameio', item_id: id }; refs.unshift(`${refId}v`); }
    const dep = DEPARTMENTS[Math.floor(r() * DEPARTMENTS.length)];
    const start = days[Math.floor(r() * 3)];
    items[id] = {
      id, board, name: `${prod} | ${camp} | Meta | ${concept}`, title: concept, subtitle: `${camp} · Meta`,
      product: { label: prod, color }, type: board === 'video' ? { label: vt[0], color: vt[1] } : null,
      department: { label: dep[0], color: dep[1] }, platform: 'Meta', campaign: camp, division: dep[0] === 'TV' || (board === 'video' && vt[0] === 'TV') ? 'tv' : board,
      status: { label: status, color: { Completed: '#00c875', Approved: '#784bd1', Working: '#fdab3d', Review: '#9cd326', Stuck: '#333333', 'Fixes Round': '#cab641', Pending: '#df2f4a' }[status] || '#c4c4c4', category: cat },
      group: status, people: [p[0]], requested_by: [], timeline: { from: start, to: addDays(start, 1 + Math.floor(r() * 3)) },
      deadline: addDays(weekStart, Math.floor(r() * 10)), versions: 1 + Math.floor(r() * 3),
      tracked_s_week: Math.floor(r() * 30000), tracked_days: days.slice(0, 2), created_at: new Date(Date.parse(weekStart) - r() * 14 * 86400000).toISOString(),
      monday_url: 'https://monday.com', links: { frame: board === 'video' ? 'https://next.frame.io' : null, dropbox: 'https://www.dropbox.com', figma: null, project: null },
      assets: [], media_refs: refs, fixture_thumb: thumb(color, concept, board, n),
    };
    if (deliveredDay != null) {
      items[id].delivered_at = Date.parse(`${days[deliveredDay]}T12:00:00Z`) + Math.floor(r() * 3600000);
      items[id].delivered_status = status;
      items[id].fixes_in_week = Math.floor(r() * 3);
      sections.delivered.push(id);
    } else {
      // Open work is scheduled next week; video editors often get whole-week timelines
      const k = Math.floor(r() * 5);
      const span = board === 'video' && r() > 0.4 ? 4 - k : Math.floor(r() * 2);
      items[id].timeline = { from: nextDays[k], to: nextDays[Math.min(4, k + span)] };
      sections[cat === 'in_progress' ? 'in_progress' : cat]?.push(id);
      if (r() > 0.4) sections.planned_next_week.push(id);
      if (r() > 0.6) sections.overdue.push(id);
    }
    return id;
  };
  for (let i = 0; i < 34; i++) make(r() > 0.3 ? 'Completed' : 'Approved', 'delivered', Math.floor(r() * 5));
  for (let i = 0; i < 9; i++) make('Working', 'in_progress');
  for (let i = 0; i < 6; i++) make('Review', 'review');
  for (let i = 0; i < 2; i++) make('Fixes Round', 'fixes');
  make('Stuck', 'stuck');
  sections.overdue = sections.overdue.slice(0, 4);
  sections.delivered.sort((a, b) => items[b].delivered_at - items[a].delivered_at);

  const people = Object.fromEntries(PEOPLE.map(([id, name, role]) => [id, { id, name, title: '', photo: null, role, order: null, enabled: true }]));
  const del = sections.delivered.map(id => items[id]);
  const count = (list, key) => {
    const m = new Map();
    for (const it of list) {
      const k = key(it);
      if (!k) continue;
      const e = m.get(k.label) || { label: k.label, color: k.color, video: 0, design: 0, total: 0 };
      e[it.board]++; e.total++; m.set(k.label, e);
    }
    return [...m.values()].sort((a, b) => b.total - a.total);
  };
  const by_person = {};
  for (const [pid] of PEOPLE) {
    const mine = del.filter(it => it.people.includes(pid));
    by_person[pid] = {
      delivered: mine.length, video: mine.filter(i => i.board === 'video').length, design: mine.filter(i => i.board === 'design').length,
      in_progress: [...sections.in_progress, ...sections.review, ...sections.fixes].filter(id => items[id].people.includes(pid)).length,
      planned_next: sections.planned_next_week.filter(id => items[id].people.includes(pid)).length,
      fixes: mine.reduce((s, i) => s + (i.fixes_in_week || 0), 0), stuck: 0, overdue: 0,
      median_turnaround_days: Math.round((3 + r() * 9) * 10) / 10, avg_versions: 2, tracked_hours: Math.round(r() * 300) / 10,
      hours: (() => { const c = 28 + Math.round(r() * 12); const o = Math.round(c * (0.55 + r() * 0.35)); return { on_tasks: o, clocked: c, not_on_task: c - o }; })(),
      products: count(mine, it => it.product).slice(0, 6),
    };
  }
  const workload = { days: [...days, ...nextDays], this_week: days, next_week: nextDays, capacity: { video: 3, design: 5 }, people: {}, hours: {},
    // One person off two days next week, and a company holiday (as the Studio sends from BambooHR)
    out: { [PEOPLE[0][0]]: { [nextDays[1]]: { type: 'time_off', name: 'Vacation' }, [nextDays[2]]: { type: 'time_off', name: 'Vacation' } },
      ...Object.fromEntries(PEOPLE.slice(1).map(([pid]) => [pid, { [nextDays[3]]: { type: 'holiday', name: 'Company holiday' } }])) } };
  for (const [pid] of PEOPLE) {
    workload.people[pid] = Object.fromEntries([...days, ...nextDays].map(d => [d, { planned: [], active: [] }]));
    for (const it of Object.values(items).filter(i => i.people.includes(pid))) {
      for (const d of [...days, ...nextDays]) if (it.timeline.from <= d && it.timeline.to >= d) workload.people[pid][d].planned.push(it.id);
    }
  }
  const trend = Array.from({ length: 8 }, (_, i) => {
    const v = 6 + Math.floor(r() * 12); const d = 14 + Math.floor(r() * 18); const tv = Math.floor(r() * 4);
    return { week_start: addDays(weekStart, -7 * (7 - i)), label: shortDate(addDays(weekStart, -7 * (7 - i))), video: v, design: d, by_person: {}, by_division: { design: d, video: v - Math.min(v, tv), tv } };
  });
  const video = del.filter(i => i.board === 'video').length;
  const design = del.length - video;
  const byDiv = { design: 0, video: 0, tv: 0 };
  for (const it of del) byDiv[it.division]++;
  trend[7] = { ...trend[7], video, design, current: true, by_division: byDiv };
  return {
    schema_version: 1, generated_at: new Date().toISOString(),
    week: { start: weekStart, end: addDays(weekStart, 7), last_day: addDays(weekStart, 6), label: `${shortDate(weekStart)} – ${shortDate(addDays(weekStart, 4))}`, number: 43, year: Number(weekStart.slice(0, 4)), workdays: days, partial: weekStart === sundayOf(), next: { start: addDays(weekStart, 7), label: `${shortDate(addDays(weekStart, 7))} – ${shortDate(addDays(weekStart, 11))}` } },
    boards: { video: { board_id: '5433027071', label: 'Video' }, design: { board_id: '8036329818', label: 'Design' } },
    people, items, sections, workload, sources: { studio: true, hours: 'bamboohr' },
    metrics: {
      totals: { delivered: del.length, video, design, in_progress: sections.in_progress.length + sections.review.length + sections.fixes.length, in_review: sections.review.length, fixes: sections.fixes.length, stuck: sections.stuck.length, overdue: sections.overdue.length, planned_next: sections.planned_next_week.length, reopened: 0, people: PEOPLE.length, fixes_rounds_in_week: del.reduce((s, i) => s + i.fixes_in_week, 0) },
      turnaround: { median_days: 6.4, p75_days: 11.2, sample: del.length },
      on_time: { on_time: 19, with_deadline: 27, rate: 70 },
      by_product: count(del, it => it.product),
      by_type: count(del.filter(i => i.board === 'video'), it => it.type),
      by_department: count(del, it => it.department),
      by_platform: count(del, it => ({ label: it.platform })),
      by_person,
      hours: { source: 'bamboohr', on_tasks: 0, clocked: 0 },
      studio: {
        hands_on_hours: 212, delivered: del.length, median_life_days: 6.8, avg_fix_rounds: 1.3, waiting_5d: 4,
        life_mix: { queued: 180000, in_progress: 140000, fixes: 60000, review: 210000, paused: 40000 },
        by_requester: [['Avi Levi', 18, 64, 5.2, 1.1], ['Maya Ron', 11, 48, 8.4, 2.3], ['Gil Adar', 7, 33, 6.1, 0.9], ['Rina Sol', 5, 21, 4.0, 1.4], ['Tal Noy', 2, 9, 3.2, 0]]
          .map(([name, delivered, hours, life, fix], i) => ({ id: String(900 + i), name, photo: null, delivered, hours, share: Math.round((hours / 212) * 100), median_life_days: life, avg_fix_rounds: fix })),
      },
      vs_last_week: { video: video - trend[6].video, design: design - trend[6].design, delivered: del.length - trend[6].video - trend[6].design },
    },
    trend,
    cp_weekly: {
      found: true, weekly_report_id: 'wr-fixture', updated_at: null,
      productions: [
        { production_id: 'PRD26-09', name: 'Particle Gravité The Heart Rate Test Campaign', stage: 'Post', production_type: 'TV Commercial', product_type: ['Gravité'], producer: 'Maya R.', planned_start: '2026-09-01', planned_end: addDays(weekStart, 11), delivery_date: addDays(weekStart, 10), shoot_dates: ['2026-09-14'], brand: { id: 'particle', name: 'Particle' }, cross_brand: false, note: 'Final grade locked; delivering cutdowns Thursday.', bullets: [{ text: 'Addressed CEO notes — new version by EOD' }, { text: 'Music license signed' }], links: [] },
        { production_id: 'PRD26-14', name: 'Particle Face Cream Couple Testimonials', stage: 'Production', production_type: 'Digital', product_type: ['Face Cream'], producer: 'Yoav S.', planned_start: addDays(weekStart, 7), planned_end: addDays(weekStart, 20), delivery_date: null, shoot_dates: [addDays(weekStart, 9)], brand: { id: 'particle', name: 'Particle' }, cross_brand: false, note: 'Shoot day Tuesday, 3 couples confirmed.', bullets: [], links: [] },
        { production_id: 'PRD26-BLR1', name: 'Blurr Eye Tightener TV', stage: 'Pre-production', production_type: 'TV Commercial', product_type: [], producer: null, planned_start: addDays(weekStart, 14), planned_end: '2026-11-20', delivery_date: null, shoot_dates: [], brand: { id: 'blurr', name: 'Blurr', color: '#B842A9' }, cross_brand: true, note: 'Casting approved, locations scouted.', bullets: [], links: [] },
      ],
      general_updates: [{ text: 'Video editors lunch on Thursday' }, { text: 'New designer onboarding next week' }, { text: 'Monday AI hands-on session for the studio' }],
    },
    media_refs, warnings: [],
  };
}

const withMedia = (report) => ({ report, media: { token: 'fixture' } });

export async function list() {
  return { reports: read().map(r => ({ id: r.id, week_start: r.week_start, title: r.title, status: r.status, revision: r.revision, week_label: r.snapshot.week.label, week_number: r.snapshot.week.number, totals: r.snapshot.metrics.totals, shared: !!r.share_token, generated_at: r.generated_at, updated_at: r.updated_at })), current_week: sundayOf(), review_week: sundayOf() };
}
export async function get(id) {
  const r = read().find(x => x.id === id);
  if (!r) throw Object.assign(new Error('Not found'), { status: 404 });
  return { ...withMedia(r), cp_weekly_stale: false };
}
export async function byWeek(ws) {
  const r = read().find(x => x.week_start === ws);
  return r ? withMedia(r) : { report: null };
}
export async function generate(ws) {
  const all = read();
  const ex = all.find(x => x.week_start === ws);
  if (ex) throw Object.assign(new Error('A deck already exists for this week'), { status: 409, data: { id: ex.id } });
  await delay(2600);
  const snapshot = buildFixtureSnapshot(ws);
  const now = new Date().toISOString();
  const report = { id: uid(), brand_id: 'particle', week_start: ws, title: `Week ${snapshot.week.number} · ${snapshot.week.label}`, status: 'draft', snapshot, overrides: {}, template: JSON.parse(JSON.stringify(DEFAULT_TEMPLATE)), narrative: null, revision: 1, generated_at: now, updated_at: now, versions: [] };
  write([report, ...all]);
  return withMedia(report);
}
export async function save(id, patch) {
  const all = read();
  const r = all.find(x => x.id === id);
  if (!r) throw Object.assign(new Error('Not found'), { status: 404 });
  if (patch.base_revision !== r.revision) throw Object.assign(new Error('Edited elsewhere'), { status: 409, data: { revision: r.revision, report: r } });
  if (r.status === 'final' && (patch.overrides || patch.template)) throw Object.assign(new Error('This deck is marked final — unlock it to edit'), { status: 423 });
  for (const k of ['overrides', 'template', 'narrative', 'title']) if (k in patch) r[k] = patch[k];
  r.revision += 1;
  r.updated_at = new Date().toISOString();
  write(all);
  return { revision: r.revision, updated_at: r.updated_at };
}
export async function refresh(id) {
  await delay(1500);
  const all = read();
  const r = all.find(x => x.id === id);
  r.versions.unshift({ id: uid(), version_number: r.versions.length + 1, reason: 'pre_refresh', created_at: new Date().toISOString(), created_by_name: 'You', snapshot: r.snapshot, overrides: r.overrides, template: r.template });
  const before = r.snapshot.metrics.totals;
  r.snapshot = buildFixtureSnapshot(r.week_start, Math.floor(Math.random() * 1000));
  r.revision += 1;
  write(all);
  const after = r.snapshot.metrics.totals;
  return { ...withMedia(r), diff: { summary: [`Video ${before.video}→${after.video}`, `Design ${before.design}→${after.design}`], sections: {}, metrics: {}, orphaned_overrides: [] } };
}
export async function narrative(id) {
  await delay(1800);
  const all = read();
  const r = all.find(x => x.id === id);
  const t = r.snapshot.metrics.totals;
  r.narrative = {
    exec_summary: [`${t.delivered} pieces shipped: ${t.video} videos and ${t.design} designs.`, 'Face Cream and Gravité carried the week.', `${t.in_progress} tickets in the pipeline heading into next week.`, `Watch: ${t.stuck} stuck, ${t.overdue} overdue.`],
    highlights: [], risks: [], next_week_focus: ['Lock the Gravité TV cutdowns', 'NeoRoot creators batch', 'Fall Flash Sale statics'],
    focus_by_division: { design: ['Fall Flash Sale statics for Meta', 'Face Cream Amazon A+ refresh'], video: ['NeoRoot creators batch', 'Hook variants for Levitas'], tv: ['Gravité TV cutdowns delivered Thursday', 'Couple Testimonials shoot Tuesday'] },
    per_person: Object.values(r.snapshot.people).map(p => ({ monday_user_id: p.id, one_liner: `${p.name.split(' ')[0]} kept the ${p.role === 'video' ? 'edit' : 'design'} queue moving.` })),
    generated_at: new Date().toISOString(), locked_fields: [],
  };
  r.revision += 1;
  write(all);
  return { narrative: r.narrative, revision: r.revision };
}
export async function setStatus(id, status) {
  const all = read();
  const r = all.find(x => x.id === id);
  r.status = status; r.revision += 1;
  write(all);
  return withMedia(r);
}
export async function versions(id) { return { versions: (read().find(x => x.id === id)?.versions || []).map(({ snapshot, overrides, template, ...v }) => v) }; }
export async function saveVersion(id, label) {
  const all = read();
  const r = all.find(x => x.id === id);
  const v = { id: uid(), version_number: r.versions.length + 1, reason: 'manual', label, created_at: new Date().toISOString(), created_by_name: 'You', snapshot: r.snapshot, overrides: r.overrides, template: r.template };
  r.versions.unshift(v);
  write(all);
  return { version: v };
}
export async function version(id, vid) { return { version: read().find(x => x.id === id)?.versions.find(v => v.id === vid) }; }
export async function restore(id, vid) {
  const all = read();
  const r = all.find(x => x.id === id);
  const v = r.versions.find(x => x.id === vid);
  Object.assign(r, { snapshot: v.snapshot, overrides: v.overrides, template: v.template, revision: r.revision + 1 });
  write(all);
  return withMedia(r);
}
export async function share(id, days) {
  const all = read();
  const r = all.find(x => x.id === id);
  r.share_token = r.share_token || Array.from(crypto.getRandomValues(new Uint8Array(32))).map(b => b.toString(16).padStart(2, '0')).join('');
  r.share_expires_at = days ? new Date(Date.now() + days * 86400000).toISOString() : null;
  write(all);
  return { share_token: r.share_token, share_expires_at: r.share_expires_at, path: `/creative-report/${r.share_token}` };
}
export async function unshare(id) {
  const all = read();
  const r = all.find(x => x.id === id);
  r.share_token = null;
  write(all);
  return { ok: true };
}
export async function publicShare(token) {
  const r = read().find(x => x.share_token === token);
  if (!r) throw Object.assign(new Error('This link was revoked or does not exist'), { status: 404 });
  return { report: r, media: { token: 'fixture' }, brand: { id: 'particle', name: 'Particle', logo_url: null } };
}
export async function listing(id, refId) {
  await delay(300);
  if (String(refId).endsWith('v')) return { entries: [], error: 'Your Frame user is not linked to an Adobe ID' };
  return { entries: Array.from({ length: 6 }, (_, i) => ({ key: `k${i}`, name: `${String(refId).endsWith('f') ? 'Frame' : 'Export'} ${i + 1}.png`, kind: 'image', ext: 'png', preferred: i === 0 })) };
}
export async function linkMedia(id, url) {
  await delay(400);
  if (!/frame\.io|f\.io|dropbox\.com/i.test(url)) throw Object.assign(new Error('Paste a Frame.io or Dropbox link'), { status: 400 });
  const r = read().find(x => x.id === id);
  const refId = `fx${Math.abs([...url].reduce((a, c) => (a * 31 + c.charCodeAt(0)) | 0, 7))}`;
  r.snapshot.media_refs = { ...(r.snapshot.media_refs || {}), [refId]: { kind: /dropbox/.test(url) ? 'dropbox_file' : 'frameio', url, item_id: null, custom: true } };
  write(read().map(x => (x.id === id ? r : x)));
  return { report: r, media: { token: 'fixture' }, refId, entries: [{ key: '_', name: 'TV commercial 30s.mp4', kind: 'video', ext: 'mp4', preferred: true }, { key: 'still', name: 'Hero still.jpg', kind: 'image', ext: 'jpg' }] };
}
export async function remove(id) { write(read().filter(x => x.id !== id)); return { ok: true }; }
export async function config() { return { config: { default_template: DEFAULT_TEMPLATE } }; }
export async function saveTemplate() { return { template: DEFAULT_TEMPLATE }; }
export async function integrations() {
  return { monday: { ok: true, warnings: [] }, dropbox: { connected: false, error: 'Offline dev mode' }, frameio: { configured: false, connected: false }, anthropic: { configured: false } };
}
