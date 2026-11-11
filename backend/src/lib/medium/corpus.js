/**
 * MEDIUM — the house-style corpus: every ticket the corpus requester (Lilian) wrote on the Video and Design boards,
 * read from Monday (read-only), classified, and stored in medium_exemplars. Test brands and thin briefs are kept but
 * excluded, so the counts stay honest. Runs on the captain-worker (job "medium_ingest").
 */
const db = require('../../db');
const { mondayQuery } = require('../monday');
const { BOARDS, getConfig, seed } = require('./config');
const { classifyTicket } = require('./classify');

const PAGE = 100;
const colText = (cv) => (cv?.text ?? '').trim() || null;

async function requesterIds(names) {
  const ids = [];
  for (const n of names || []) {
    const d = await mondayQuery('query ($n: String) { users(name: $n) { id name } }', { n });
    const hit = (d?.users || []).find(u => u.name.toLowerCase() === n.toLowerCase()) || d?.users?.[0];
    if (hit) ids.push(hit.id);
  }
  return ids;
}

function itemFields(cols) {
  const ids = [...new Set(Object.values(cols))].map(c => `"${c}"`).join(', ');
  return `id name created_at state column_values(ids: [${ids}]) { id text } updates(limit: 5) { text_body created_at }`;
}

/** All of the requesters' items on one board since `since`, page by page. */
async function* boardItems(format, ids, since) {
  const { board_id, columns } = BOARDS[format];
  const fields = itemFields(columns);
  const rules = `[{ column_id: "${columns.requester}", compare_value: ${JSON.stringify(ids.map(i => `person-${i}`))}, operator: any_of }, { column_id: "__creation_log__", compare_value: ["EXACT", "${since}"], operator: greater_than_or_equals }]`;
  let d = await mondayQuery(`query { boards(ids: [${board_id}]) { items_page(limit: ${PAGE}, query_params: { rules: ${rules} }) { cursor items { ${fields} } } } }`, {}, { timeoutMs: 60000 });
  let page = d?.boards?.[0]?.items_page;
  while (page) {
    for (const it of page.items || []) yield it;
    if (!page.cursor) break;
    d = await mondayQuery(`query ($c: String!) { next_items_page(limit: ${PAGE}, cursor: $c) { cursor items { ${fields} } } }`, { c: page.cursor }, { timeoutMs: 60000 });
    page = d?.next_items_page;
  }
}

