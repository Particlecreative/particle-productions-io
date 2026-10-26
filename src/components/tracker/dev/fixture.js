/** DEV-only Production Tracker data (dates relative to today), so the page works without the API. */
const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const off = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return ymd(d); };
const ago = (n) => new Date(Date.now() - n * 86400000).toISOString();

const people = {
  101: { id: '101', name: 'Doron Levi', photo: null },
  102: { id: '102', name: 'Yael Cohen', photo: null },
  103: { id: '103', name: 'Omer Ben Simon', photo: null },
  104: { id: '104', name: 'Kerry Bershtein', photo: null },
};
const ST = {
  working: { label: 'Working on it', color: '#fdab3d', category: 'in_progress' },
  review: { label: 'Creative Approval', color: '#a25ddc', category: 'review' },
  fixes: { label: 'Fixes Round', color: '#ff642e', category: 'fixes' },
  done: { label: 'Completed', color: '#00c875', category: 'delivered' },
  stuck: { label: 'Stuck', color: '#e2445c', category: 'stuck' },
  pending: { label: 'Pending', color: '#c4c4c4', category: 'queued' },
};
let tid = 13400000000;
const ticket = (name, status, who, from, to, extra = {}) => ({
  id: String(tid++), board: 'video', name, title: name.split('|')[0].trim(), subtitle: name.split('|').slice(1).join(' · ').trim(),
  status: ST[status], open: status !== 'done', product: { label: 'Face Cream', color: '#579bfc' }, people: who, requested_by: ['104'],
  timeline: { from: off(from), to: off(to) }, deadline: off(to), monday_url: 'https://particleformen.monday.com/boards/5433027071',
  links: { frame: status === 'review' ? 'https://f.io/demo' : null, dropbox: null, figma: null }, campaign: '', created_at: ago(20), updated_at: ago(1),
  tv: { production_id: null, source: 'auto', why: 'matches name' }, ...extra,
});

const team = (list) => list.map(([kind, name, role, source = 'tracker', extra = {}]) => ({ kind, name, role, source, ...extra }));

const base = (over) => ({
  production_type: 'Shoot', category: '', product_type: ['Face Cream'], producer: 'Tomer Wilf Lezmy', locked: false,
  stage_by: 'Tomer Wilf Lezmy', dates: { planned_start: off(-20), planned_end: off(25), delivery: off(30), air: null },
  shoot: { days: [], next: null }, tracker: null, team: { internal: [], external: [] },
  budget: { planned: 0, actual: 0, unpaid: 0, lines: 0 }, contract: null, cp_links: [], cp_links_count: 0, latest_update: null,
  tasks: { open: 0, overdue: 0, next: [] }, milestone: { current: null, next: null }, casting: { count: 0, warnings: 0 },
  weekly: null, tickets: [], last_activity: ago(1), signals: [], ...over,
});

