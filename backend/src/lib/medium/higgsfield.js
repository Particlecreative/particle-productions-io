/**
 * MEDIUM × Higgsfield Ads Studio — story-film briefs (Tomer, 15 Nov 2026).
 *
 * "Higgsfield studio briefs: 40–60s realistic drama videos connected to our products, like a story. Update every day on
 *  what changes there; it creates briefs that say the editors should make it in Higgsfield Ads Studio. Realistic or
 *  cartoon — preferably realistic — with the product in it. Options for longer, up to 2 minutes."
 *
 * Every day (the worker's clock): read the Ads Studio catalog — story styles, story cards, Particle's products — over
 * CP's Higgsfield connection (reading is free: nothing is generated), note what changed since the last read, and queue
 * the day's drama briefs (new story cards first, mostly realistic styles, the top products by spend).
 * The brief itself is written by the normal Medium writer (house style, score, Captain) with the drama instructions
 * and the chosen card's recipe — and tells the editor, step by step, how to make the film in Ads Studio.
 */
const db = require('../../db');
const { enqueue } = require('../captain/queue');
const { getConfig, PRODUCTS } = require('./config');

// Live-action looks first; the rest are stylized (cartoon, clay, doll…). Singing ads aren't a drama.
const REALISTIC = /^(micro drama|cinematic story)$/i;
const NOT_A_DRAMA = /singing/i;
const LENGTHS = [40, 60, 90, 120];   // seconds — up to 60 by default, longer when asked (Tomer: "until 2m")
const CLIP_S = 15;                    // Ads Studio clips run ~15 s; a film is built from several

const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** Ads Studio product name → Medium's product name ("Particle Hair Thickening Shampoo" → "Thickening Shampoo") (pure — tested). */
function mediumProduct(name) {
  const n = fold(name);
  const hits = PRODUCTS.filter(p => n.includes(fold(p))).sort((a, b) => b.length - a.length);
  return hits[0] || String(name || '').replace(/^particle\s+/i, '').trim();
}

/** The catalog as Medium keeps it (pure — tested). raw = ads_studio_story_presets; products = ads_studio_list_products. */
function shapeCatalog(raw, { brand = null, products = [] } = {}) {
  const styles = (raw?.styles || []).filter(s => s?.id && !s.command && !NOT_A_DRAMA.test(s.title || ''))
    .map(s => ({ id: s.id, title: s.title, subtitle: s.subtitle || '', cover: s.cover || null, realistic: REALISTIC.test(s.title || '') }));
  const byId = new Map(styles.map(s => [s.id, s]));
  const cards = (raw?.cards || []).filter(c => c?.id && byId.has(c.style_id)).map(c => ({
    id: c.id, title: c.title, subtitle: c.subtitle || '', style_id: c.style_id, style: byId.get(c.style_id).title,
    realistic: byId.get(c.style_id).realistic, seconds: c.settings?.duration_seconds || null,
    poster: c.preview?.poster_url || null, video: c.preview?.video_url || null,
  }));
  return {
    styles, cards,
    brand: brand ? { id: brand.brand_id || brand.id, name: brand.name } : null,
    products: (products || []).map(p => ({ id: p.product_id || p.id, name: p.name, product: mediumProduct(p.name), price: p.price || null, images: p.images_count ?? null, ready: p.texts_ready !== false })),
  };
}

/** What changed between two reads (pure — tested). */
function diffCatalog(prev, next) {
  if (!prev?.cards) return { first: true, added_cards: [], removed_cards: [], added_styles: [], removed_styles: [], added_products: [], removed_products: [] };
  const ids = (list) => new Set((list || []).map(x => x.id));
  const pick = (list, other) => (list || []).filter(x => !other.has(x.id)).map(x => ({ id: x.id, title: x.title || x.name, ...(x.style ? { style: x.style } : {}) }));
  return {
    first: false,
    added_cards: pick(next.cards, ids(prev.cards)), removed_cards: pick(prev.cards, ids(next.cards)),
    added_styles: pick(next.styles, ids(prev.styles)), removed_styles: pick(prev.styles, ids(next.styles)),
    added_products: pick(next.products, ids(prev.products)), removed_products: pick(prev.products, ids(next.products)),
  };
}
const hasChanges = (d) => ['added_cards', 'removed_cards', 'added_styles', 'removed_styles', 'added_products', 'removed_products'].some(k => d?.[k]?.length);

/** How many ~15 s clips a film of this length is built from (pure). */
const clipsFor = (seconds) => Math.max(2, Math.round((Number(seconds) || 60) / CLIP_S));
/** A length Medium offers: 40 / 60 / 90 / 120 (pure). */
const lengthOf = (s) => LENGTHS.reduce((best, x) => (Math.abs(x - Number(s || 60)) < Math.abs(best - Number(s || 60)) ? x : best), 60);

