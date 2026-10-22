/**
 * Creative Weekly configuration: code defaults deep-merged with settings.creative_config.
 * Board/column ids verified live against Monday (Creative Studio workspace 8806493).
 */
const db = require('../../db');
const { boardMeta, normLabel } = require('../monday');

const SLIDE_TYPES = [
  'cover', 'exec_summary', 'dept_overview', 'division_overview', 'division_next', 'production', 'showcase',
  'kpis', 'highlights', 'by_product', 'by_type', 'section',
  'person', 'workload', 'cp_productions', 'cp_updates', 'planned_next', 'risks', 'custom', 'closing',
  'studio_stats',
];

/**
 * v2 — the creative department as three divisions, presented on Sunday about the Sun–Thu that ended:
 * Design (overview → each designer → this week), Video (same), TV & Special Productions
 * (CP productions are the core: one slide each, with their connected Monday tickets).
 * Stored templates older than this version are ignored in favour of this one.
 */
const TEMPLATE_VERSION = 2;
const DEFAULT_TEMPLATE = {
  version: TEMPLATE_VERSION,
  slides: [
    { id: 'cover',           type: 'cover',             enabled: true, options: {} },
    { id: 'exec_summary',    type: 'exec_summary',      enabled: true, options: {} },
    { id: 'dept_overview',   type: 'dept_overview',     enabled: true, options: {} },
    { id: 'sec_design',      type: 'section',           enabled: true, options: { number: '01', title: 'Design', subtitle: '', division: 'design' } },
    { id: 'design_overview', type: 'division_overview', enabled: true, options: { division: 'design' } },
    { id: 'person_design',   type: 'person',            enabled: true, repeat: 'perPerson', options: { role: 'design' } },
    { id: 'design_next',     type: 'division_next',     enabled: true, options: { division: 'design' } },
    { id: 'sec_video',       type: 'section',           enabled: true, options: { number: '02', title: 'Video', subtitle: '', division: 'video' } },
    { id: 'video_overview',  type: 'division_overview', enabled: true, options: { division: 'video' } },
    { id: 'person_video',    type: 'person',            enabled: true, repeat: 'perPerson', options: { role: 'video' } },
    { id: 'video_next',      type: 'division_next',     enabled: true, options: { division: 'video' } },
    { id: 'sec_tv',          type: 'section',           enabled: true, options: { number: '03', title: 'TV & Special Productions', subtitle: '', division: 'tv' } },
    { id: 'tv_overview',     type: 'division_overview', enabled: true, options: { division: 'tv' } },
    { id: 'productions',     type: 'production',        enabled: true, repeat: 'perProduction', options: {} },
    { id: 'tv_next',         type: 'division_next',     enabled: true, options: { division: 'tv' } },
    { id: 'cp_updates',      type: 'cp_updates',        enabled: true, options: {} },
    { id: 'studio_stats',    type: 'studio_stats',      enabled: true, options: {} },
  ],
};

