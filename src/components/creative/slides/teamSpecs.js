// Creative Team Weekly slide specs (merged into SPECS in specs.js). Pure, like specs.js.
// The team deck connects everyone to the numbers without making it a contest: team totals lead, people always
// appear in the same order, and a person's slide shows their work and their best creative — never a ranking.
import { displayName } from '../deck/format';
import { isHidden, visibleIds } from './specs';
import { DIVISIONS, DIVISION_ORDER, divisionOf } from './divisions';

const DAY = 86400000;
const median = (arr) => {
  const s = arr.filter(n => Number.isFinite(n)).sort((a, b) => a - b);
  if (!s.length) return null;
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const pct = (now, before) => (now != null && before ? (now - before) / before : null);
const PRIORITY_RANK = { critical: 3, high: 2, medium: 1, low: 0 };
const priorityRank = (p) => PRIORITY_RANK[String(p?.label || '').toLowerCase().replace(/[^a-z]/g, '')] ?? -1;
// Always the same order (the roster's, then A–Z) — never by how much someone delivered
const crewByRole = (snapshot, overrides, role) => Object.values(snapshot.people || {})
  .filter(p => p.role === role && !overrides?.people?.[p.id]?.hidden)
  .sort((a, b) => ((a.order ?? 999) - (b.order ?? 999)) || a.name.localeCompare(b.name));
const workdaysIn = (tl, days) => (tl?.from ? days.filter(d => d >= tl.from && d <= (tl.to || tl.from)).length : 0);

/** The team's Meta numbers from AFTERLIFE (null when it isn't connected). */
function marketPulse(perf) {
  if (!perf?.totals) return null;
  const t = perf.totals;
  const p = perf.prev || {};
  return [
    { key: 'spend', label: 'Spend', value: t.spend, delta: pct(t.spend, p.spend), fmt: 'money' },
    { key: 'roas', label: 'ROAS', value: t.roas, delta: pct(t.roas, p.roas), fmt: 'x' },
    { key: 'ctr', label: 'CTR', value: t.ctr, delta: pct(t.ctr, p.ctr), fmt: 'pct' },
    { key: 'hook', label: 'Thumbstop', value: t.hook, delta: pct(t.hook, p.hook), fmt: 'pct', note: 'video · 3-sec views ÷ impressions' },
  ];
}

/** A creative from AFTERLIFE, with its makers resolved against the deck's people. */
function creativeVm(snapshot, c) {
  const people = (c.makers || (c.makerId ? [c.makerId] : [])).map(id => snapshot.people?.[id] || snapshot.team?.performance?.people?.[id]).filter(Boolean)
    .map(p => ({ ...p, name: displayName(p.name) }));
  return { ...c, people };
}

export const TEAM_SPECS = {
  team_week: {
    label: 'Last week, together',
    category: 'Team',
    defaults: {},
    schema: [],
    textSlots: ['eyebrow', 'title'],
    select(snapshot, { overrides }) {
      const delivered = visibleIds(snapshot, overrides, snapshot.sections?.delivered);
      const divisions = DIVISION_ORDER.map(k => ({ ...DIVISIONS[k], count: delivered.filter(id => divisionOf(snapshot.items[id]) === k).length }));
      // Everyone who shipped something — fixed order (designers, then editors), no counts
      const shipped = new Set(delivered.flatMap(id => snapshot.items[id].people || []));
      const crew = ['design', 'video'].flatMap(role => crewByRole(snapshot, overrides, role)).filter(p => shipped.has(p.id))
        .map(p => ({ ...p, name: displayName(p.name) }));
      const perf = snapshot.team?.performance;
      return {
        total: delivered.length,
        divisions,
        crew,
        hours: snapshot.metrics?.studio?.hands_on_hours ?? null,
        pulse: marketPulse(perf),
        inhouseShare: perf?.inhouse?.share ?? null,
      };
    },
    isEmpty: (vm) => !vm.total && !vm.pulse,
    defaultText: () => ({ eyebrow: 'Last week, together', title: 'What we shipped' }),
  },

  market_wins: {
    label: 'What the market told us',
    category: 'Performance',
    defaults: { count: 4 },
    schema: [{ key: 'count', type: 'number', label: 'Creatives shown', min: 2, max: 6 }],
    textSlots: ['eyebrow', 'title'],
    select(snapshot, { overrides, options, key }) {
      const perf = snapshot.team?.performance;
      const hidden = new Set(overrides?.slides?.[key]?.hiddenCreatives || []);
      const wins = (perf?.creatives || []).filter(c => c.makerId && !hidden.has(c.key)).slice(0, options.count || 4).map(c => creativeVm(snapshot, c));
      const custom = overrides?.slides?.[key]?.bullets;
      return { wins, learnings: Array.isArray(custom) ? custom : (perf?.learnings || []) };
    },
    isEmpty: (vm) => !vm.wins.length,
    defaultText: () => ({ eyebrow: 'Last week on Meta', title: 'What the market told us' }),
  },

  market_people: {
    label: 'Our work in market',
    category: 'Performance',
    defaults: { role: 'design' },
    schema: [{ key: 'role', type: 'segmented', label: 'Team', options: [['design', 'Designers'], ['video', 'Video editors']] }],
    textSlots: ['eyebrow', 'title'],
    select(snapshot, { overrides, options }) {
      const perf = snapshot.team?.performance;
      if (!perf) return { cards: [], role: options.role };
      const makers = Object.fromEntries((perf.makers || []).map(m => [String(m.id), m]));
      const cards = crewByRole(snapshot, overrides, options.role).map((p) => {
        const mk = makers[p.id];
        return { person: { ...p, name: displayName(p.name) }, live: mk?.creatives || 0, best: mk?.best ? creativeVm(snapshot, mk.best) : null };
      });
      return { cards, role: options.role };
    },
    isEmpty: (vm) => !vm.cards.some(c => c.live),
    defaultText: (vm) => ({ eyebrow: 'Our work in market', title: vm.role === 'video' ? 'Video editors' : 'Designers' }),
  },

  team_focus: {
    label: 'This week: main projects',
    category: 'Team',
    defaults: { role: 'video' },
    schema: [{ key: 'role', type: 'segmented', label: 'Team', options: [['video', 'Video editors'], ['design', 'Designers']] }],
    textSlots: ['eyebrow', 'title'],
    select(snapshot, { overrides, options }) {
      const wl = snapshot.workload || {};
      const days = wl.next_week || [];
      const hotIds = new Set((snapshot.team?.hot?.projects || []).flatMap(p => [p.item?.id]).filter(Boolean));
      const pinnedMain = overrides?.focus || {}; // { uid: itemId } chosen by hand
      const cards = crewByRole(snapshot, overrides, options.role).map((p) => {
        const ids = [...new Set(days.flatMap(d => wl.people?.[p.id]?.[d]?.planned || []))]
          .filter(id => snapshot.items?.[id] && !isHidden(overrides, id));
        const items = ids.map(id => snapshot.items[id]);
        // Main project: picked by hand → a hot project → highest priority → most days this week → nearest deadline
        const score = (it) => [hotIds.has(it.id) ? 1 : 0, priorityRank(it.priority), workdaysIn(it.timeline, days), -(Date.parse(it.deadline || '2999-01-01') / DAY)];
        const sorted = [...items].sort((a, b) => {
          const x = score(a); const y = score(b);
          for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return y[i] - x[i];
          return 0;
        });
        const chosen = pinnedMain[p.id] && items.find(i => i.id === pinnedMain[p.id]);
        const main = chosen || sorted[0] || null;
        const rest = sorted.filter(i => i !== main);
        const off = days.filter(d => wl.out?.[p.id]?.[d]);
        return {
          person: { ...p, name: displayName(p.name) },
          main: main ? { ...main, hot: hotIds.has(main.id), days: days.filter(d => main.timeline?.from && d >= main.timeline.from && d <= (main.timeline.to || main.timeline.from)) } : null,
          rest: rest.map(i => ({ ...i, hot: hotIds.has(i.id) })),
          off,
        };
      });
      return { cards: cards.filter(c => c.main || c.off.length), days, role: options.role };
    },
    isEmpty: (vm) => !vm.cards.length,
    defaultText: (vm) => ({ eyebrow: 'This week', title: vm.role === 'video' ? 'Video editors' : 'Designers' }),
  },

  hot_projects: {
    label: 'Hot projects',
    category: 'Team',
    defaults: {},
    schema: [],
    textSlots: ['eyebrow', 'title'],
    select(snapshot) {
      const hot = snapshot.team?.hot;
      const nameOf = (uid) => displayName(snapshot.people?.[uid]?.name || hot?.people?.[uid]?.name || '');
      const projects = (hot?.projects || []).map(p => ({
        ...p,
        title: p.title || p.item.title || p.item.name,
        owners: (p.item.people || []).map(uid => ({ id: uid, name: nameOf(uid), photo: snapshot.people?.[uid]?.photo || hot?.people?.[uid]?.photo || null })).filter(o => o.name),
        askers: (p.item.requested_by || []).map(nameOf).filter(Boolean),
      }));
      return { projects };
    },
    isEmpty: (vm) => !vm.projects.length,
    defaultText: () => ({ eyebrow: 'This week', title: 'Hot projects' }),
  },

  sla: {
    label: 'SLAs: turnaround',
    category: 'Team',
    defaults: { limit: 7 },
    schema: [{ key: 'limit', type: 'number', label: 'Task types shown', min: 3, max: 12 }],
    textSlots: ['eyebrow', 'title'],
    select(snapshot, { overrides, options }) {
      const done = visibleIds(snapshot, overrides, snapshot.sections?.delivered).map(id => snapshot.items[id])
        .filter(it => it.life?.submitted && it.life?.completed && !it.life.partial);
      // A task's type: video → Monday Type, design → Department, TV & SP on its own
      const kindOf = (it) => (divisionOf(it) === 'tv' ? 'TV & SP' : it.board === 'video' ? (it.type?.label || 'Video · other') : (it.department?.label || 'Design · other'));
      const row = (label, list) => ({
        label,
        n: list.length,
        board: list[0] ? divisionOf(list[0]) : null,
        // request → completed, minus any time it sat approved before the final completion
        total: median(list.map(it => (Date.parse(it.life.completed) - Date.parse(it.life.submitted)) / DAY - (it.life.phases?.delivered || 0) / 86400)),
        fixes: median(list.map(it => (it.life.phases?.fixes || 0) / 3600)),
        working: median(list.map(it => (it.life.phases?.in_progress || 0) / 3600)),
        hours: median(list.map(it => (it.effort_total_s || 0) / 3600)),
        fixRounds: median(list.map(it => it.life.fix_rounds || 0)),
      });
      const groups = new Map();
      for (const it of done) {
        const k = kindOf(it);
        if (!groups.has(k)) groups.set(k, []);
        groups.get(k).push(it);
      }
      const rows = [...groups.entries()].map(([k, list]) => row(k, list)).sort((a, b) => b.n - a.n).slice(0, options.limit || 7);
      // Where a delivered task's calendar time went, all tasks together
      const PHASE = { queued: ['Waiting to start', '#c4c4c4'], in_progress: ['Working', '#579bfc'], review: ['Review / approval', '#a25ddc'], fixes: ['Fixes', '#fdab3d'], paused: ['Paused', '#9d99b9'], stuck: ['Stuck', '#e2445c'] };
      const sum = {};
      for (const it of done) for (const [k, v] of Object.entries(it.life.phases || {})) if (PHASE[k]) sum[k] = (sum[k] || 0) + v;
      const all = Object.values(sum).reduce((a, v) => a + v, 0);
      const mix = Object.entries(sum).filter(([, v]) => v > 0).map(([k, v]) => ({ key: k, label: PHASE[k][0], color: PHASE[k][1], pct: Math.round((v / all) * 100) }))
        .sort((a, b) => Object.keys(PHASE).indexOf(a.key) - Object.keys(PHASE).indexOf(b.key));
      return { rows, overall: done.length ? row('All tasks', done) : null, mix, n: done.length };
    },
    isEmpty: (vm) => !vm.rows.length,
    defaultText: () => ({ eyebrow: 'How we work · last week', title: 'Turnaround, request → completed' }),
  },
};

