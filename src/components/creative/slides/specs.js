// Pure slide specifications: defaults, editable schema, text slots and view-model selectors.
// No React here — buildDeck() uses these; slides/registry.jsx maps types to components.
import { displayName, fmtNum, plural, ensureContrast, paletteColor, addDays } from '../deck/format';
import {
  DIVISIONS, DIVISION_ORDER, divisionOf, personCandidates, personSelection, productionTickets, visibleProductions, productionDatesIn,
} from './divisions';

// ── Shared selectors ────────────────────────────────────────────────────────
export function ticketOv(overrides, id) { return overrides?.tickets?.[id] || {}; }
export function isHidden(overrides, id) { return !!overrides?.tickets?.[id]?.hidden; }

export function visibleIds(snapshot, overrides, list) {
  return (list || []).filter(id => snapshot?.items?.[id] && !isHidden(overrides, id));
}

export function decorate(snapshot, overrides, id) {
  const it = snapshot.items[id];
  const ov = ticketOv(overrides, id);
  return {
    ...it,
    highlighted: !!ov.highlighted,
    highlightRank: ov.highlightRank ?? null,
    caption: ov.caption || '',
    cover: ov.cover || null,
    gallery: ov.gallery || [],
  };
}

const byHighlightThenRecent = (a, b) =>
  (Number(b.highlighted) - Number(a.highlighted)) ||
  ((a.highlightRank ?? 999) - (b.highlightRank ?? 999)) ||
  ((b.delivered_at || 0) - (a.delivered_at || 0));

export function peopleByRole(snapshot, overrides, role) {
  const bp = snapshot.metrics?.by_person || {};
  return Object.values(snapshot.people || {})
    .filter(p => p.role === role && !overrides?.people?.[p.id]?.hidden)
    .sort((a, b) => ((a.order ?? 999) - (b.order ?? 999)) || ((bp[b.id]?.delivered || 0) - (bp[a.id]?.delivered || 0)) || a.name.localeCompare(b.name));
}

function trendSeries(snapshot, key) {
  return (snapshot.trend || []).map(t => (key === 'total' ? (t.video ?? 0) + (t.design ?? 0) : t[key] ?? 0));
}

function delta(snapshot, key) {
  const v = snapshot.metrics?.vs_last_week?.[key];
  return v == null ? null : v;
}

const ROLE_LABEL = { video: 'Video editor', design: 'Designer' };
const TYPE_ICON = { video: 'video', design: 'design' };

