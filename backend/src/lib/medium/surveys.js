/**
 * MEDIUM — what customers tell us in the on-site surveys (PFM Surveys, pfm-surveys.cloud — Tomer, 16 Nov 2026:
 * "we're running surveys to our customers, it updates daily. Connect it to Medium so he can use the answers in the
 * briefs smartly — and when you create briefs based on surveys, let us know the data").
 *
 *   connect(apiKey)  — the read-only API key (sites:read, surveys:read, responses:read), sealed in studio_settings
 *   sync()           — every survey → its questions → each question's summary (answers + %, responses, impressions)
 *                      and, for written answers, the newest verbatims (emails / phone numbers scrubbed). Daily, 04:00.
 *   surveyBlock()    — the surveys that matter for one brief (its product first, then the biggest general ones),
 *                      for the writer; the same data is kept on the brief (evidence.surveys) so the team sees it.
 * Only aggregates and anonymous answer text are stored — never session ids, cities or devices.
 */
const db = require('../../db');
const secrets = require('../studio/secrets');

const BASE = 'https://pfm-surveys.cloud/api/v1';
const SECRET = 'pfm_surveys';
const MIN_ANSWERS = 15;          // a question needs this many answers before Medium leans on it

let ready = null;
function ensureTable() {
  if (!ready) {
    ready = db.query(`CREATE TABLE IF NOT EXISTS medium_surveys (
        id TEXT PRIMARY KEY, site_name TEXT, name TEXT NOT NULL, type TEXT, active BOOLEAN, product TEXT,
        questions JSONB NOT NULL DEFAULT '[]', responses INT NOT NULL DEFAULT 0, impressions INT, last_answer_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ, synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`).catch(e => { ready = null; throw e; });
  }
  return ready;
}

async function key() { return (await secrets.getSecret(SECRET))?.api_key || process.env.PFM_SURVEYS_API_KEY || null; }

