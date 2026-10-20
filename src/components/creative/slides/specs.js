// Pure slide specifications: defaults, editable schema, text slots and view-model selectors.
// No React here — buildDeck() uses these; slides/registry.jsx maps types to components.
import { displayName, fmtNum, plural, ensureContrast, paletteColor } from '../deck/format';

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
      const t = snapshot.metrics?.totals || {};
      const delivered = visibleIds(snapshot, overrides, snapshot.sections?.delivered).map(id => decorate(snapshot, overrides, id));
      const mosaic = delivered.filter(i => i.media_refs?.length).sort(byHighlightThenRecent).slice(0, 12).map(i => i.id);
      return {
        week: snapshot.week,
        kpis: [
          { key: 'video', label: 'Videos delivered', value: t.video ?? 0 },
          { key: 'design', label: 'Designs delivered', value: t.design ?? 0 },
          { key: 'people', label: 'Creatives', value: t.people ?? 0 },
        ],
        mosaic,
      };
    },
    defaultText: (vm) => ({ eyebrow: 'Creative Weekly', title: `Week ${vm.week?.number ?? ''}`, subtitle: 'Prepared for Guy & Ayal' }),
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
      { key: 'perPage', type: 'number', label: 'Tiles per slide', min: 3, max: 12 },
    ],
    textSlots: ['eyebrow', 'title', 'subtitle'],
    repeat(spec, snapshot, overrides, options) {
      return peopleByRole(snapshot, overrides, options.role).flatMap(p => {
        const n = personTickets(snapshot, overrides, p.id).delivered.length;
        const pages = Math.max(1, Math.ceil(n / (options.perPage || 8)));
        return Array.from({ length: Math.min(pages, 4) }, (_, page) => ({ uid: p.id, page, pages: Math.min(pages, 4) }));
      });
    },
    select(snapshot, { overrides, narrative, options, params }) {
      const p = snapshot.people?.[params.uid] || { id: params.uid, name: 'Unknown' };
      const stats = snapshot.metrics?.by_person?.[params.uid] || {};
      const t = personTickets(snapshot, overrides, params.uid);
      const per = options.perPage || 8;
      const page = params.page || 0;
      const delivered = t.delivered.slice(page * per, page * per + per);
      const oneLiner = overrides?.people?.[params.uid]?.one_liner
        ?? narrative?.per_person?.find(x => String(x.monday_user_id) === String(params.uid))?.one_liner ?? '';
      const trend = (snapshot.trend || []).map(w => w.by_person?.[params.uid] ?? 0);
      return {
        person: { ...p, name: displayName(p.name) },
        stats,
        oneLiner,
        tickets: delivered,
        totalDelivered: t.delivered.length,
        current: page === 0 ? t.current.slice(0, delivered.length ? 3 : 8) : [],
        page, pages: params.pages || 1,
        trend,
        icon: TYPE_ICON[p.role],
      };
    },
    isEmpty: (vm) => !vm.totalDelivered && !vm.current.length,
    defaultText: (vm) => ({
      eyebrow: `${ROLE_LABEL[vm.person.role] || 'Creative'}${vm.pages > 1 ? ` · ${vm.page + 1}/${vm.pages}` : ''}`,
      title: vm.person.name,
      subtitle: vm.oneLiner || '',
    }),
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
          return { date: d, count: ids.length, active: (c.active || []).length, products: ids.slice(0, 5).map(id => snapshot.items[id]?.product?.color).filter(Boolean) };
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