export function trackerFixture() {
  const hunt = [
    ticket('The Hunt | TV | 30s Offline', 'review', ['101'], -6, 2),
    ticket('The Hunt | TV | 15s cutdown', 'working', ['103'], -2, 5),
    ticket('The Hunt | TV | Supers & legal', 'pending', ['102'], 3, 8),
    ticket('The Hunt | TV | Director’s cut', 'done', ['101'], -20, -9),
  ];
  const ashford = [
    ticket('Ashford | SP | Hero film', 'fixes', ['102'], -4, 1),
    ticket('Ashford | SP | Statics pack', 'stuck', ['104'], -3, 0),
  ];
  const holiday = [ticket('Holiday Gift Set | TV | Script', 'working', ['103'], -1, 6)];
  const withLink = (list, pid) => list.map(t => ({ ...t, tv: { ...t.tv, production_id: pid } }));

  const productions = [
    base({
      id: 'PRD26-09', name: 'The Hunt — TV Commercial', stage: 'Post', stage_since: ago(9), stage_days: 9,
      product_type: ['Face Cream', 'Anti-Gray'],
      dates: { planned_start: off(-45), planned_end: off(10), delivery: off(12), air: off(21) },
      shoot: { days: [off(-16), off(-15)], next: null },
      tracker: { deadline: off(4), deadline_label: 'Final offline to Guy & Ayal', notes: 'Color grade booked with Shai on Thursday. Music licence still pending from the label — fallback track ready.', links: [{ id: 'l1', title: 'Offline v4 (Frame.io)', url: 'https://f.io/demo' }, { id: 'l2', title: 'Music options', url: 'https://www.dropbox.com/' }], team: [], health: 'at_risk', updated_by: 'Tomer Wilf Lezmy', updated_at: ago(0.3) },
      team: {
        internal: team([['internal', 'Tomer Wilf Lezmy', 'Producer', 'cp'], ['internal', 'Doron Levi', 'Studio', 'monday', { monday_id: '101' }], ['internal', 'Omer Ben Simon', 'Studio', 'monday', { monday_id: '103' }], ['internal', 'Yael Cohen', 'Studio', 'monday', { monday_id: '102' }]]),
        external: team([['external', 'Shai Mor', 'Colorist'], ['external', 'Noa Feld', 'Director', 'budget'], ['external', 'Ido Ben Ami', 'DOP', 'budget'], ['external', 'Studio Gefen', 'Sound', 'budget']]),
      },
      budget: { planned: 180000, actual: 171500, unpaid: 3, lines: 22 }, contract: { status: 'signed', provider: 'Noa Feld' },
      cp_links: [{ category: 'Drive', title: 'Treatment', url: 'https://drive.google.com/' }, { category: 'Dropbox', title: 'Rushes', url: 'https://www.dropbox.com/' }], cp_links_count: 6,
      latest_update: { author: 'Omer Barak', body: 'Client notes on v3 are in — mostly pacing in the first 8 seconds.', at: ago(0.8), count: 14 },
      tasks: { open: 3, overdue: 1, next: [{ title: 'Approve supers', due_date: off(-1), status: 'Working on it', assignee: 'Omer Barak' }, { title: 'Deliver to broadcaster', due_date: off(12), status: 'Not Started', assignee: 'Tomer Wilf Lezmy' }] },
      milestone: { current: { title: 'Online & grade', start: off(-2), end: off(3) }, next: { title: 'Broadcast delivery', start: off(11), end: off(12) } },
      casting: { count: 4, warnings: 1 }, weekly: { week_start: off(-1), note: '', bullets: ['Offline v4 shared with Guy', 'Grade Thursday', 'Music licence chasing'] },
      tickets: withLink(hunt, 'PRD26-09'),
      signals: [{ kind: 'due_soon', level: 'amber', text: 'Due in 4d' }, { kind: 'tasks_overdue', level: 'amber', text: '1 overdue task' }, { kind: 'casting', level: 'amber', text: '1 casting right expiring' }],
    }),
    base({
      id: 'PRD26-11', name: 'Ashford Collab', stage: 'Production', stage_since: ago(5), stage_days: 5, production_type: 'Remote Shoot', product_type: ['Body Wash'],
      shoot: { days: [off(3), off(4)], next: off(3) },
      tracker: { deadline: off(-2), deadline_label: 'Hero film first cut', notes: 'Talent schedule moved — shoot pushed to Thursday.', links: [], team: [], health: 'blocked', updated_at: ago(2) },
      team: { internal: team([['internal', 'Omer Barak', 'Producer', 'cp'], ['internal', 'Yael Cohen', 'Studio', 'monday', { monday_id: '102' }], ['internal', 'Kerry Bershtein', 'Studio', 'monday', { monday_id: '104' }]]), external: team([['external', 'Ashford Studio', 'Partner'], ['external', 'Lior Katz', 'Photographer', 'budget']]) },
      budget: { planned: 60000, actual: 64200, unpaid: 2, lines: 9 }, contract: { status: 'sent', provider: 'Ashford Studio' },
      tickets: withLink(ashford, 'PRD26-11'),
      signals: [{ kind: 'overdue', level: 'red', text: 'Deadline passed 2d ago' }, { kind: 'blocked', level: 'red', text: 'Marked blocked' }, { kind: 'shoot_no_contract', level: 'red', text: 'Shoot in 3d — contract sent' }, { kind: 'over_budget', level: 'amber', text: 'Over budget by 7%' }, { kind: 'stuck_ticket', level: 'amber', text: '1 Monday ticket stuck' }],
    }),
    base({
      id: 'PRD26-12', name: 'Holiday Gift Set', stage: 'Pre Production', stage_since: ago(12), stage_days: 12, product_type: ['Gift Set'],
      shoot: { days: [off(9)], next: off(9) }, dates: { planned_start: off(-12), planned_end: off(40), delivery: off(35), air: off(45) },
      tracker: { deadline: off(9), deadline_label: 'Shoot day', notes: 'Location scout Wednesday. Need final product samples from ops.', links: [{ id: 'l3', title: 'Moodboard', url: 'https://www.figma.com/' }], team: [{ id: 't1', kind: 'external', name: 'Maya Rosen', role: 'Stylist' }], health: 'on_track', updated_at: ago(1) },
      team: { internal: team([['internal', 'Tomer Wilf Lezmy', 'Producer', 'cp'], ['internal', 'Omer Ben Simon', 'Studio', 'monday', { monday_id: '103' }]]), external: team([['external', 'Maya Rosen', 'Stylist'], ['external', 'Gal Production House', 'Service', 'budget']]) },
      budget: { planned: 95000, actual: 21000, unpaid: 1, lines: 7 }, contract: { status: 'pending', provider: 'Gal Production House' },
      milestone: { current: { title: 'Casting', start: off(-3), end: off(2) }, next: { title: 'Tech scout', start: off(4), end: off(4) } },
      tickets: withLink(holiday, 'PRD26-12'), casting: { count: 2, warnings: 0 },
      signals: [{ kind: 'shoot_no_contract', level: 'red', text: 'Shoot in 9d — contract pending' }],
    }),
    base({ id: 'PRD26-13', name: 'Founders Podcast S2', stage: 'Pending', stage_since: ago(20), stage_days: 20, production_type: 'AI', product_type: ['Brand'], last_activity: ago(19), signals: [{ kind: 'no_deadline', level: 'gray', text: 'No deadline set' }] }),
    base({ id: 'PRD26-08', name: 'Ulta Launch Kit', stage: 'Post', stage_since: ago(15), stage_days: 15, production_type: 'AI', product_type: ['Face Wash', 'Moisturizer'], tracker: { deadline: off(16), deadline_label: 'Retail assets to Ulta', notes: '', links: [], team: [], health: 'on_track', updated_at: ago(3) }, budget: { planned: 25000, actual: 18000, unpaid: 0, lines: 4 }, last_activity: ago(16), signals: [{ kind: 'stale', level: 'gray', text: 'No updates for 16d' }] }),
    base({ id: 'PRD26-14', name: 'Spring UGC Sprint', stage: 'Pre Production', stage_since: ago(2), stage_days: 2, production_type: 'Remote Shoot', product_type: ['Face Cream'], tracker: { deadline: off(30), deadline_label: '20 creator videos', notes: '', links: [], team: [], health: null, updated_at: ago(2) } }),
    base({ id: 'PRD26-10', name: 'Anti-Gray Relaunch', stage: 'Paused', stage_since: ago(30), stage_days: 30, product_type: ['Anti-Gray'], tracker: { deadline: null, deadline_label: '', notes: 'Paused until Q1 budget sign-off.', links: [], team: [], health: null, updated_at: ago(30) } }),
    base({ id: 'PRD26-05', name: 'Summer Hydration', stage: 'Completed', stage_since: ago(40), stage_days: 40, product_type: ['Moisturizer'], budget: { planned: 120000, actual: 116000, unpaid: 0, lines: 18 } }),
    base({ id: 'PRD26-04', name: 'Father’s Day', stage: 'Completed', stage_since: ago(110), stage_days: 110, product_type: ['Gift Set'] }),
  ];
  const ask = [
    { ...ticket('Black Friday | TV | 20s', 'working', ['101'], -1, 4), tv: { production_id: null, source: 'ask', confidence: 'low', suggestions: [{ id: 'PRD26-12', name: 'Holiday Gift Set', stage: 'Pre Production', score: 2.1, why: 'matches “holiday”' }] } },
    { ...ticket('New Year | TV | Teaser', 'pending', ['103'], 2, 9), tv: { production_id: null, source: 'ask', confidence: 'none', suggestions: [] } },
  ];
  return {
    brand_id: 'particle', today: off(0), generated_at: new Date().toISOString(), build_ms: 412,
    productions, ask, people, monday: true,
    directory: {
      users: [{ id: 'u1', name: 'Tomer Wilf Lezmy' }, { id: 'u2', name: 'Omer Barak' }, { id: 'u3', name: 'Lilian Krumholz' }],
      suppliers: [{ id: 's1', name: 'Noa Feld', role: 'Director' }, { id: 's2', name: 'Shai Mor', role: 'Colorist' }, { id: 's3', name: 'Maya Rosen', role: 'Stylist' }],
    },
    warnings: [],
  };
}

