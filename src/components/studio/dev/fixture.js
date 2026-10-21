// Offline dev data for the Studio (only used by `npm run dev` without VITE_STUDIO_LIVE=1).
// Synthetic people — the repo is public. Shapes mirror backend/src/lib/studio/data.js.
const VIDEO_ST = [['Completed', '#037f4c', 'delivered'], ['Approved', '#00c875', 'delivered'], ['Review', '#9cd326', 'review'], ['For Approval', '#cab641', 'review'], ['Fixes Round', '#fdab3d', 'fixes'], ['Working', '#579bfc', 'in_progress'], ['Pending', '#e2445c', 'queued'], ['Ready for Assignment', '#c4c4c4', 'queued'], ['Paused', '#9d99b9', 'paused'], ['Stuck', '#333333', 'stuck']];
const DESIGN_ST = [['Completed', '#00c875', 'delivered'], ['Approved', '#784bd1', 'delivered'], ['Quality Check', '#579bfc', 'review'], ['For Approval', '#ff158a', 'review'], ['Fixes Round', '#cab641', 'fixes'], ['Working', '#fdab3d', 'in_progress'], ['Pending', '#7eb6d4', 'queued'], ['Ready for Assignment', '#c4c4c4', 'queued'], ['Paused', '#9d99b9', 'paused'], ['Stuck', '#e2445c', 'stuck']];
const PRODUCTS = [['Face Cream', '#579bfc'], ['Gravité', '#037f4c'], ['NeoRoot', '#5559df'], ['Anti Gray Serum', '#9d50dd'], ['Hand Cream', '#175a63'], ['Shampoo', '#a1e3f6']];
const PEOPLE = [['101', 'Noa Peretz', 'video'], ['102', 'Itai Cohen', 'video'], ['103', 'Dana Mizrahi', 'video'], ['201', 'Tal Ben-Ami', 'design'], ['202', 'Lior Katz', 'design'], ['203', 'Shira Golan', 'design']];
const REQ = [['301', 'Avi Levi'], ['302', 'Maya Ron'], ['303', 'Gil Adar'], ['304', 'Rina Sol']];
const CAMPAIGNS = ['The Line Up', 'Heart Rate Test', 'The Hunt', 'Black Friday 2026', 'Creators Oct', 'Amazon UK'];
const PRODUCTIONS = [['PRD26-09', 'Particle Gravité The Heart Rate Test Campaign', 'Post'], ['PRD26-20', 'The Hunt', 'Production'], ['PRD26-18', 'The Math', 'Production'], ['PRD26-73', 'The Triple Threat', 'Production']];

function sundayOf(s) { const d = new Date(`${s}T12:00:00Z`); return add(s, -d.getUTCDay()); }
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
        timeline: (() => { const a = Math.floor(r() * days.length); return { from: days[a], to: days[Math.min(days.length - 1, a + Math.floor(r() * 4))] }; })(),
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
  const holidays = [{ start: add(sundayOf(today), 10), end: add(sundayOf(today), 10), type: 'holiday', name: 'Company holiday' }];
  for (const p of Object.values(people)) p.out = [...p.out, ...holidays];
  const emails = ['202', '203', '201'].flatMap((pid, i) => [0, 1].map(k => ({
    id: String(14000000000 + i * 10 + k), board: 'retention', division: 'email', name: `Email | ${CAMPAIGNS[(i + k) % CAMPAIGNS.length]} | Klaviyo flow ${i + k + 1}`, title: `Klaviyo flow ${i + k + 1}`,
    group: 'October Campaigns (2026)', status: k ? { label: 'Design Stage', color: '#fdab3d', category: 'in_progress' } : { label: 'Copy Review', color: '#a25ddc', category: 'review' },
    people: [pid], requested_by: [], deadline: add(from, 3 + i), launch: add(from, 6 + i), timeline: k ? { from: add(from, 1 + i), to: add(from, 2 + i) } : null,
    product: { label: PRODUCTS[i][0], color: PRODUCTS[i][1] }, open: true, monday_url: 'https://monday.com',
  })));
  boards.retention = { key: 'retention', label: 'Email', board_id: '3', statuses: [] };
  return {
    emails, holidays,
    period: { from, to, partial: to >= today }, generated_at: new Date().toISOString(), build_ms: 10, today,
    boards, people, requesters, items, productions: PRODUCTIONS.map(([id, name, stage]) => ({ id, name, stage })),
    effort_source: 'bamboohr', capacity: { video: 3, design: 5 }, warnings: [],
  };
}

