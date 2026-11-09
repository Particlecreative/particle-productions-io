/**
 * Captain Caption settings: code defaults deep-merged with settings.captain_config (editable in HQ → Settings).
 *
 * Board facts verified against the live boards on 2026-11-09:
 *   - Video "Review" / Design "Quality Check" = first check; "For Approval" = second check (there is no "In Review").
 *   - The `link` column is Frame.io on the Video board and Figma on the Design board (same id, different service).
 *   - Design board departments are named differently (Marketing, Email…) and it has no Type column.
 */
const db = require('../../db');

const BOARDS = {
  video: {
    board_id: '5433027071',
    service: 'frameio',
    columns: {
      status: 'status', department: 'label', type: 'label4', link: 'link', dropbox: 'link4__1', product: 'label9',
      person: 'people', campaign: 'dropdown_mm3n9vjc', platform: 'single_selectu06tevn',
      hook: 'short_text_mkn8n4bx', concept: 'long_text_mkn8c1ax', script: 'long_text_Mjj2uK4g',
      versions: 'numbers', sizes: 'multi_select_Mjj2VFZH',
    },
  },
  design: {
    board_id: '8036329818',
    service: 'figma',
    columns: {
      status: 'status', department: 'status_1__1', type: null, link: 'link', dropbox: 'link0__1', product: 'label9',
      person: 'people', campaign: 'dropdown_mm3n7bw1', platform: 'single_selectrz7230p',
      concept: 'long_textpvqldjpg', supporting_text: 'long_text_mkngjytf', versions: 'numberpuotbeaf',
      sizes: 'multi_select_Mjj2tEdu', other_sizes: 'short_text_Mjj2RnHq',
    },
  },
};

const DEFAULTS = {
  triggers: {
    video:  { first: ['Review'],        second: ['For Approval'] },
    design: { first: ['Quality Check'], second: ['For Approval'] },
  },
  // Later rounds keep being checked until the item reaches one of these (cut-downs are made after "Approved")
  done_statuses: ['Completed', 'Upload Complete'],
  scope: {
    video_departments:  ['Marketing/Media', 'Socials', 'Website', 'Retention'],
    design_departments: ['Marketing', 'Socials', 'Website', 'Email'],
    title_keywords: ['Meta'],
    tv_departments: ['TV'],
    tv_types: ['TV'],
  },
  auto_versions: { video: true, design: true },
  engines: {
    video:  { engine: 'gemini', model: 'gemini-3.8-flash' },
    design: { engine: 'claude', model: 'claude-sonnet-5-5' },
  },
  second_opinion: { video: false, design: false },
  max_reference_images: 4,
  insights: true,
  // Posting switch. 'test' = comments/updates only on the allow-listed test folder, Figma file and Monday items.
  posting: {
    mode: 'test',                                            // off | test | live
    test_frameio_folders: ['d2acf872-68a9-43bd-a0d4-81c64e6771b1'],   // Video › 2026 › 11_November › Not a Product Task › Captain Caption Test
    test_figma_files: ['qTzVZh3p4cEXc6OiK24sUY'],                     // "Captain Test"
    test_monday_items: [],
  },
  worker: { concurrency: 1 },
};

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
function merge(base, over) {
  if (!isObj(over)) return base;
  const out = { ...base };
  for (const [k, v] of Object.entries(over)) out[k] = isObj(v) && isObj(base[k]) ? merge(base[k], v) : v;
  return out;
}

async function getConfig(brandId = 'particle') {
  const { rows } = await db.query('SELECT captain_config FROM settings WHERE brand_id = $1', [brandId]).catch(() => ({ rows: [] }));
  const saved = rows[0]?.captain_config;
  return merge(DEFAULTS, typeof saved === 'string' ? JSON.parse(saved) : saved);
}

const EDITABLE = ['triggers', 'done_statuses', 'scope', 'auto_versions', 'engines', 'second_opinion', 'max_reference_images', 'insights', 'posting', 'worker'];
async function saveConfig(patch, brandId = 'particle') {
  const clean = Object.fromEntries(Object.entries(patch || {}).filter(([k]) => EDITABLE.includes(k)));
  const { rows } = await db.query('SELECT captain_config FROM settings WHERE brand_id = $1', [brandId]);
  const current = rows[0]?.captain_config || {};
  const next = merge(typeof current === 'string' ? JSON.parse(current) : current, clean);
  if (next.posting && !['off', 'test', 'live'].includes(next.posting.mode)) throw Object.assign(new Error('posting.mode must be off, test or live'), { status: 400 });
  await db.query('UPDATE settings SET captain_config = $1 WHERE brand_id = $2', [JSON.stringify(next), brandId]);
  return getConfig(brandId);
}

const boardFor = (discipline) => BOARDS[discipline];
const disciplineOfBoard = (boardId) => Object.keys(BOARDS).find(k => BOARDS[k].board_id === String(boardId)) || null;

module.exports = { BOARDS, DEFAULTS, getConfig, saveConfig, boardFor, disciplineOfBoard, merge };
