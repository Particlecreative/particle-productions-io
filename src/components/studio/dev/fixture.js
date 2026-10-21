// Offline dev data for the Studio (only used by `npm run dev` without VITE_STUDIO_LIVE=1).
// Synthetic people — the repo is public. Shapes mirror backend/src/lib/studio/data.js.
const VIDEO_ST = [['Completed', '#037f4c', 'delivered'], ['Approved', '#00c875', 'delivered'], ['Review', '#9cd326', 'review'], ['For Approval', '#cab641', 'review'], ['Fixes Round', '#fdab3d', 'fixes'], ['Working', '#579bfc', 'in_progress'], ['Pending', '#e2445c', 'queued'], ['Ready for Assignment', '#c4c4c4', 'queued'], ['Paused', '#9d99b9', 'paused'], ['Stuck', '#333333', 'stuck']];
const DESIGN_ST = [['Completed', '#00c875', 'delivered'], ['Approved', '#784bd1', 'delivered'], ['Quality Check', '#579bfc', 'review'], ['For Approval', '#ff158a', 'review'], ['Fixes Round', '#cab641', 'fixes'], ['Working', '#fdab3d', 'in_progress'], ['Pending', '#7eb6d4', 'queued'], ['Ready for Assignment', '#c4c4c4', 'queued'], ['Paused', '#9d99b9', 'paused'], ['Stuck', '#e2445c', 'stuck']];
const PRODUCTS = [['Face Cream', '#579bfc'], ['Gravité', '#037f4c'], ['NeoRoot', '#5559df'], ['Anti Gray Serum', '#9d50dd'], ['Hand Cream', '#175a63'], ['Shampoo', '#a1e3f6']];
const PEOPLE = [['101', 'Noa Peretz', 'video'], ['102', 'Itai Cohen', 'video'], ['103', 'Dana Mizrahi', 'video'], ['201', 'Tal Ben-Ami', 'design'], ['202', 'Lior Katz', 'design'], ['203', 'Shira Golan', 'design']];
const REQ = [['301', 'Avi Levi'], ['302', 'Maya Ron'], ['303', 'Gil Adar'], ['304', 'Rina Sol']];
const CAMPAIGNS = ['The Line Up', 'Heart Rate Test', 'The Hunt', 'Black Friday 2026', 'Creators Oct', 'Amazon UK'];
const PRODUCTIONS = [['PRD26-09', 'Particle Gravité The Heart Rate Test Campaign', 'Post'], ['PRD26-20', 'The Hunt', 'Production'], ['PRD26-18', 'The Math', 'Production'], ['PRD26-73', 'The Triple Threat', 'Production']];

