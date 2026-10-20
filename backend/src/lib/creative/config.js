/**
 * Creative Weekly configuration: code defaults deep-merged with settings.creative_config.
 * Board/column ids verified live against Monday (Creative Studio workspace 8806493).
 */
const db = require('../../db');
const { boardMeta, normLabel } = require('../monday');

const SLIDE_TYPES = [
  'cover', 'exec_summary', 'kpis', 'highlights', 'by_product', 'by_type', 'section',
  'person', 'workload', 'cp_productions', 'cp_updates', 'planned_next', 'risks', 'custom', 'closing',
];

const DEFAULT_TEMPLATE = {
  version: 1,
  slides: [
    { id: 'cover',          type: 'cover',          enabled: true, options: {} },
    { id: 'exec_summary',   type: 'exec_summary',   enabled: true, options: {} },
    { id: 'kpis',           type: 'kpis',           enabled: true, options: {} },
    { id: 'highlights',     type: 'highlights',     enabled: true, options: { layout: 'hero+3' } },
    { id: 'sec_output',     type: 'section',        enabled: true, options: { number: '01', title: 'The Output', subtitle: 'What the studio shipped' } },
    { id: 'by_product',     type: 'by_product',     enabled: true, options: { limit: 10 } },
    { id: 'by_type',        type: 'by_type',        enabled: true, options: { dimension: 'type' } },
    { id: 'sec_team',       type: 'section',        enabled: true, options: { number: '02', title: 'The Team', subtitle: 'Who made what' } },
    { id: 'person_video',   type: 'person',         enabled: true, repeat: 'perPerson', options: { role: 'video', perPage: 8 } },
    { id: 'person_design',  type: 'person',         enabled: true, repeat: 'perPerson', options: { role: 'design', perPage: 8 } },
    { id: 'workload',       type: 'workload',       enabled: true, options: { variant: 'heatmap' } },
    { id: 'sec_prod',       type: 'section',        enabled: true, options: { number: '03', title: 'Productions', subtitle: 'From the CP weekly' } },
    { id: 'cp_productions', type: 'cp_productions', enabled: true, options: {} },
    { id: 'cp_updates',     type: 'cp_updates',     enabled: true, options: {} },
    { id: 'planned_next',   type: 'planned_next',   enabled: true, options: { groupBy: 'person' } },
    { id: 'risks',          type: 'risks',          enabled: true, options: { whenEmpty: 'celebrate' } },
    { id: 'closing',        type: 'closing',        enabled: true, options: {} },
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
  delivery_rule: { count_intra_delivered: false, exclude_reopened_in_week: true, treat_is_done_as_delivered: true },
  exclude: { products: [], groups: [] },
  capacity_per_day: { video: 3, design: 5 },
  team: {},            // { mondayUserId: { role, display_name, hidden, order } }
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
  // Templates are replaced wholesale, never merged slide-by-slide
  if (stored?.default_template?.slides) merged.default_template = stored.default_template;
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

module.exports = {
  SLIDE_TYPES,
  DEFAULT_TEMPLATE,
  DEFAULTS,
  deepMerge,
  getCreativeConfig,
  saveCreativeConfig,
  validateTemplate,
  validateConfig,
};