/**
 * The day's briefs (pure — tested). Mostly realistic (realistic_share), new story cards first, then the ones used least;
 * products by last-30-day spend (else the Ads Studio list), spread so no product repeats before the others had a turn.
 * used: { card_id → times in the last 60 days }, productsUsed: { product → times in the last 14 days }.
 */
function pickDaily({ catalog, n = 1, realisticShare = 0.8, added = [], used = {}, productsUsed = {}, topProducts = [], dayIndex = 0, length = 60 }) {
  const cards = catalog?.cards || [];
  const products = (catalog?.products || []).filter(p => p.ready);
  if (!cards.length || !products.length || n < 1) return [];
  const order = (topProducts.length ? topProducts : products.map(p => p.product))
    .map(name => products.find(p => fold(p.product) === fold(name)))
    .filter(Boolean);
  for (const p of products) if (!order.includes(p)) order.push(p);
  const out = [];
  const usedNow = { ...used }, prodNow = { ...productsUsed };
  for (let i = 0; i < n; i++) {
    // realistic_share 1 → all realistic, 0 → all stylized, in between every 1-in-k is stylized (0.8 → every 5th)
    const k = Math.max(2, Math.round(1 / Math.max(0.01, 1 - realisticShare)));
    const stylized = realisticShare <= 0 ? true : realisticShare >= 1 ? false : (dayIndex * n + i + 1) % k === 0;
    const pool = cards.filter(c => c.realistic === !stylized);
    const fresh = pool.filter(c => added.includes(c.id) && !usedNow[c.id]);
    const card = (fresh.length ? fresh : [...pool].sort((a, b) => (usedNow[a.id] || 0) - (usedNow[b.id] || 0) || a.title.localeCompare(b.title)))[0]
      || cards[0];
    const product = [...order].sort((a, b) => (prodNow[a.product] || 0) - (prodNow[b.product] || 0))[0]
      || order[0];
    usedNow[card.id] = (usedNow[card.id] || 0) + 1;
    prodNow[product.product] = (prodNow[product.product] || 0) + 1;
    out.push({ card, product, length, fresh: !!fresh.length });
  }
  return out;
}

// ── Higgsfield (over CP's connection — Settings → Integrations → Higgsfield) ──
const HF = () => require('../higgsfield');

async function readCatalog() {
  const hf = HF();
  if (!(await hf.isConnected())) throw Object.assign(new Error('Higgsfield isn’t connected — Settings → Integrations → Higgsfield'), { code: 'HF_NOT_CONNECTED' });
  const session = await hf.openSession();
  const raw = await hf.callTool(session, 'ads_studio_story_presets', {});
  const brands = (await hf.callTool(session, 'ads_studio_list_brands', {}).catch(() => ({})))?.brands || [];
  const brand = brands.find(b => /particle/i.test(b.name || '')) || null;
  const products = brand ? ((await hf.callTool(session, 'ads_studio_list_products', { brand_id: brand.brand_id }).catch(() => ({})))?.products || []) : [];
  return shapeCatalog(raw, { brand, products });
}

/** The card's recipe (film prompt, screenplay, style) with our product — free, starts nothing. Trimmed for the writer. */
async function recipe(cardId, productId = null) {
  const hf = HF();
  const session = await hf.openSession();
  const r = await hf.callTool(session, 'ads_studio_story_recipe', { preset_id: cardId, ...(productId ? { product_id: productId } : {}) });
  const text = typeof r === 'string' ? r : r?.text || JSON.stringify(r);
  return text.replace(/https?:\/\/\S+/g, '').slice(0, 7000);
}

// ── state (settings.medium_config.higgsfield_state — written by the worker, not from the UI) ──
async function loadState() {
  const { rows } = await db.query(`SELECT medium_config->'higgsfield_state' AS s FROM settings WHERE brand_id = 'particle'`);
  return rows[0]?.s || {};
}
async function saveState(s) {
  await db.query(`UPDATE settings SET medium_config = jsonb_set(COALESCE(medium_config, '{}'::jsonb), '{higgsfield_state}', $1::jsonb, true) WHERE brand_id = 'particle'`, [JSON.stringify(s)]);
}

/** Read the catalog now and remember what changed (keeps the last 30 changes). */
async function refresh() {
  const prev = await loadState();
  try {
    const catalog = await readCatalog();
    const d = diffCatalog(prev.catalog, catalog);
    const changes = hasChanges(d) ? [{ at: new Date().toISOString(), ...d }, ...(prev.changes || [])].slice(0, 30) : (prev.changes || []);
    const next = { ...prev, catalog, read_at: new Date().toISOString(), error: null, changes };
    await saveState(next);
    return { cards: catalog.cards.length, styles: catalog.styles.length, products: catalog.products.length, changed: hasChanges(d), first: d.first, diff: d };
  } catch (e) {
    await saveState({ ...prev, error: e.message, tried_at: new Date().toISOString() });
    throw e;
  }
}