async function api(path, apiKey) {
  const r = await fetch(`${BASE}${path}`, { headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' }, signal: AbortSignal.timeout(30000) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(`PFM Surveys: ${d.message || d.error || r.status}`), { status: r.status === 401 || r.status === 403 ? 400 : 502 });
  return d;
}

/** Save the key after a test call (it must see the sites and the surveys). */
async function connect(apiKey, { user = null } = {}) {
  const k = String(apiKey || '').trim();
  if (!/^pfm_sk_[a-z]+_[A-Za-z0-9_-]{8,}$/.test(k)) throw Object.assign(new Error('That doesn’t look like a PFM Surveys key (pfm_sk_live_…)'), { status: 400 });
  const sites = await api('/sites', k);
  const surveys = await api('/surveys?limit=1', k);
  await secrets.setSecret(SECRET, { api_key: k }, { user, meta: { sites: (sites.data || []).map(s => s.name), surveys: surveys.meta?.total ?? null } });
  return { sites: (sites.data || []).map(s => s.name), surveys: surveys.meta?.total ?? null };
}
const disconnect = () => secrets.clearSecret(SECRET);

// ── which product a survey is about ───────────────────────────────────────────
const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
/** "FC LP | Skin concerns" → Face Cream; "IEFC" → Instant Eye Firming Cream (pure — tested). */
function productOf(name, products) {
  const text = ` ${fold(name).replace(/[^a-z0-9]+/g, ' ')} `;
  let best = null, len = 0;
  for (const p of products || []) {
    const words = fold(p).replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter(Boolean);
    const initials = words.map(w => w[0]).join('');
    const tries = [words.join(' '), words.length > 1 && initials.length >= 2 ? initials : null].filter(Boolean);
    for (const t of tries) if (text.includes(` ${t} `) && t.length > len) { best = p; len = t.length; }
  }
  return best;
}

const scrub = (s) => String(s || '').replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, '[email]').replace(/\+?\d[\d\s().-]{7,}\d/g, '[number]').replace(/\s+/g, ' ').trim().slice(0, 240);

// ── sync ──────────────────────────────────────────────────────────────────────
async function sync({ products = null } = {}) {
  const k = await key();
  if (!k) return { skipped: 'not connected' };
  await ensureTable();
  const names = products || require('./config').PRODUCTS;
  const list = [];
  for (let page = 1; page <= 20; page++) {
    const d = await api(`/surveys?limit=100&page=${page}`, k);
    list.push(...(d.data || []));
    if (!d.meta || page >= d.meta.pages) break;
  }
  let questions = 0, answers = 0;
  for (const s of list) {
    try {
      const full = (await api(`/surveys/${encodeURIComponent(s.id)}`, k)).data || {};
      const qs = [];
      let impressions = null, lastAt = null;
      for (const q of (full.questions || []).sort((a, b) => a.order_index - b.order_index).slice(0, 8)) {
        const sum = (await api(`/surveys/${encodeURIComponent(s.id)}/responses/summary?question_id=${encodeURIComponent(q.id)}`, k)).data || {};
        impressions = Math.max(impressions || 0, sum.metrics?.impressions || 0) || impressions;
        const entry = {
          id: q.id, text: q.question_text, type: q.question_type, total: sum.total_responses || 0,
          bars: (sum.bars || []).slice(0, 12).map(b => ({ label: b.label, count: b.count, pct: b.percentage })),
          phrases: (sum.phrases || []).slice(0, 15),
          metrics: sum.metrics || null,
        };
        // written answers: keep the newest ones as verbatims (the words customers use)
        if (sum.is_text_question || q.question_type === 'text') {
          const r = await api(`/surveys/${encodeURIComponent(s.id)}/responses?question_id=${encodeURIComponent(q.id)}&limit=100`, k).catch(() => ({ data: [] }));
          const seen = new Set();
          entry.verbatims = (r.data || []).sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)))
            .map(x => ({ text: scrub(x.answer_text || x.display_label), at: String(x.timestamp || '').slice(0, 10) }))
            .filter(x => x.text.length >= 8 && !seen.has(x.text.toLowerCase()) && seen.add(x.text.toLowerCase())).slice(0, 25);
          if (r.data?.[0]?.timestamp) lastAt = [lastAt, r.data[0].timestamp].filter(Boolean).sort().pop();
        }
        qs.push(entry);
        questions++; answers += entry.total;
      }
      if (!lastAt && qs[0]?.total) {
        const r = await api(`/surveys/${encodeURIComponent(s.id)}/responses?limit=1`, k).catch(() => ({ data: [] }));
        lastAt = r.data?.[0]?.timestamp || null;
      }
      await db.query(`INSERT INTO medium_surveys (id, site_name, name, type, active, product, questions, responses, impressions, last_answer_at, created_at, synced_at)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW())
          ON CONFLICT (id) DO UPDATE SET site_name = EXCLUDED.site_name, name = EXCLUDED.name, type = EXCLUDED.type, active = EXCLUDED.active, product = EXCLUDED.product,
            questions = EXCLUDED.questions, responses = EXCLUDED.responses, impressions = EXCLUDED.impressions, last_answer_at = EXCLUDED.last_answer_at, synced_at = NOW()`,
        [s.id, s.site_name || full.site_name || null, s.name, s.type || null, !!s.active, productOf(s.name, names), JSON.stringify(qs),
          Math.max(0, ...qs.map(q => q.total)), impressions, lastAt, s.created_at || null]);
    } catch (e) { console.warn('[medium] survey', s.id, e.message); }
  }
  return { surveys: list.length, questions, answers };
}