/** A donor brand as the team writes it ("Seed", not "coffee seed extract"). */
function donorPattern(brand) {
  const esc = String(brand).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^A-Za-z])${esc}(?![A-Za-z])(?!\\s+([Ee]xtract|[Oo]ils?|[Bb]utter)\\b)`);
}

/** One Monday item → a medium_exemplars row (classified). */
function toRow(format, it, cfg) {
  const cols = BOARDS[format].columns;
  const by = Object.fromEntries((it.column_values || []).map(c => [c.id, c]));
  const get = (k) => (cols[k] ? colText(by[cols[k]]) : null);
  const first = [...(it.updates || [])].sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))[0];
  const t = {
    name: it.name, brief: get('brief'), script: get('script'), hook: get('hook'), copy: get('copy'), campaign: get('campaign'), product: get('product'),
    brandColumn: get('brand'), update: first?.text_body ? String(first.text_body).slice(0, 6000) : null,
  };
  const c = classifyTicket(t, cfg);
  return {
    board_id: BOARDS[format].board_id, item_id: String(it.id), format, name: it.name, requester: get('requester'), monday_created: it.created_at,
    product: t.product, campaign: t.campaign, type: get('type'), ratios: get('ratio'), kind: c.kind, lane: c.lane, template: c.template, persona: c.persona,
    tool_tokens: c.tool_tokens, brief: t.brief, script: t.script, hook: t.hook, copy: t.copy, first_update: t.update, excluded: c.excluded, exclude_reason: c.exclude_reason,
  };
}

const COLS = ['board_id', 'item_id', 'format', 'name', 'requester', 'monday_created', 'product', 'campaign', 'type', 'ratios', 'kind', 'lane', 'template', 'persona',
  'tool_tokens', 'brief', 'script', 'hook', 'copy', 'first_update', 'excluded', 'exclude_reason'];
async function upsert(row) {
  await db.query(
    `INSERT INTO medium_exemplars (${COLS.join(', ')}, ingested_at) VALUES (${COLS.map((_, i) => `$${i + 1}`).join(', ')}, NOW())
     ON CONFLICT (item_id) DO UPDATE SET ${COLS.filter(c => c !== 'item_id').map(c => `${c} = EXCLUDED.${c}`).join(', ')}, ingested_at = NOW()`,
    COLS.map(c => row[c]),
  );
}

async function ingestCorpus({ actor = null } = {}) {
  const cfg = await getConfig();
  await seed();
  const ids = await requesterIds(cfg.corpus.requesters);
  if (!ids.length) throw Object.assign(new Error(`Couldn't find ${cfg.corpus.requesters.join(', ')} on Monday`), { noRetry: true });
  const counts = { video: 0, design: 0, excluded: 0 };
  for (const format of ['video', 'design']) {
    for await (const it of boardItems(format, ids, cfg.corpus.since)) {
      if (it.state === 'deleted') continue;
      const row = toRow(format, it, cfg);
      await upsert(row);
      counts[format]++;
      if (row.excluded) counts.excluded++;
    }
  }
  // how often each named template / donor shows up in the briefs Medium learns from
  await db.query(`UPDATE medium_templates t SET usage_count = x.n, last_used = x.last FROM (
      SELECT template, COUNT(*)::int AS n, MAX(monday_created) AS last FROM medium_exemplars WHERE NOT excluded AND template IS NOT NULL GROUP BY template) x
    WHERE x.template = t.name`);
  // magazine articles the team already sends ads to (seed for medium_articles — a lane brief must point at one, §5.5)
  const { rows: lanesRows } = await db.query(`SELECT lane, product, monday_created, coalesce(brief, '') || ' ' || coalesce(first_update, '') AS t FROM medium_exemplars WHERE NOT excluded AND lane <> 'Particle'`);
  for (const a of articlesFrom(lanesRows)) {
    await db.query(
      `INSERT INTO medium_articles (lane, url, title, products, last_seen) VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (url) DO UPDATE SET products = (SELECT ARRAY(SELECT DISTINCT unnest(medium_articles.products || EXCLUDED.products))), last_seen = GREATEST(medium_articles.last_seen, EXCLUDED.last_seen)`,
      [a.lane, a.url, a.title, a.products, a.last_seen]);
  }
  // donors: the brand name as written (case-sensitive), so the ingredient "Coffee Seed Extract" is not the brand Seed
  const { rows: donors } = await db.query('SELECT id, brand FROM medium_donors');
  const { rows: texts } = await db.query(`SELECT coalesce(name, '') || ' ' || coalesce(brief, '') || ' ' || coalesce(first_update, '') || ' ' || coalesce(script, '') AS t FROM medium_exemplars WHERE NOT excluded`);
  for (const d of donors) {
    const re = donorPattern(d.brand);
    await db.query('UPDATE medium_donors SET usage_count = $2 WHERE id = $1', [d.id, texts.filter(x => re.test(x.t)).length]);
  }
  return { ...counts, by: actor };
}

/** Corpus mix for the "What it learns from" page. */
async function corpusStats() {
  const [total, mix, excl, last] = await Promise.all([
    db.query(`SELECT format, COUNT(*)::int AS n, COUNT(*) FILTER (WHERE NOT excluded)::int AS used FROM medium_exemplars GROUP BY format`),
    db.query(`SELECT format, kind, COUNT(*)::int AS n FROM medium_exemplars WHERE NOT excluded GROUP BY format, kind`),
    db.query(`SELECT exclude_reason AS reason, COUNT(*)::int AS n FROM medium_exemplars WHERE excluded GROUP BY exclude_reason ORDER BY n DESC`),
    db.query(`SELECT MAX(ingested_at) AS at, MIN(monday_created) AS first, MAX(monday_created) AS latest,
                     COUNT(*) FILTER (WHERE 'Claude' = ANY(tool_tokens) OR 'ChatGPT' = ANY(tool_tokens))::int AS ai_written,
                     COUNT(*) FILTER (WHERE winner)::int AS winners FROM medium_exemplars`),
  ]);
  const lanes = await db.query(`SELECT lane, format, COUNT(*)::int AS n FROM medium_exemplars WHERE NOT excluded GROUP BY lane, format`);
  return { formats: total.rows, mix: mix.rows, lanes: lanes.rows, excluded: excl.rows, ...last.rows[0] };
}