// Keeps DEV edits across the page's quiet reloads (the real API stores them)
let state = null;
const current = () => (state = state || trackerFixture());
export const fixtureGet = () => structuredClone(current());
export function fixtureSave(productionId, patch) {
  const p = current().productions.find(x => x.id === productionId);
  if (!p) return { ok: false };
  const withIds = (list) => (list || []).map(x => ({ id: x.id || Math.random().toString(36).slice(2), ...x }));
  p.tracker = { deadline: null, deadline_label: '', notes: '', links: [], team: [], health: null, ...(p.tracker || {}), ...patch, updated_by: 'You', updated_at: new Date().toISOString() };
  if (patch.links) p.tracker.links = withIds(patch.links);
  if (patch.team) {
    p.tracker.team = withIds(patch.team);
    for (const kind of ['internal', 'external']) {
      p.team[kind] = [...p.tracker.team.filter(m => m.kind === kind).map(m => ({ ...m, source: 'tracker' })), ...p.team[kind].filter(m => m.source !== 'tracker')];
    }
  }
  return { ok: true, tracker: p.tracker };
}
export function fixtureLink(itemId, body) {
  const s = current();
  const t = [...s.ask, ...s.productions.flatMap(p => p.tickets)].find(x => x.id === String(itemId));
  if (!t) return { ok: false };
  s.ask = s.ask.filter(x => x.id !== t.id);
  for (const p of s.productions) p.tickets = p.tickets.filter(x => x.id !== t.id);
  if (body.production_id) s.productions.find(p => p.id === body.production_id)?.tickets.unshift({ ...t, tv: { ...t.tv, production_id: body.production_id, source: 'confirmed', decided_by: 'You' } });
  return { ok: true };
}
export function fixtureStage(productionId, stage) {
  const p = current().productions.find(x => x.id === productionId);
  if (p) Object.assign(p, { stage, stage_days: 0, stage_since: new Date().toISOString(), stage_by: 'You' });
  return p || null;
}