/** Queue drama briefs. items: [{ card, product, length }]. */
async function queue(items, { author = 'Medium', source = 'manual', note = null, batch = null } = {}) {
  const ids = [];
  const batchId = batch || (items.length > 1 ? `hf_${Date.now()}` : null);
  for (const it of items) {
    const len = lengthOf(it.length);
    const request = {
      lane: 'Particle', format: 'video', move: 'HIGGSFIELD_DRAMA', product: it.product.product, author, note, batch_id: batchId, autopilot: source === 'daily',
      source: `Higgsfield Ads Studio · ${it.card.style} · “${it.card.title}”${it.fresh ? ' (new in Ads Studio)' : ''}`,
      higgsfield: { card_id: it.card.id, card_title: it.card.title, card_subtitle: it.card.subtitle, card_seconds: it.card.seconds || null, style: it.card.style, realistic: it.card.realistic,
        product_id: it.product.id, product_name: it.product.name, length: len, clips: clipsFor(len) },
    };
    const { rows } = await db.query(`INSERT INTO medium_briefs (status, source, author, lane, product, format, move, request) VALUES ('QUEUED', $1, $2, 'Particle', $3, 'video', 'HIGGSFIELD_DRAMA', $4) RETURNING id`,
      [source === 'daily' ? 'autopilot' : 'generator', author, it.product.product, JSON.stringify(request)]);
    ids.push(rows[0].id);
    await enqueue('medium_generate', { brief_id: rows[0].id }, { dedupeKey: `medium_generate:${rows[0].id}`, priority: 6, maxAttempts: 1 });
  }
  return { queued: ids.length, ids };
}

async function usage() {
  const [cards, prods] = await Promise.all([
    db.query(`SELECT request->'higgsfield'->>'card_id' AS k, COUNT(*)::int AS n FROM medium_briefs WHERE move = 'HIGGSFIELD_DRAMA' AND created_at > NOW() - INTERVAL '60 days' AND status NOT IN ('ERROR') GROUP BY 1`),
    db.query(`SELECT product AS k, COUNT(*)::int AS n FROM medium_briefs WHERE move = 'HIGGSFIELD_DRAMA' AND created_at > NOW() - INTERVAL '14 days' AND status NOT IN ('ERROR') GROUP BY 1`),
  ]);
  return { used: Object.fromEntries(cards.rows.map(r => [r.k, r.n])), productsUsed: Object.fromEntries(prods.rows.map(r => [r.k, r.n])) };
}

/** The day's run: read the catalog, then queue today's briefs when switched on. */
async function daily({ now = new Date() } = {}) {
  const cfg = await getConfig();
  const h = cfg.higgsfield || {};
  const out = { refreshed: await refresh().catch(e => ({ error: e.message })) };
  if (!h.enabled || out.refreshed.error) return out;
  const st = await loadState();
  const added = (st.changes || []).filter(c => Date.now() - new Date(c.at).getTime() < 7 * 86400000).flatMap(c => (c.added_cards || []).map(x => x.id));
  const top = await require('./ranks').monthProducts().then(list => (list || []).map(p => p.product)).catch(() => []);
  const dayIndex = Math.floor(now.getTime() / 86400000);
  const items = pickDaily({ catalog: st.catalog, n: Math.min(5, Math.max(1, Number(h.per_day) || 1)), realisticShare: Number(h.realistic_share ?? 0.8), added, ...(await usage()), topProducts: top, dayIndex, length: lengthOf(h.length || 60) });
  out.queued = items.length ? await queue(items, { author: 'Medium (daily Higgsfield brief)', source: 'daily' }) : { queued: 0, reason: 'no catalog or products' };
  return out;
}

/** For the screen: the catalog, what changed, and the switch. */
async function overview() {
  const [cfg, st, connected] = await Promise.all([getConfig(), loadState(), HF().isConnected().catch(() => false)]);
  return { connected, settings: cfg.higgsfield || {}, lengths: LENGTHS, catalog: st.catalog || null, read_at: st.read_at || null, error: st.error || null, changes: (st.changes || []).slice(0, 10) };
}

module.exports = { readCatalog, recipe, refresh, queue, daily, overview, pickDaily, shapeCatalog, diffCatalog, hasChanges, mediumProduct, clipsFor, lengthOf, LENGTHS, REALISTIC };