const DEFAULTS = {
  boards: {
    video: {
      board_id: '5433027071',
      label: 'Video',
      columns: {
        person: 'people', status: 'status', type: 'label4', department: 'label', product: 'label9',
        frame: 'link', dropbox: 'link4__1', project_link: 'link1__1', timeline: 'timeline3__1',
        deadline: 'date_Mjj2cG7T', versions: 'numbers', working_time: 'duration_mkynps36',
        campaign: 'dropdown_mm3n9vjc', platform: 'single_selectu06tevn', concept: 'long_text_mkn8c1ax',
        hook: 'short_text_mkn8n4bx', finished_files: 'numeric_mm321027', files: 'files', requested_by: 'person',
      },
      statuses: {
        delivered: ['Approved', 'Completed', 'Upload Complete'],
        in_progress: ['Working'],
        review: ['Review', 'For Approval', 'Creative Approval', 'Marketing Approval'],
        fixes: ['Fixes Round'],
        stuck: ['Stuck'],
        paused: ['Paused'],
        queued: ['Pending', 'Ready for Assignment', 'Task Created'],
      },
    },
    design: {
      board_id: '8036329818',
      label: 'Design',
      columns: {
        person: 'people', status: 'status', product: 'label9', department: 'status_1__1',
        dropbox: 'link0__1', figma: 'link', files: 'upload_file3__1', timeline: 'timeline_1_Mjj5Yton',
        // Designers' timers live in "Time tracking" — the "Working Time" column (duration_mkynccfs) is unused
        deadline: 'date_Mjj20aki', versions: 'numberpuotbeaf', working_time: 'time_tracking__1',
        campaign: 'dropdown_mm3n7bw1', platform: 'single_selectrz7230p', concept: 'long_textpvqldjpg',
        brand: 'text_mkz3xf50', requested_by: 'people_Mjj2RrZM',
      },
      statuses: {
        delivered: ['Approved', 'Completed'],   // "Upload Complete" is deactivated on this board
        in_progress: ['Working', 'Freelance'],
        review: ['Quality Check', 'For Approval', 'Creative Approval'],
        fixes: ['Fixes Round'],
        stuck: ['Stuck'],
        paused: ['Paused'],
        queued: ['Pending', 'Ready For Assigment', 'Ready for Assignment', '-'],
      },
    },
  },
  // Studio: email tasks from Retention Projects 3.0 — only those designed by the studio's designers
  retention: {
    board_id: '9993980489',
    label: 'Email',
    designers: ['69272319', '75466488', '118504944'], // Dan Lowenstein, Natalie Abesdid, Kerry Bershtein
    columns: {
      designer: 'multiple_person_mkvptn73', status: 'status', deadline: 'date4', timeline: 'timerange_mkxtd2na',
      product: 'color_mkvkyncm', priority: 'color_mkvm6gzj', manager: 'person', amount: 'numeric_mkvk3t78',
      launch: 'date_mkxnnsx', link: 'link_mkvtf48w', completed: 'date_mkvp1wgb', created: 'date_mkvk4kk4',
    },
    statuses: {
      delivered: ['completed', 'Completed', 'Done'],
      in_progress: ['Design Stage'],
      review: ['Copy Review', 'Proofreading', 'Eikona Review', 'Design Review', 'Upload to Klaviyo'],
      queued: ['To Schedule', 'Brief'],
      paused: ['On Hold'],
    },
  },
  // AI ticket creator: real briefs to learn the house style from — [mondayUserId, examples per board, what they're good at]
  tickets: {
    style_authors: [
      ['101019167', 3, 'performance creative: hooks, scripts, ad copy'],           // Lilian Krumholz
      ['69149907', 2, 'production: assets, creative direction, specs, deliverables'], // Omer Barak
      ['60980766', 1, 'the why, references to follow / avoid, scope, who reviews'],  // Tomer Wilf Lezmy
    ],
  },
  // Tickets whose Monday Department (or video Type) matches go to the TV & Special Productions division
  divisions: {
    tv: { departments: ['TV', 'Special Project (SP)'], types: ['TV'] },
  },
  delivery_rule: { count_intra_delivered: false, exclude_reopened_in_week: true, treat_is_done_as_delivered: true },
  exclude: { products: [], groups: [] },
  capacity_per_day: { video: 3, design: 5 },
  // Creative Control flags non-TV tasks sitting in one status longer than this (workdays)
  stale_status: { working_days: 3, paused_days: 5 },
  // { mondayUserId: { role, display_name, hidden, order } } — Omer Ben Simon's Monday profile has no name yet
  team: { 119970319: { display_name: 'Omer Ben Simon', role: 'video' } },
  product_colors: {},  // { 'Face Cream': '#579bfc' } overrides
  auto_generate: { enabled: false, target: 'previous_week' },
  default_template: DEFAULT_TEMPLATE,
  frameio: { account_id: null, legacy_header: false },
};

function isPlainObject(v) { return v && typeof v === 'object' && !Array.isArray(v); }