export const fixtureInspiration = { date: '2026-10-21', line: 'Just keep swimming.', title: 'Finding Nemo', year: 2003, director: 'Andrew Stanton', image_url: null, source: null };
export const fixtureConnections = { monday: { connected: true }, bamboohr: { connected: false }, tmdb: { connected: false } };

const OPTS = {
  department: ['Marketing/Media', 'TV', 'Amazon', 'CRM', 'Website'], product: PRODUCTS.map(p => p[0]).concat('Not a Product Task'),
  type: ['Iterations/Cuts/Edits', 'UGC/Creator', 'TV', 'AI Project', 'Motion Design'], priority: ['Critical', 'High', 'Medium', 'Low'],
  sizes: ['9x16', '4x5', '1x1', '16x9'], ai_assist: ['None', 'Claude', 'ChatGPT'], platform: ['Meta', 'Google', 'AppLovin', 'TikTok'], campaign: CAMPAIGNS,
};
const fld = (key, label, type, required, options) => ({ key, label, type, required: !!required, options: options || null });
export const fixtureTicketForm = {
  boards: {
    video: { key: 'video', label: 'Video Projects', fields: [
      fld('department', 'Department', 'status', 1, OPTS.department), fld('product', 'Product', 'status', 1, OPTS.product), fld('type', 'Type', 'status', 1, OPTS.type),
      fld('task_name', 'Task name', 'name', 1), fld('concept', 'Video concept', 'long_text', 1), fld('script', 'Script / message', 'long_text'),
      fld('requested_by', 'Requested by', 'people', 0, REQ.map(r => r[1])), fld('assignee', 'Editor', 'people', 0, PEOPLE.filter(p => p[2] === 'video').map(p => p[1])),
      fld('versions', 'Versions needed', 'number'), fld('priority', 'Priority', 'status', 0, OPTS.priority), fld('sizes', 'Sizes needed', 'dropdown', 0, OPTS.sizes),
      fld('deadline', 'Deadline', 'date'), fld('ai_assist', 'AI assist', 'status', 0, OPTS.ai_assist), fld('platform', 'Platform', 'status', 0, OPTS.platform)] },
    design: { key: 'design', label: 'Design Projects 2.0', fields: [
      fld('department', 'Department', 'status', 1, OPTS.department), fld('product', 'Product', 'status', 1, OPTS.product), fld('task_name', 'Task name', 'name', 1),
      fld('concept', 'Concept', 'long_text', 1), fld('requested_by', 'Requested by', 'people', 0, REQ.map(r => r[1])),
      fld('assignee', 'Designer', 'people', 0, PEOPLE.filter(p => p[2] === 'design').map(p => p[1])), fld('sizes', 'Sizes', 'dropdown', 0, OPTS.sizes),
      fld('deadline', 'Deadline', 'date'), fld('priority', 'Priority', 'status', 0, OPTS.priority)] },
  },
  people: {}, recent: [],
  empty: Object.fromEntries(['department', 'product', 'type', 'task_name', 'concept', 'script', 'hook', 'requested_by', 'assignee', 'versions', 'priority', 'sizes', 'deadline', 'ai_assist', 'platform', 'campaign', 'duration', 'supporting_text', 'other_sizes', 'website_task']
    .map(k => [k, ['sizes', 'campaign', 'requested_by', 'assignee'].includes(k) ? [] : ''])),
};
export function fixtureDraft({ messages, draft }) {
  const last = messages[messages.length - 1]?.content || '';
  const design = /static|banner|website|design/i.test(last);
  const product = PRODUCTS.map(p => p[0]).find(p => last.toLowerCase().includes(p.toLowerCase().split(' ')[0])) || draft.product || '';
  const fields = { ...draft, department: draft.department || 'Marketing/Media', product, type: design ? '' : (draft.type || 'Iterations/Cuts/Edits'),
    task_name: draft.task_name || last.slice(0, 60), concept: draft.concept || last, versions: draft.versions || '1', priority: draft.priority || 'Medium',
    sizes: draft.sizes?.length ? draft.sizes : ['9x16'].filter(s => last.includes(s)) };
  const missing = (design ? ['department', 'product', 'task_name', 'concept'] : ['department', 'product', 'type', 'task_name', 'concept']).filter(k => !fields[k]);
  return { reply: missing.length ? `Got it. Which ${missing[0]}?` : 'Ready — review the form and submit.', board: design ? 'design' : 'video', fields, missing, ready: !missing.length };
}