function rng(seed) { let s = seed; return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; }
const add = (d, n) => { const x = new Date(`${d}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const at = (d, h) => new Date(`${d}T${String(h).padStart(2, '0')}:00:00+03:00`).toISOString();

export function studioFixture({ from, to }) {
  const r = rng(Number(from.replace(/-/g, '')) % 99991 + 7);
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });
  const days = [];
  for (let d = from; d <= to; d = add(d, 1)) days.push(d);
  const st = (board) => (board === 'video' ? VIDEO_ST : DESIGN_ST).map(([label, color, category], i) => ({ label, color, category, index: i }));
  const boards = { video: { key: 'video', label: 'Video', board_id: '1', statuses: st('video') }, design: { key: 'design', label: 'Design', board_id: '2', statuses: st('design') } };
  const people = {};
  for (const [id, name, role] of PEOPLE) people[id] = { id, name, photo: null, email: null, role, counts: {}, effort_s: 0, effort_by_day: {}, bamboo: true, clock_by_day: {}, clocked_s: 0, unassigned_s: 0, out: [] };
  people['203'].out = [{ start: add(from, 2), end: add(from, 3), type: 'time_off', name: 'Vacation' }];
  const requesters = Object.fromEntries(REQ.map(([id, name]) => [id, { id, name, photo: null }]));
  const items = [];
  let n = 0;
  for (const [pid, , role] of PEOPLE) {
    const count = role === 'design' ? 14 : 9;
    for (let i = 0; i < count; i++) {
      const board = role;
      const sts = boards[board].statuses;
      const s = sts[Math.floor(r() * sts.length)];
      const [prod, color] = PRODUCTS[Math.floor(r() * PRODUCTS.length)];
      const camp = CAMPAIGNS[Math.floor(r() * CAMPAIGNS.length)];
      const tv = board === 'video' && r() > 0.7;
      const effort = s.category === 'queued' ? 0 : Math.round(r() * 9 * 3600);
      const id = String(13000000000 + (++n));
      const it = {
        id, board, division: tv ? 'tv' : board, name: `${prod} | ${camp} | ${tv ? 'TV' : 'Meta'} | Concept ${n}`, title: `Concept ${n}`, subtitle: camp,
        product: { label: prod, color }, type: null, department: { label: tv ? 'TV' : 'Marketing/Media', color: null }, platform: 'Meta', campaign: camp,
        status: { label: s.label, color: s.color, category: s.category }, group: s.category === 'queued' && r() > 0.5 ? 'Form Requests' : s.label,
        people: s.category === 'queued' && r() > 0.6 ? [] : [pid], requested_by: [REQ[Math.floor(r() * REQ.length)][0]],
        timeline: { from: days[Math.floor(r() * days.length)], to: days[Math.min(days.length - 1, Math.floor(r() * days.length) + 1)] },
        deadline: add(from, Math.floor(r() * 12) - 2), versions: 1, created_at: at(add(from, -10), 10), monday_url: 'https://monday.com',
        open: s.category !== 'delivered', active_now: ['in_progress', 'fixes'].includes(s.category),
        effort_s: effort, effort_by_person: { [pid]: effort }, effort_total_s: effort + Math.round(r() * 20 * 3600),
        timer_s: Math.round(effort * (1 + r() * 2)), timer_total_s: 0, running: r() > 0.8,
        delivered_in_period: s.category === 'delivered', delivered_at: s.category === 'delivered' ? Date.parse(at(days[1], 15)) : undefined,
      };
      if (tv) {
        const c = PRODUCTIONS.find(([, nm]) => nm.toLowerCase().includes(camp.toLowerCase().split(' ').pop()));
        it.tv = c ? { production_id: c[0], name: c[1], stage: c[2], source: 'auto', confidence: 'high', why: `matches “${camp}”`, suggestions: [{ id: c[0], name: c[1], score: 4 }] }
          : { production_id: null, name: null, source: 'ask', confidence: 'low', suggestions: PRODUCTIONS.slice(0, 2).map(([pid2, nm, stg]) => ({ id: pid2, name: nm, stage: stg, score: 1, why: 'partial name' })) };
      }
      items.push(it);
      if (it.people[0]) people[pid].effort_s += effort;
    }
  }
  for (const p of Object.values(people)) {
    for (const d of days) {
      const dow = new Date(`${d}T12:00:00Z`).getUTCDay();
      if (dow > 4 || d > today || p.out.some(o => o.start <= d && o.end >= d)) continue;
      const inH = 9 + Math.floor(r() * 2);
      const outH = 17 + Math.floor(r() * 3);
      p.clock_by_day[d] = { in: at(d, inH), out: d === today ? null : at(d, outH), hours: outH - inH, open: d === today };
      p.clocked_s += (outH - inH) * 3600;
      p.effort_by_day[d] = Math.round(p.effort_s / Math.max(1, days.length) );
    }
    p.unassigned_s = Math.max(0, p.clocked_s - p.effort_s);
  }
  return {
    period: { from, to, partial: to >= today }, generated_at: new Date().toISOString(), build_ms: 10, today,
    boards, people, requesters, items, productions: PRODUCTIONS.map(([id, name, stage]) => ({ id, name, stage })),
    effort_source: 'bamboohr', holidays: [], capacity: { video: 3, design: 5 }, warnings: [],
  };
}

export const fixtureInspiration = { date: '2026-10-21', line: 'Just keep swimming.', title: 'Finding Nemo', year: 2003, director: 'Andrew Stanton', image_url: null, source: null };
export const fixtureConnections = { monday: { connected: true }, bamboohr: { connected: false }, tmdb: { connected: false } };