function deepMerge(base, over) {
  if (!isPlainObject(over)) return base;
  const out = { ...base };
  for (const [k, v] of Object.entries(over)) {
    out[k] = isPlainObject(v) && isPlainObject(base?.[k]) ? deepMerge(base[k], v) : v;
  }
  return out;
}

async function getCreativeConfig(brandId = 'particle') {
  let stored = null;
  try {
    const { rows } = await db.query('SELECT creative_config FROM settings WHERE brand_id = $1', [brandId]);
    stored = rows[0]?.creative_config || null;
  } catch { stored = null; }
  const merged = deepMerge(DEFAULTS, stored || {});
  // Templates are replaced wholesale, never merged slide-by-slide; outdated saved templates are ignored
  merged.default_template = stored?.default_template?.slides && (stored.default_template.version || 1) >= TEMPLATE_VERSION
    ? stored.default_template
    : DEFAULT_TEMPLATE;
  return merged;
}

async function saveCreativeConfig(brandId, patch) {
  const current = await getCreativeConfig(brandId);
  const next = deepMerge(current, patch || {});
  if (patch?.default_template) next.default_template = patch.default_template;
  await db.query(
    `INSERT INTO settings (brand_id, creative_config) VALUES ($1, $2)
     ON CONFLICT (brand_id) DO UPDATE SET creative_config = EXCLUDED.creative_config`,
    [brandId, JSON.stringify(next)]
  );
  return next;
}

/** Validate template shape; throws on bad input. */
function validateTemplate(tpl) {
  if (!isPlainObject(tpl) || !Array.isArray(tpl.slides)) throw new Error('template.slides must be an array');
  if (tpl.slides.length > 80) throw new Error('Too many slides (max 80)');
  const ids = new Set();
  for (const s of tpl.slides) {
    if (!isPlainObject(s) || typeof s.id !== 'string' || !s.id) throw new Error('Every slide needs a string id');
    if (ids.has(s.id)) throw new Error(`Duplicate slide id ${s.id}`);
    ids.add(s.id);
    if (!SLIDE_TYPES.includes(s.type)) throw new Error(`Unknown slide type ${s.type}`);
  }
  return true;
}

/** Check configured column ids / status labels against live board metadata. Returns warnings. */
async function validateConfig(config) {
  const warnings = [];
  for (const [key, b] of Object.entries(config.boards || {})) {
    let meta;
    try { meta = await boardMeta(b.board_id); } catch (e) {
      warnings.push(`${key}: board ${b.board_id} unavailable (${e.message})`);
      continue;
    }
    for (const [role, colId] of Object.entries(b.columns || {})) {
      if (colId && !meta.columns[colId]) warnings.push(`${key}: column "${role}" (${colId}) not found on board`);
    }
    const sm = meta.statusMaps[b.columns.status];
    if (sm) {
      for (const [cat, labels] of Object.entries(b.statuses || {})) {
        for (const l of labels) {
          const idx = sm.byLabel[normLabel(l)];
          if (idx == null) warnings.push(`${key}: status "${l}" (${cat}) not on board`);
          else if (sm.byIndex[idx]?.deactivated) warnings.push(`${key}: status "${l}" is deactivated on the board`);
        }
      }
    }
  }
  return warnings;
}

/** Division of a normalized item: 'tv' if its department/type matches the TV & SP rules, else its board. */
function divisionOf(item, config) {
  const tv = config?.divisions?.tv || {};
  const dept = normLabel(item.department?.label);
  const type = normLabel(item.type?.label);
  if ((tv.departments || []).some(d => normLabel(d) === dept) || (tv.types || []).some(t => normLabel(t) === type)) return 'tv';
  return item.board;
}

module.exports = {
  SLIDE_TYPES,
  TEMPLATE_VERSION,
  divisionOf,
  DEFAULT_TEMPLATE,
  DEFAULTS,
  deepMerge,
  getCreativeConfig,
  saveCreativeConfig,
  validateTemplate,
  validateConfig,
};