const median = (arr) => {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

function countRows(list, keyFn, colorFn) {
  const m = new Map();
  for (const it of list) {
    const k = keyFn(it);
    if (!k) continue;
    const e = m.get(k) || { label: k, color: colorFn(it) || null, total: 0, ids: [] };
    e.total++;
    e.ids.push(it.id);
    if (!e.color) e.color = colorFn(it) || null;
    m.set(k, e);
  }
  return [...m.values()].sort((a, b) => b.total - a.total);
}

/** Per-division numbers from the snapshot's items (works for v1 snapshots too). Hidden tickets are excluded. */
export function divisionStats(snapshot, overrides, dv) {
  const S = snapshot.sections || {};
  const pick = (list) => visibleIds(snapshot, overrides, list).filter(id => divisionOf(snapshot.items[id]) === dv);
  const delivered = pick(S.delivered);
  const dItems = delivered.map(id => snapshot.items[id]);
  const turn = dItems.filter(it => it.created_at && it.delivered_at).map(it => (it.delivered_at - Date.parse(it.created_at)) / 86400000).filter(n => n >= 0);
  const trend = (snapshot.trend || []).map(t => (t.current ? delivered.length : (t.by_division?.[dv] ?? null)));
  const prev = (snapshot.trend || []).slice(-2, -1)[0];
  const prevCount = prev?.by_division?.[dv];
  return {
    delivered,
    inProgress: pick([...(S.in_progress || []), ...(S.review || []), ...(S.fixes || [])]),
    inReview: pick(S.review),
    planned: pick(S.planned_next_week),
    stuck: pick(S.stuck),
    medianTurnaround: median(turn),
    delta: prevCount != null ? delivered.length - prevCount : null,
    trend: trend.every(v => v == null) ? [] : trend.map(v => v ?? 0),
    byProduct: countRows(dItems, it => (it.product?.label && it.product.label !== '-' ? it.product.label : null), it => it.product?.color),
    byDepartment: countRows(dItems, it => it.department?.label || null, it => it.department?.color),
  };
}

// ── Common options every slide has ──────────────────────────────────────────
export const COMMON_SCHEMA = [
  { key: 'theme', type: 'segmented', label: 'Background', options: [['dark', 'Navy'], ['light', 'Light'], ['electric', 'Electric']] },
  { key: 'transition', type: 'select', label: 'Transition', options: [['push', 'Push'], ['fade', 'Fade'], ['zoom', 'Zoom'], ['none', 'None']] },
  { key: 'builds', type: 'toggle', label: 'Reveal step by step' },
  { key: 'autoAdvanceSec', type: 'number', label: 'Auto-advance (sec)', min: 0, max: 120 },
];
const COMMON_DEFAULTS = { theme: 'dark', transition: 'push', builds: false, autoAdvanceSec: 0, whenEmpty: 'hide' };

// ── Spec table ──────────────────────────────────────────────────────────────
export const SPECS = {
  cover: {
    label: 'Cover',
    category: 'Structure',
    defaults: { transition: 'fade', mosaic: true },
    schema: [{ key: 'mosaic', type: 'toggle', label: 'Background mosaic of the week’s work' }],
    textSlots: ['eyebrow', 'title', 'subtitle'],
    select(snapshot, { overrides }) {
      const delivered = visibleIds(snapshot, overrides, snapshot.sections?.delivered).map(id => decorate(snapshot, overrides, id));
      const mosaic = delivered.filter(i => i.media_refs?.length).sort(byHighlightThenRecent).slice(0, 12).map(i => i.id);
      return { week: snapshot.week, mosaic, divisions: DIVISION_ORDER.map(k => DIVISIONS[k]) };
    },
    defaultText: () => ({ eyebrow: 'Particle · Creative Department', title: 'Creative Weekly', subtitle: '' }),
  },

  dept_overview: {
    label: 'Department at a glance',
    category: 'Numbers',
    defaults: {},
    schema: [],
    textSlots: ['eyebrow', 'title'],
    select(snapshot, { overrides }) {
      const productions = visibleProductions(snapshot, overrides);
      return {
        week: snapshot.week,
        divisions: DIVISION_ORDER.map(k => {
          const s = divisionStats(snapshot, overrides, k);
          return {
            ...DIVISIONS[k],
            delivered: s.delivered.length,
            delta: s.delta,
            trend: s.trend,
            inProgress: s.inProgress.length,
            planned: s.planned.length,
            productions: k === 'tv' ? productions.length : null,
          };
        }),
      };
    },
    defaultText: (vm) => ({ eyebrow: `Last week · ${vm.week?.label || ''}`, title: 'Creative at a glance' }),
  },

  division_overview: {
    label: 'Division overview',
    category: 'Numbers',
    defaults: { division: 'design' },
    schema: [{ key: 'division', type: 'segmented', label: 'Division', options: [['design', 'Design'], ['video', 'Video'], ['tv', 'TV & SP']] }],
    textSlots: ['eyebrow', 'title'],
    select(snapshot, { overrides, options }) {
      const dv = options.division || 'design';
      const meta = DIVISIONS[dv];
      const s = divisionStats(snapshot, overrides, dv);
      if (dv === 'tv') {
        const productions = visibleProductions(snapshot, overrides).map(p => ({
          ...p, linked: productionTickets(snapshot, overrides, p).length,
          thisWeek: productionDatesIn(p, snapshot.week?.next?.start || '', addDaysStr(snapshot.week?.next?.start, 4)),
        }));
        return { division: dv, meta, week: snapshot.week, stats: s, productions, deliveredIds: s.delivered.slice(0, 4) };
      }
      // By person: everyone who delivered in this division, bars stacked by department
      const per = new Map();
      for (const id of s.delivered) {
        const it = snapshot.items[id];
        for (const uid of it.people || []) {
          const row = per.get(uid) || { uid, total: 0, segs: new Map() };
          row.total++;
          const dep = it.department?.label || 'Other';
          const seg = row.segs.get(dep) || { label: dep, color: it.department?.color || '#8c93ff', count: 0 };
          seg.count++;
          row.segs.set(dep, seg);
          per.set(uid, row);
        }
      }
      const byPerson = [...per.values()]
        .filter(r => snapshot.people?.[r.uid] && !overrides?.people?.[r.uid]?.hidden)
        .map(r => ({ person: { ...snapshot.people[r.uid], name: displayName(snapshot.people[r.uid].name) }, total: r.total, segments: [...r.segs.values()] }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 9);
      const departments = [...new Map(byPerson.flatMap(r => r.segments).map(sg => [sg.label, sg])).values()];
      return { division: dv, meta, week: snapshot.week, stats: s, byPerson, departments, byProduct: s.byProduct.slice(0, 9) };
    },
    defaultText: (vm) => ({
      eyebrow: `${vm.meta.label} · Last week · ${vm.week?.label || ''}`,
      title: vm.division === 'tv' ? 'Productions & TV' : `${vm.meta.short} overview`,
    }),
  },

  division_next: {
    label: 'Division · this week',
    category: 'Pipeline',
    defaults: { division: 'design' },
    schema: [{ key: 'division', type: 'segmented', label: 'Division', options: [['design', 'Design'], ['video', 'Video'], ['tv', 'TV & SP']] }],
    textSlots: ['eyebrow', 'title'],
    select(snapshot, { overrides, options, narrative, key }) {
      const dv = options.division || 'design';
      const meta = DIVISIONS[dv];
      const days = snapshot.workload?.next_week || [];
      const s = divisionStats(snapshot, overrides, dv);
      const custom = overrides?.slides?.[key]?.bullets;
      const ai = narrative?.focus_by_division?.[dv];
      const plannedItems = s.planned.map(id => snapshot.items[id]);
      const topProducts = countRows(plannedItems, it => (it.product?.label && it.product.label !== '-' ? it.product.label : null), it => it.product?.color).slice(0, 5);
      const fallback = topProducts.length
        ? topProducts.slice(0, 3).map(p => `${p.label}: ${plural(p.total, 'piece')} planned`)
        : [];
      const focus = Array.isArray(custom) ? custom : (ai?.length ? ai : fallback);
      if (dv === 'tv') {
        const from = snapshot.week?.next?.start || '';
        const to = addDaysStr(from, 4);
        const productions = visibleProductions(snapshot, overrides)
          .map(p => ({ ...p, hits: productionDatesIn(p, from, to) }))
          .filter(p => p.hits.length);
        return { division: dv, meta, week: snapshot.week, days, productions, planned: s.planned, topProducts, focus, focusSource: Array.isArray(custom) ? 'edited' : (ai?.length ? 'ai' : 'auto') };
      }
      const cap = snapshot.workload?.capacity?.[meta.role] || 4;
      const rows = peopleByRole(snapshot, overrides, meta.role).map(p => {
        const w = workloadFor(snapshot, overrides, p.id, days);
        return { person: { ...p, name: displayName(p.name) }, cells: w.cells, total: w.total, ids: w.ids, multiDay: w.multiDay };
      }).sort((a, b) => b.total - a.total);
      return { division: dv, meta, week: snapshot.week, days, rows, capacity: cap, planned: s.planned, topProducts, focus, focusSource: Array.isArray(custom) ? 'edited' : (ai?.length ? 'ai' : 'auto') };
    },
    defaultText: (vm) => ({ eyebrow: `${vm.meta.label} · This week · ${vm.week?.next?.label || ''}`, title: 'Coming up' }),
  },

  production: {
    label: 'Production (one per CP production)',
    category: 'Productions',
    defaults: {},
    schema: [],
    textSlots: ['eyebrow', 'title', 'subtitle'],
    // Every CP production gets a slide; "left out" ones stay in the rail (skipped when presenting)
    repeat(spec, snapshot) {
      return (snapshot.cp_weekly?.productions || []).map(p => ({ pid: p.production_id }));
    },
    keyOf: (specId, params) => `${specId}:${params.pid}`,
    select(snapshot, { overrides, params }) {
      const p = (snapshot.cp_weekly?.productions || []).find(x => x.production_id === params.pid) || null;
      if (!p) return { p: null, tickets: [] };
      const tickets = productionTickets(snapshot, overrides, p);
      const manual = Array.isArray(overrides?.productions?.[p.production_id]?.tickets);
      const from = snapshot.week?.next?.start || '';
      return { p, tickets, manual, thisWeek: productionDatesIn(p, from, addDaysStr(from, 4)), hiddenProduction: !!overrides?.productions?.[p.production_id]?.hidden };
    },
    isEmpty: (vm) => !vm.p || vm.hiddenProduction,
    defaultText: (vm) => ({
      eyebrow: vm.p ? `TV & Special Productions${vm.p.cross_brand ? ` · ${vm.p.brand?.name}` : ''} · ${vm.p.production_id}` : 'Production',
      title: vm.p?.name || 'Production',
      subtitle: '',
    }),
  },

  showcase: {
    label: 'Showcase (one project, gallery)',
    category: 'Work',
    defaults: { transition: 'fade' },
    schema: [],
    textSlots: ['eyebrow', 'title', 'subtitle'],
    select(snapshot, { overrides, key }) {
      const c = overrides?.custom?.[key] || {};
      const id = c.item;
      if (!id || !snapshot.items?.[id]) return { item: null, images: [] };
      const it = decorate(snapshot, overrides, id);
      const images = [...(it.cover ? [it.cover] : []), ...(it.gallery || []).filter(g => !(it.cover && g.refId === it.cover.refId && g.key === it.cover.key))].slice(0, 6);
      const owner = snapshot.people?.[it.people?.[0]];
      return { item: it, images, owner: owner ? { ...owner, name: displayName(owner.name) } : null };
    },
    isEmpty: (vm) => !vm.item,
    defaultText: (vm) => ({
      eyebrow: vm.item ? [vm.owner?.name, DIVISIONS[divisionOf(vm.item)]?.label].filter(Boolean).join(' · ') : 'Showcase',
      title: vm.item?.caption || vm.item?.title || 'Showcase',
      subtitle: vm.item ? [vm.item.product?.label !== '-' ? vm.item.product?.label : null, vm.item.subtitle].filter(Boolean).join(' · ') : '',
    }),
  },

  exec_summary: {
    label: 'Executive summary',
    category: 'Story',
    defaults: { builds: true },
    schema: [],
    textSlots: ['eyebrow', 'title'],
    select(snapshot, { overrides, narrative, key }) {
      const custom = overrides?.slides?.[key]?.bullets;
      const fromAi = narrative?.exec_summary;
      const bullets = Array.isArray(custom) ? custom : (Array.isArray(fromAi) && fromAi.length ? fromAi : fallbackSummary(snapshot));
      return { bullets, source: Array.isArray(custom) ? 'edited' : (fromAi?.length ? 'ai' : 'auto') };
    },
    isEmpty: (vm) => !vm.bullets?.length,
    defaultText: () => ({ eyebrow: 'Executive summary', title: 'The week in brief' }),
    builds: (vm, opts) => (opts.builds ? Math.min(vm.bullets.length, 6) : 0),
  },

  kpis: {
    label: 'KPIs',
    category: 'Numbers',
    defaults: {},
    schema: [],
    textSlots: ['eyebrow', 'title'],
    select(snapshot) {
      const t = snapshot.metrics?.totals || {};
      const ta = snapshot.metrics?.turnaround || {};
      const ot = snapshot.metrics?.on_time || {};
      return {
        tiles: [
          { key: 'video', label: 'Videos delivered', value: t.video ?? 0, delta: delta(snapshot, 'video'), spark: trendSeries(snapshot, 'video') },
          { key: 'design', label: 'Designs delivered', value: t.design ?? 0, delta: delta(snapshot, 'design'), spark: trendSeries(snapshot, 'design') },
          { key: 'turnaround', label: 'Median turnaround', value: ta.median_days, format: 'days', sub: ta.p75_days != null ? `75% within ${Math.round(ta.p75_days)}d` : null },
          { key: 'pipeline', label: 'In the pipeline', value: t.in_progress ?? 0, sub: t.in_review ? `${t.in_review} in review` : null },
        ],
        strip: [
          { label: 'On-time rate', value: ot.rate != null ? `${ot.rate}%` : '–', sub: ot.with_deadline ? `${ot.on_time} of ${ot.with_deadline} with a deadline` : 'no deadlines set' },
          { label: 'Planned next week', value: fmtNum(t.planned_next ?? 0) },
          { label: 'Fixes rounds', value: fmtNum(t.fixes_rounds_in_week ?? 0) },
          { label: 'Stuck / overdue', value: `${t.stuck ?? 0} / ${t.overdue ?? 0}` },
        ],
        partial: !!snapshot.week?.partial,
      };
    },
    defaultText: (vm) => ({ eyebrow: vm.partial ? 'By the numbers · week in progress' : 'By the numbers', title: 'Output' }),
  },

  highlights: {
    label: 'Highlights',
    category: 'Work',
    defaults: { layout: 'hero+3' },
    schema: [{ key: 'layout', type: 'segmented', label: 'Layout', options: [['hero+3', 'Hero + 3'], ['grid-6', 'Grid of 6'], ['single', 'Single']] }],
    textSlots: ['eyebrow', 'title'],
    select(snapshot, { overrides, options }) {
      const n = options.layout === 'grid-6' ? 6 : options.layout === 'single' ? 1 : 4;
      const all = visibleIds(snapshot, overrides, snapshot.sections?.delivered).map(id => decorate(snapshot, overrides, id));
      const starred = all.filter(i => i.highlighted).sort(byHighlightThenRecent);
      const rest = all.filter(i => !i.highlighted && i.media_refs?.length)
        .sort((a, b) => (Number(b.board === 'video') - Number(a.board === 'video')) || ((b.delivered_at || 0) - (a.delivered_at || 0)));
      const items = [...starred, ...rest].slice(0, n).map(i => i.id);
      return { items, layout: options.layout, auto: !starred.length };
    },
    isEmpty: (vm) => !vm.items.length,
    defaultText: () => ({ eyebrow: 'Highlights', title: 'Work worth seeing' }),
  },

  by_product: {
    label: 'By product',
    category: 'Numbers',
    defaults: { limit: 10 },
    schema: [{ key: 'limit', type: 'number', label: 'Products shown', min: 3, max: 16 }],
    textSlots: ['eyebrow', 'title', 'subtitle'],
    select(snapshot, { options }) {
      const rows = (snapshot.metrics?.by_product || []).slice(0, options.limit || 10).map((r, i) => ({
        ...r, color: ensureContrast(r.color || paletteColor(i), '#030b2e', 2.6),
      }));
      const max = Math.max(1, ...rows.map(r => r.total));
      const rest = (snapshot.metrics?.by_product || []).slice(options.limit || 10);
      return { rows, max, otherCount: rest.reduce((s, r) => s + r.total, 0), total: snapshot.metrics?.totals?.delivered ?? 0 };
    },
    isEmpty: (vm) => !vm.rows.length,
    defaultText: (vm) => ({ eyebrow: 'Output by product', title: 'Where the work went', subtitle: `${plural(vm.total, 'delivery', 'deliveries')} this week` }),
  },

  by_type: {
    label: 'Mix (type / channel)',
    category: 'Numbers',
    defaults: { dimension: 'type' },
    schema: [{ key: 'dimension', type: 'segmented', label: 'Break down by', options: [['type', 'Video type'], ['department', 'Department'], ['platform', 'Platform']] }],
    textSlots: ['eyebrow', 'title'],
    select(snapshot, { options }) {
      const src = options.dimension === 'department' ? snapshot.metrics?.by_department
        : options.dimension === 'platform' ? snapshot.metrics?.by_platform : snapshot.metrics?.by_type;
      const rows = (src || []).slice(0, 8).map((r, i) => ({ ...r, color: ensureContrast(r.color || paletteColor(i), '#030b2e', 2.6) }));
      const total = rows.reduce((s, r) => s + r.total, 0);
      return { rows, total, dimension: options.dimension };
    },
    isEmpty: (vm) => !vm.rows.length,
    defaultText: (vm) => ({
      eyebrow: vm.dimension === 'type' ? 'Video mix' : vm.dimension === 'platform' ? 'Platform mix' : 'Channel mix',
      title: vm.dimension === 'type' ? 'What kind of video' : 'Who it was for',
    }),
  },

  section: {
    label: 'Section divider',
    category: 'Structure',
    defaults: { theme: 'electric', transition: 'zoom', number: '', title: 'Section', subtitle: '' },
    schema: [{ key: 'number', type: 'text', label: 'Number' }],
    textSlots: ['title', 'subtitle'],
    select: (snapshot, { options }) => ({ number: options.number }),
    defaultText: (vm, { options }) => ({ title: options.title || 'Section', subtitle: options.subtitle || '' }),
  },

  person: {
    label: 'Person (one per creative)',
    category: 'Team',
    defaults: { role: 'video', perPage: 8 },
    schema: [
      { key: 'role', type: 'segmented', label: 'Team', options: [['video', 'Video editors'], ['design', 'Designers']] },
      { key: 'perPage', type: 'number', label: 'Max projects per slide', min: 1, max: 12 },
    ],
    textSlots: ['eyebrow', 'title', 'subtitle'],
    repeat(spec, snapshot, overrides, options) {
      return peopleByRole(snapshot, overrides, options.role).flatMap(p => {
        const n = personShown(snapshot, overrides, p.id).ids.length;
        const per = Math.max(1, overrides?.people?.[p.id]?.perPage || options.perPage || 8);
        const pages = Math.min(6, Math.max(1, Math.ceil(n / per)));
        return Array.from({ length: pages }, (_, page) => ({ uid: p.id, page, pages }));
      });
    },
    select(snapshot, { overrides, narrative, params }) {
      const uid = params.uid;
      const p = snapshot.people?.[uid] || { id: uid, name: 'Unknown' };
      const stats = snapshot.metrics?.by_person?.[uid] || {};
      const shown = personShown(snapshot, overrides, uid);
      const pages = params.pages || 1;
      const page = params.page || 0;
      // Balanced pages (9 projects over 2 slides → 5 + 4, never 8 + 1)
      const size = Math.ceil(shown.ids.length / pages) || 0;
      const tickets = shown.ids.slice(page * size, page * size + size);
      const cand = personCandidates(snapshot, uid);
      const vis = (list) => list.filter(id => !isHidden(overrides, id));
      const delivered = vis(cand.delivered);
      const active = vis(cand.active);
      const worked = [...delivered, ...active];
      const products = countRows(worked.map(id => snapshot.items[id]), it => (it.product?.label && it.product.label !== '-' ? it.product.label : null), it => it.product?.color)
        .map((r, i) => ({ ...r, color: ensureContrast(r.color || paletteColor(i), '#030b2e', 2.6) }));
      const days = snapshot.workload?.next_week || [];
      const nextWeek = workloadFor(snapshot, overrides, uid, days).cells;
      const oneLiner = overrides?.people?.[uid]?.one_liner
        ?? narrative?.per_person?.find(x => String(x.monday_user_id) === String(uid))?.one_liner ?? '';
      return {
        person: { ...p, name: displayName(p.name) },
        role: p.role,
        stats,
        oneLiner,
        tickets,
        totalShown: shown.ids.length,
        showingActive: shown.fallback,
        manual: shown.manual,
        deliveredCount: delivered.length,
        activeCount: active.length,
        tvCount: delivered.filter(id => divisionOf(snapshot.items[id]) === 'tv').length,
        products,
        // Hands-on hours: clocked in on BambooHR × the task in Working (from the Studio)
        hours: stats.hours || null,
        nextWeek,
        nextWeekTotal: new Set(nextWeek.flatMap(d => d.ids)).size,
        capacity: snapshot.workload?.capacity?.[p.role] || 4,
        page, pages,
        icon: TYPE_ICON[p.role],
      };
    },
    isEmpty: (vm) => !vm.totalShown && !vm.activeCount && !vm.nextWeekTotal,
    defaultText: (vm) => ({
      eyebrow: `${ROLE_LABEL[vm.person.role] || 'Creative'}${vm.pages > 1 ? ` · ${vm.page + 1}/${vm.pages}` : ''}`,
      title: vm.person.name,
      subtitle: vm.oneLiner || '',
    }),
  },

  studio_stats: {
    label: 'Studio stats (requesters, turnaround)',
    category: 'Team',
    defaults: {},
    schema: [],
    textSlots: ['eyebrow', 'title'],
    select(snapshot) {
      const st = snapshot.metrics?.studio;
      if (!st) return { st: null };
      const mixTotal = Object.values(st.life_mix || {}).reduce((a, v) => a + v, 0);
      const PHASE = { queued: ['Waiting', '#c4c4c4'], in_progress: ['Working', '#579bfc'], fixes: ['Fixes', '#fdab3d'], review: ['Review / approval', '#a25ddc'], paused: ['Paused', '#9d99b9'], stuck: ['Stuck', '#e2445c'], other: ['Other', '#8c93ff'] };
      const mix = Object.entries(st.life_mix || {}).filter(([k, v]) => v > 0 && PHASE[k])
        .map(([k, v]) => ({ key: k, label: PHASE[k][0], color: PHASE[k][1], pct: mixTotal ? Math.round((v / mixTotal) * 100) : 0 }))
        .sort((a, b) => b.pct - a.pct);
      const rows = (st.by_requester || []).map(r => ({ ...r, name: displayName(r.name) }));
      // Plain findings, only when the numbers support them
      const notes = [];
      const top = rows[0];
      if (top?.share >= 25) notes.push(`${top.name.split(' ')[0]}'s requests took ${top.share}% of the studio's hands-on time.`);
      const working = mix.filter(m => ['in_progress', 'fixes'].includes(m.key)).reduce((a, m) => a + m.pct, 0);
      const biggest = mix.find(m => !['in_progress', 'fixes'].includes(m.key));
      if (biggest && biggest.pct >= 25) notes.push(`A delivered task spent ${biggest.pct}% of its life ${biggest.key === 'queued' ? 'waiting to start' : biggest.key === 'review' ? 'in review / approval' : biggest.label.toLowerCase()} — ${working}% being worked on.`);
      if (st.waiting_5d) notes.push(`${plural(st.waiting_5d, 'open task')} waited more than 5 days without being started.`);
      return { st, mix, rows, notes };
    },
    isEmpty: (vm) => !vm.st || (!vm.rows.length && !vm.mix.length),
    defaultText: () => ({ eyebrow: 'Studio stats · last week', title: 'Who asked, and where the time went' }),
  },

  workload: {
    label: 'Workload',
    category: 'Team',
    defaults: { variant: 'heatmap', week: 'this' },
    schema: [
      { key: 'week', type: 'segmented', label: 'Week', options: [['this', 'This week'], ['next', 'Next week']] },
    ],
    textSlots: ['eyebrow', 'title'],
    select(snapshot, { overrides, options }) {
      const wl = snapshot.workload || {};
      const days = options.week === 'next' ? (wl.next_week || []) : (wl.this_week || []);
      const rows = ['video', 'design'].flatMap(role => peopleByRole(snapshot, overrides, role)).map(p => {
        const cells = days.map(d => {
          const c = wl.people?.[p.id]?.[d] || { planned: [], active: [] };
          const ids = [...new Set([...(c.planned || []), ...(c.active || [])])].filter(id => !isHidden(overrides, id));
          return { date: d, count: ids.length, active: (c.active || []).length, out: wl.out?.[p.id]?.[d] || null, products: ids.slice(0, 5).map(id => snapshot.items[id]?.product?.color).filter(Boolean) };
        });
        return { person: { ...p, name: displayName(p.name) }, cells, capacity: wl.capacity?.[p.role] || 4 };
      }).filter(r => r.cells.some(c => c.count));
      return { days, rows, week: options.week };
    },
    isEmpty: (vm) => !vm.rows.length,
    defaultText: (vm) => ({ eyebrow: vm.week === 'next' ? 'Workload · next week' : 'Workload · this week', title: 'Who worked on what' }),
  },

  cp_productions: {
    label: 'Productions (CP weekly)',
    category: 'Productions',
    defaults: {},
    schema: [],
    textSlots: ['eyebrow', 'title'],
    select: (snapshot) => ({ productions: snapshot.cp_weekly?.productions || [], found: !!snapshot.cp_weekly?.found }),
    isEmpty: (vm) => !vm.productions.length,
    defaultText: () => ({ eyebrow: 'Productions', title: 'On set & in post' }),
  },

  cp_updates: {
    label: 'General updates (CP weekly)',
    category: 'Productions',
    defaults: { builds: false },
    schema: [],
    textSlots: ['eyebrow', 'title'],
    select(snapshot, { overrides, key }) {
      const custom = overrides?.slides?.[key]?.bullets;
      const updates = Array.isArray(custom) ? custom.map(text => ({ text })) : (snapshot.cp_weekly?.general_updates || []);
      return { updates };
    },
    isEmpty: (vm) => !vm.updates.length,
    defaultText: () => ({ eyebrow: 'General updates', title: 'Also this week' }),
    builds: (vm, opts) => (opts.builds ? Math.min(vm.updates.length, 8) : 0),
  },

  planned_next: {
    label: 'Planned next week',
    category: 'Pipeline',
    defaults: { groupBy: 'person' },
    schema: [{ key: 'groupBy', type: 'segmented', label: 'Group by', options: [['person', 'Person'], ['product', 'Product']] }],
    textSlots: ['eyebrow', 'title'],
    select(snapshot, { overrides, options }) {
      const ids = visibleIds(snapshot, overrides, snapshot.sections?.planned_next_week);
      const groups = new Map();
      for (const id of ids) {
        const it = snapshot.items[id];
        const keys = options.groupBy === 'product'
          ? [it.product?.label || 'Other']
          : (it.people?.length ? it.people : ['unassigned']);
        for (const k of keys) {
          if (!groups.has(k)) groups.set(k, []);
          groups.get(k).push(id);
        }
      }
      const list = [...groups.entries()].map(([k, items]) => ({
        key: k,
        label: options.groupBy === 'product' ? k : (k === 'unassigned' ? 'Unassigned' : displayName(snapshot.people?.[k]?.name || 'Unknown')),
        person: options.groupBy === 'person' ? snapshot.people?.[k] || null : null,
        color: options.groupBy === 'product' ? (snapshot.items[items[0]]?.product?.color || null) : null,
        items,
      })).sort((a, b) => b.items.length - a.items.length);
      return { groups: list.slice(0, 8), total: ids.length, next: snapshot.week?.next };
    },
    isEmpty: (vm) => !vm.total,
    defaultText: (vm) => ({ eyebrow: `Next week · ${vm.next?.label || ''}`, title: 'Coming up' }),
  },

  risks: {
    label: 'Risks & blockers',
    category: 'Pipeline',
    defaults: { whenEmpty: 'celebrate', fixesThreshold: 2 },
    schema: [{ key: 'whenEmpty', type: 'segmented', label: 'If nothing is at risk', options: [['celebrate', 'Show “all clear”'], ['hide', 'Hide slide']] }],
    textSlots: ['eyebrow', 'title'],
    select(snapshot, { overrides, options }) {
      const v = (list) => visibleIds(snapshot, overrides, list);
      const fixesHeavy = v([...(snapshot.sections?.delivered || []), ...(snapshot.sections?.fixes || [])])
        .filter(id => (snapshot.items[id].fixes_in_week || 0) >= (options.fixesThreshold || 2));
      return {
        stuck: v(snapshot.sections?.stuck),
        overdue: v(snapshot.sections?.overdue),
        fixes: [...new Set(fixesHeavy)],
        reopened: v(snapshot.sections?.reopened),
      };
    },
    isEmpty: (vm) => !(vm.stuck.length || vm.overdue.length || vm.fixes.length || vm.reopened.length),
    defaultText: () => ({ eyebrow: 'Watch list', title: 'Risks & blockers' }),
  },

  custom: {
    label: 'Custom slide',
    category: 'Structure',
    defaults: { layout: 'text' },
    schema: [{ key: 'layout', type: 'segmented', label: 'Layout', options: [['text', 'Text'], ['image', 'Text + image']] }],
    textSlots: ['eyebrow', 'title', 'subtitle'],
    select: (snapshot, { overrides, key }) => {
      const c = overrides?.custom?.[key] || {};
      return { body: overrides?.slides?.[key]?.body ?? c.body ?? '', imageRef: c.imageRef || null, imageItem: c.imageItem || null };
    },
    defaultText: () => ({ eyebrow: '', title: 'New slide', subtitle: '' }),
  },

  closing: {
    label: 'Closing',
    category: 'Structure',
    defaults: { transition: 'fade' },
    schema: [],
    textSlots: ['eyebrow', 'title'],
    select(snapshot, { overrides, narrative, key }) {
      const custom = overrides?.slides?.[key]?.bullets;
      const ai = narrative?.next_week_focus;
      const bullets = Array.isArray(custom) ? custom : (ai?.length ? ai : fallbackFocus(snapshot));
      return { bullets, next: snapshot.week?.next };
    },
    defaultText: () => ({ eyebrow: 'Next week', title: 'Focus' }),
  },
};

export const SLIDE_TYPES = Object.keys(SPECS);

export function optionsFor(type, specOptions, ovOptions) {
  return { ...COMMON_DEFAULTS, ...(SPECS[type]?.defaults || {}), ...(specOptions || {}), ...(ovOptions || {}) };
}

// ── Helpers ─────────────────────────────────────────────────────────────────
function addDaysStr(s, n) { return s ? addDays(s, n) : ''; }

/** Sun–Thu working days in [from, to] (inclusive, YYYY-MM-DD). */
function workdaysIn(from, to) {
  if (!from) return 1;
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to || from}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return 1;
  let n = 0;
  for (let t = a, i = 0; t <= b && i < 370; t += 86400000, i++) if (new Date(t).getUTCDay() <= 4) n++;
  return Math.max(1, n);
}

/**
 * A person's workload for the given days. A project's effort is SPREAD over the working days of its
 * timeline (a Sun–Thu project = 0.2 a day), so ten week-long projects read as 2 a day, not 10 — and
 * every project counts once in the total.
 */
export function workloadFor(snapshot, overrides, uid, days) {
  const wl = snapshot.workload?.people?.[uid] || {};
  const offs = snapshot.workload?.out?.[uid] || {};
  const share = new Map();
  const cells = days.map(d => {
    const ids = [...new Set(wl[d]?.planned || [])].filter(id => !isHidden(overrides, id));
    let load = 0;
    for (const id of ids) {
      if (!share.has(id)) { const tl = snapshot.items?.[id]?.timeline; share.set(id, 1 / workdaysIn(tl?.from, tl?.to)); }
      load += share.get(id);
    }
    // out: a day off or a holiday (BambooHR, through the Studio)
    return { date: d, ids, count: ids.length, load: Math.round(load * 10) / 10, out: offs[d] || null };
  });
  const ids = [...new Set(cells.flatMap(c => c.ids))];
  const multiDay = ids.filter(id => share.get(id) < 1).length;
  return { cells, ids, total: ids.length, multiDay };
}

export function fmtLoad(n) {
  if (!n) return '';
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

/** What a person slide shows: the chosen projects, else what they delivered, else what they're on now. */
export function personShown(snapshot, overrides, uid) {
  const manual = Array.isArray(overrides?.people?.[uid]?.selection);
  const ids = personSelection(snapshot, overrides, uid);
  if (ids.length || manual) return { ids, manual, fallback: false };
  const active = personCandidates(snapshot, uid).active.filter(id => !isHidden(overrides, id)).slice(0, 6);
  return { ids: active, manual: false, fallback: active.length > 0 };
}

/** Every ticket of a division (optionally one person / one product), grouped for the product drill-down. */
export function productBreakdown(snapshot, overrides, { division, product, uid, ids: only }) {
  const S = snapshot.sections || {};
  const onlySet = Array.isArray(only) ? new Set(only.map(String)) : null;
  const match = (id) => {
    const it = snapshot.items?.[id];
    if (!it || isHidden(overrides, id)) return false;
    if (onlySet) return onlySet.has(String(id));
    if (!uid && division && divisionOf(it) !== division) return false;
    if (uid && !it.people?.includes(uid)) return false;
    if (product && (it.product?.label || '') !== product) return false;
    return true;
  };
  const seen = new Set();
  const take = (list) => (list || []).filter(id => match(id) && !seen.has(id) && seen.add(id));
  return [
    { key: 'delivered', label: 'Delivered last week', ids: take(S.delivered) },
    { key: 'active', label: 'In progress', ids: take([...(S.review || []), ...(S.in_progress || []), ...(S.fixes || []), ...(S.stuck || [])]) },
    { key: 'planned', label: 'Planned this week', ids: take(S.planned_next_week) },
    { key: 'other', label: 'Also open', ids: take(Object.keys(snapshot.items || {})) },
  ].filter(g => g.ids.length);
}

export function personTickets(snapshot, overrides, uid) {
  const mine = (list) => visibleIds(snapshot, overrides, list).filter(id => snapshot.items[id].people?.includes(uid));
  const delivered = mine(snapshot.sections?.delivered).map(id => decorate(snapshot, overrides, id)).sort(byHighlightThenRecent).map(i => i.id);
  const current = [...new Set([...mine(snapshot.sections?.in_progress), ...mine(snapshot.sections?.review), ...mine(snapshot.sections?.fixes), ...mine(snapshot.sections?.stuck)])];
  return { delivered, current };
}

function fallbackSummary(snapshot) {
  const t = snapshot.metrics?.totals || {};
  const vs = snapshot.metrics?.vs_last_week;
  const top = (snapshot.metrics?.by_product || [])[0];
  const out = [];
  out.push(`${plural(t.delivered ?? 0, 'piece')} delivered — ${plural(t.video ?? 0, 'video')} and ${plural(t.design ?? 0, 'design')}.`);
  if (vs?.delivered != null) out.push(vs.delivered === 0 ? 'Output flat versus last week.' : `${vs.delivered > 0 ? 'Up' : 'Down'} ${Math.abs(vs.delivered)} versus last week.`);
  if (top) out.push(`${top.label} led the week with ${plural(top.total, 'delivery', 'deliveries')}.`);
  if (t.in_progress) out.push(`${plural(t.in_progress, 'ticket')} in the pipeline, ${plural(t.planned_next ?? 0, 'item')} planned for next week.`);
  if ((t.stuck ?? 0) + (t.overdue ?? 0) > 0) out.push(`Needs attention: ${t.stuck ?? 0} stuck, ${t.overdue ?? 0} overdue.`);
  return out;
}

function fallbackFocus(snapshot) {
  const ids = snapshot.sections?.planned_next_week || [];
  const counts = new Map();
  for (const id of ids) {
    const p = snapshot.items[id]?.product?.label;
    if (p && p !== '-') counts.set(p, (counts.get(p) || 0) + 1);
  }
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
  const out = top.map(([p, n]) => `${p}: ${plural(n, 'piece')} planned`);
  if (!out.length) out.push('Keep the pipeline moving');
  return out;
}
