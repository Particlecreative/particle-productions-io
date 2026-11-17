/**
 * Campaign groups (Tomer, 17 Nov 2026): a layer above Monday's Campaign column. A ticket has one campaign; a campaign
 * belongs to one group — Higgsfield Cinematic, Images into Videos, Holidays & Sales… Groups live in CP
 * (studio_settings.config.campaign_groups — no Monday board setup, same rule as Lane). New campaigns sort themselves
 * by name; a campaign put in a group by hand stays there. The rules are pure and tested (test/studio/campaignGroups.test.js).
 */
const db = require('../../db');

// Order matters: the first group whose rule matches wins (Higgsfield before "… Videos" families, etc.)
const DEFAULT_GROUPS = [
  { key: 'higgsfield', name: 'Higgsfield Cinematic', icon: '🎬', color: '#7c3aed', about: 'AI story films the editor makes in Higgsfield — micro dramas and other cinematic concepts',
    match: /higgsfield|micro ?dramas?|cinematic/i },
  { key: 'img2video', name: 'Images into Videos', icon: '🖼️', color: '#0891b2', about: 'Stills brought to life (AI product videos, product motion) and winning statics turned into videos',
    match: /ai product videos?|product motion|stat(ic|ics) (to|into) videos?|images? (to|into) videos?|\bi2v\b/i },
  { key: 'holidays', name: 'Holidays & Sales', icon: '🎄', color: '#e2445c', about: 'Seasonal moments, sales and promos',
    match: /black friday|cyber monday|christmas|holiday|hanukkah|new year|father'?s day|mother'?s day|valentine|4th of july|fourth of july|independence|labor day|memorial day|thanksgiving|easter|halloween|prime day|flash sale|\bsale\b|\bdeal\b|particledeal|promo/i },
  { key: 'launches', name: 'Launches & Retail', icon: '🚀', color: '#ff7a1a', about: 'New products, new markets and retailers',
    match: /launch|\bcvs\b|ulta|amazon|walmart|target|retail|sephora/i },
  { key: 'faces', name: 'Faces & Partners', icon: '🗣️', color: '#00a36c', about: 'Talent, experts, creators and partnerships',
    match: /rocco|phil simms|jason neustadter|dermatologist|gym coach|authority figure|partnership|\bcreators?\b|ambassador|athlete/i },
  { key: 'tests', name: 'Tests & Other Brands', icon: '🧯', color: '#6b7280', about: 'Smoke tests and the sister brands',
    match: /smoke test|levitas|ashford|biomella|blurr/i },
  { key: 'concepts', name: 'Concept Families', icon: '🧪', color: '#0808f8', about: 'One idea across products — Skeptic, Proof-First, Wife Witness… (Lilian’s “… Videos / … Statics” sets) and Medium’s concepts',
    match: / (videos|statics)$|^medium /i },
];
const EVERGREEN = { key: 'evergreen', name: 'Evergreen', icon: '🌿', color: '#9aa1c7', about: 'Everything else — always-on concepts and one-offs' };

const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
const KEY_RE = /^[a-z0-9_-]{2,40}$/;

/** The groups in order (defaults + ones added in CP), without the regexes — what the browser needs. */
function groupsOf(cfg = {}) {
  const custom = (cfg.custom || []).filter(g => g && KEY_RE.test(g.key) && g.name);
  const renamed = cfg.renamed || {};
  return [...DEFAULT_GROUPS, ...custom, EVERGREEN].map(({ match, ...g }) => ({ ...g, name: renamed[g.key] || g.name }));
}

/** Which group a campaign is in: put there by hand, else the first rule that matches its name, else Evergreen. */
function groupOf(label, cfg = {}) {
  const known = new Set(groupsOf(cfg).map(g => g.key));
  const hand = (cfg.assign || {})[norm(label)];
  if (hand && known.has(hand)) return hand;
  return DEFAULT_GROUPS.find(g => g.match.test(String(label || '').trim()))?.key || EVERGREEN.key;
}

/** { groups, of: { "campaign label": groupKey } } for a list of campaign labels. */
function classify(labels, cfg = {}) {
  const of = {};
  for (const l of labels || []) if (l) of[l] = groupOf(l, cfg);
  return { groups: groupsOf(cfg), of };
}

async function getConfig(brandId = 'particle') {
  const { rows } = await db.query('SELECT config FROM studio_settings WHERE brand_id = $1', [brandId]).catch(() => ({ rows: [] }));
  const c = rows[0]?.config?.campaign_groups || {};
  return { assign: c.assign || {}, custom: c.custom || [], renamed: c.renamed || {} };
}

/**
 * One change at a time: { campaign, group } puts a campaign in a group (group null = back to the automatic rule);
 * { add: { name, icon?, color? } } adds a group; { rename: { key, name } } renames one.
 */
async function saveConfig(patch = {}, brandId = 'particle') {
  const cur = await getConfig(brandId);
  const next = { assign: { ...cur.assign }, custom: [...cur.custom], renamed: { ...cur.renamed } };
  const bad = (m) => Object.assign(new Error(m), { status: 400 });
  if (patch.campaign !== undefined) {
    const k = norm(patch.campaign);
    if (!k) throw bad('Which campaign?');
    if (patch.group == null || patch.group === '') delete next.assign[k];
    else if (!groupsOf(next).some(g => g.key === patch.group)) throw bad('Unknown group');
    else next.assign[k] = patch.group;
  }
  if (patch.add) {
    const name = String(patch.add.name || '').trim().slice(0, 60);
    if (!name) throw bad('Give the group a name');
    if (groupsOf(next).some(g => norm(g.name) === norm(name))) throw bad('There is already a group with that name');
    const key = `g_${name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 30) || Date.now().toString(36)}`;
    next.custom.push({ key, name, icon: String(patch.add.icon || '📁').slice(0, 4), color: /^#[0-9a-f]{6}$/i.test(patch.add.color || '') ? patch.add.color : '#4a55ff', about: String(patch.add.about || '').slice(0, 200) });
  }
  if (patch.rename) {
    const name = String(patch.rename.name || '').trim().slice(0, 60);
    if (!name || !groupsOf(next).some(g => g.key === patch.rename.key)) throw bad('Unknown group');
    next.renamed[patch.rename.key] = name;
  }
  await db.query(`INSERT INTO studio_settings (brand_id, config, updated_at) VALUES ($1, jsonb_build_object('campaign_groups', $2::jsonb), NOW())
    ON CONFLICT (brand_id) DO UPDATE SET config = studio_settings.config || jsonb_build_object('campaign_groups', $2::jsonb), updated_at = NOW()`, [brandId, JSON.stringify(next)]);
  return next;
}

module.exports = { DEFAULT_GROUPS, EVERGREEN, groupsOf, groupOf, classify, getConfig, saveConfig, norm };