/**
 * Three examples for a brief: same kind and lane first, then the nearest product or template, winners first once
 * AfterLife outcomes are joined (never-ran briefs teach style only). Falls back to the same kind in any lane.
 */
async function pickExemplars({ format, kind, lane, product = null, template = null, n = 3, exclude = [] }) {
  const { rows } = await db.query(
    `SELECT id, item_id, name, format, kind, lane, product, template, persona, brief, script, hook, copy, first_update, winner
       FROM medium_exemplars
      WHERE NOT excluded AND format = $1 AND (kind = $2 OR $2 IS NULL) AND NOT (id = ANY($6::int[]))
        AND length(coalesce(brief, '') || coalesce(script, '') || coalesce(copy, '')) > 200
      ORDER BY (lane = $3) DESC, winner DESC NULLS LAST, (lower(product) = lower($4)) DESC NULLS LAST, (template = $5) DESC NULLS LAST, monday_created DESC
      LIMIT $7`,
    [format, kind || null, lane || 'Particle', product, template, exclude, n]);
  if (rows.length >= n || !kind) return rows;
  return [...rows, ...(await pickExemplars({ format, kind: null, lane, product, template, n: n - rows.length, exclude: [...exclude, ...rows.map(r => r.id)] }))];
}

/** Briefs that look like this idea (freeform "Overlap" findings, dedupe). */
async function similar(text, { limit = 5, format = null } = {}) {
  const words = (String(text || '').toLowerCase().match(/[\p{L}\p{N}]{4,}/gu) || []).filter(w => !STOP.has(w)).slice(0, 12);
  if (!words.length) return [];
  const { rows } = await db.query(
    `SELECT id, item_id, board_id, name, kind, lane, product, format, ts_rank(search, q) AS rank
       FROM medium_exemplars, to_tsquery('simple', $1) q
      WHERE NOT excluded AND search @@ q AND ($2::text IS NULL OR format = $2) ORDER BY rank DESC LIMIT $3`,
    [words.join(' | '), format, limit]);
  return rows;
}
const STOP = new Set(['this', 'that', 'with', 'from', 'your', 'have', 'will', 'they', 'them', 'what', 'when', 'into', 'just', 'like', 'make', 'more', 'about', 'their', 'there', 'video', 'static', 'please', 'particle']);

/**
 * Article URLs in lane tickets ("Page: https://wearecolognes.com/…", "Ad leads to: …") → one row per article, with the
 * products it was used for and when it was last briefed. Pure — tested.
 */
const ARTICLE_DOMAINS = { 'scienceforyou.co': 'SFY', 'gentlemantoday.co': 'GT', 'wearecolognes.com': 'WAC' };
function articlesFrom(rows) {
  const out = new Map();
  for (const r of rows || []) {
    for (const m of String(r.t || '').matchAll(/https?:\/\/(?:www\.)?((?:scienceforyou\.co|gentlemantoday\.co|wearecolognes\.com)[^\s)"'<>]*)/gi)) {
      const url = `https://${m[1].replace(/[.,;:!?]+$/, '').replace(/\/$/, '')}`;
      const domain = Object.keys(ARTICLE_DOMAINS).find(d => url.includes(d));
      const slug = url.split('/').filter(Boolean).pop() || '';
      const title = slug && !slug.includes('.') ? slug.split('?')[0].replace(/[-_]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : null;
      const a = out.get(url) || { lane: ARTICLE_DOMAINS[domain], url, title, products: [], last_seen: null };
      if (r.product && !a.products.includes(r.product)) a.products.push(r.product);
      if (r.monday_created && (!a.last_seen || new Date(r.monday_created) > new Date(a.last_seen))) a.last_seen = r.monday_created;
      out.set(url, a);
    }
  }
  return [...out.values()];
}

module.exports = { ingestCorpus, corpusStats, pickExemplars, similar, toRow, donorPattern, articlesFrom };