// ── for the writer ────────────────────────────────────────────────────────────
const pct = (n) => `${Math.round(Number(n) || 0)}%`;
/** One survey as plain lines (pure — tested). */
function surveyText(s) {
  const lines = [`Survey “${s.name}”${s.product ? ` (${s.product})` : ''}${s.active ? ', running now' : ''} — ${s.responses.toLocaleString('en-US')} answers${s.last_answer_at ? `, latest ${String(s.last_answer_at).slice(0, 10)}` : ''}:`];
  for (const q of s.questions || []) {
    if ((q.total || 0) < MIN_ANSWERS) continue;
    if (q.bars?.length) lines.push(`  Q “${q.text}” (${q.total} answers): ${q.bars.slice(0, 5).map(b => `${b.label} ${pct(b.pct)}`).join(' · ')}`);
    else if (q.verbatims?.length || q.phrases?.length) {
      lines.push(`  Q “${q.text}” (${q.total} written answers)${q.phrases?.length ? ` — words they use most: ${q.phrases.slice(0, 8).map(p => p.phrase).join(', ')}` : ''}`);
      for (const v of (q.verbatims || []).slice(0, 4)) lines.push(`    “${v.text}”`);
    }
  }
  return lines.length > 1 ? lines.join('\n') : null;
}

/**
 * The surveys behind one brief: its product's surveys first (most answers), then the biggest general ones.
 * → { text, used: [{ id, name, product, responses, questions: [...] }] } (used is stored on the brief)
 */
async function surveyBlock({ product = null, limit = 4 } = {}) {
  await ensureTable().catch(() => null);
  const { rows } = await db.query(`SELECT id, name, product, active, responses, last_answer_at, questions FROM medium_surveys WHERE responses >= $1
      ORDER BY (lower(product) = lower($2)) DESC NULLS LAST, (product IS NULL) DESC, active DESC, responses DESC LIMIT 12`, [MIN_ANSWERS, product || '']).catch(() => ({ rows: [] }));
  const mine = rows.filter(r => product && r.product && r.product.toLowerCase() === String(product).toLowerCase());
  const general = rows.filter(r => !r.product);
  const pick = [...mine.slice(0, 3), ...general.slice(0, Math.max(1, limit - Math.min(3, mine.length)))].slice(0, limit);
  const parts = pick.map(surveyText).filter(Boolean);
  if (!parts.length) return { text: null, used: [] };
  const text = `What customers told us — Particle's on-site surveys (PFM Surveys, synced daily). Real answers from real visitors: use them to pick the pain point, the angle and the words. When the brief leans on a survey answer, add an evidence item with source "Survey" that names the survey, the question, the answer, its % and the number of answers (e.g. “34% of 1,240 Face Cream visitors said dark circles bother them most — FC LP survey”). Never invent a number that isn't here.\n${parts.join('\n')}`;
  return { text, used: pick.map(({ id, name, product: p, responses, last_answer_at, questions }) => ({ id, name, product: p, responses, last_answer_at,
    questions: (questions || []).filter(q => (q.total || 0) >= MIN_ANSWERS).map(q => ({ text: q.text, total: q.total, bars: (q.bars || []).slice(0, 6), verbatims: (q.verbatims || []).slice(0, 4) })) })) };
}

/** Sources card: connection + what's there. */
async function status() {
  const st = (await secrets.secretStatus().catch(() => ({})))[SECRET];
  await ensureTable().catch(() => null);
  const { rows } = await db.query(`SELECT id, name, product, active, responses, last_answer_at, synced_at, questions FROM medium_surveys ORDER BY active DESC, responses DESC LIMIT 60`).catch(() => ({ rows: [] }));
  return {
    connected: !!st || !!process.env.PFM_SURVEYS_API_KEY, set_at: st?.set_at || null, set_by: st?.set_by || null, sites: st?.meta?.sites || [],
    synced_at: rows.reduce((a, r) => (!a || r.synced_at > a ? r.synced_at : a), null),
    surveys: rows.map(r => ({ id: r.id, name: r.name, product: r.product, active: r.active, responses: r.responses, last_answer_at: r.last_answer_at,
      top: (r.questions || []).filter(q => q.total >= MIN_ANSWERS).slice(0, 2).map(q => ({ text: q.text, total: q.total, bars: (q.bars || []).slice(0, 4), verbatims: (q.verbatims || []).slice(0, 2) })) })),
  };
}

module.exports = { connect, disconnect, sync, surveyBlock, surveyText, productOf, status, scrub, MIN_ANSWERS };
