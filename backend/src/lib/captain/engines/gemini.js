/**
 * Gemini video QC — the video is uploaded to the Gemini Files API (video + audio, watched natively), checked with
 * the qc-video prompt, and deleted again. Tested 2026-11-09: gemini-3.8-flash / 3.1-pro both caught every real typo
 * in the RESELLERS hooks at ~16 s per minute of video with thinking 'low' and HIGH media resolution.
 * gemini-2.5-pro is closed to new API users.
 */
const fs = require('fs');

const G = 'https://generativelanguage.googleapis.com';
const headers = (extra = {}) => ({ 'x-goog-api-key': process.env.GEMINI_API_KEY, ...extra });
const configured = () => !!process.env.GEMINI_API_KEY;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// USD per 1M tokens — ESTIMATES for the cost column; check Google's price page and adjust in Settings → prices.
const DEFAULT_PRICES = {
  'gemini-3.8-flash': { in: 0.5, out: 3 },
  'gemini-3.1-pro-preview': { in: 2, out: 12 },
  'gemini-3-flash-preview': { in: 0.5, out: 3 },
};

async function upload(path, displayName, mime = 'video/mp4') {
  const size = fs.statSync(path).size;
  const init = await fetch(`${G}/upload/v1beta/files`, {
    method: 'POST',
    headers: headers({ 'X-Goog-Upload-Protocol': 'resumable', 'X-Goog-Upload-Command': 'start', 'X-Goog-Upload-Header-Content-Length': String(size), 'X-Goog-Upload-Header-Content-Type': mime, 'Content-Type': 'application/json' }),
    body: JSON.stringify({ file: { display_name: String(displayName).slice(0, 120) } }),
  });
  const url = init.headers.get('x-goog-upload-url');
  if (!url) throw new Error(`Gemini upload start failed (${init.status}): ${(await init.text()).slice(0, 200)}`);
  const up = await fetch(url, { method: 'POST', headers: { 'X-Goog-Upload-Command': 'upload, finalize', 'X-Goog-Upload-Offset': '0', 'Content-Length': String(size) }, body: fs.readFileSync(path), signal: AbortSignal.timeout(300000) });
  const f = (await up.json())?.file;
  if (!f?.name) throw new Error('Gemini upload returned no file');
  for (let i = 0; i < 100 && f.state !== 'ACTIVE'; i++) {
    await sleep(3000);
    Object.assign(f, await (await fetch(`${G}/v1beta/${f.name}`, { headers: headers() })).json());
    if (f.state === 'FAILED') throw new Error('Gemini could not process the video');
  }
  if (f.state !== 'ACTIVE') throw new Error('Gemini took too long to process the video');
  return f;
}

async function remove(file) { await fetch(`${G}/v1beta/${file.name}`, { method: 'DELETE', headers: headers() }).catch(() => null); }

async function generate(model, file, prompt, extra) {
  const r = await fetch(`${G}/v1beta/models/${model}:generateContent`, {
    method: 'POST', headers: headers({ 'Content-Type': 'application/json' }), signal: AbortSignal.timeout(300000),
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ file_data: { mime_type: file.mimeType || 'video/mp4', file_uri: file.uri }, video_metadata: { fps: 2 } }, { text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json', temperature: 0, maxOutputTokens: 32768, ...extra },
    }),
  });
  const d = await r.json().catch(() => null);
  if (!r.ok) throw Object.assign(new Error(`Gemini ${r.status}: ${d?.error?.message?.slice(0, 300) || 'request failed'}`), { status: r.status });
  return d;
}

function parseJson(text) {
  try { return JSON.parse(text); } catch { /* try to salvage a fenced block */ }
  const m = String(text).match(/\{[\s\S]*\}/);
  if (m) { try { return JSON.parse(m[0]); } catch { /* give up */ } }
  return null;
}

/**
 * Check one video file. Returns { issues, on_screen_text, model, usage, ms, cost_usd, raw }.
 * Throws on API errors (the caller records the check as an error and says so on Monday).
 */
async function checkVideo({ path, name, prompt, model = 'gemini-3.8-flash', prices = {} }) {
  if (!configured()) throw new Error('GEMINI_API_KEY is not set on the server');
  const t0 = Date.now();
  const file = await upload(path, name);
  try {
    // Prefer capped thinking + sharp frames; fall back if a model rejects an option
    const variants = [{ thinkingConfig: { thinkingLevel: 'low' }, mediaResolution: 'MEDIA_RESOLUTION_HIGH' }, { thinkingConfig: { thinkingLevel: 'low' } }, {}];
    let d = null, lastErr = null, used = null;
    for (const v of variants) {
      try { d = await generate(model, file, prompt, v); used = v; break; } catch (e) { lastErr = e; if (e.status !== 400) throw e; }
    }
    if (!d) throw lastErr;
    const textOf = (x) => x?.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('') || '';
    let json = parseJson(textOf(d));
    if (!json) {
      // Long transcripts can come back cut off or malformed — one more try before giving up
      const first = d;
      d = await generate(model, file, prompt, used).catch(() => null) || first;
      json = parseJson(textOf(d));
      if (!json) throw new Error(`Gemini did not return valid JSON (finish: ${first.candidates?.[0]?.finishReason || '?'}, ${textOf(first).length} chars)`);
    }
    const u = d.usageMetadata || {};
    const p = prices[model] || DEFAULT_PRICES[model] || DEFAULT_PRICES['gemini-3.8-flash'];
    const outTokens = (u.candidatesTokenCount || 0) + (u.thoughtsTokenCount || 0);
    const cost = ((u.promptTokenCount || 0) * p.in + outTokens * p.out) / 1e6;
    return {
      issues: Array.isArray(json.issues) ? json.issues : [],
      on_screen_text: Array.isArray(json.on_screen_text) ? json.on_screen_text : [],
      voiceover: Array.isArray(json.voiceover) ? json.voiceover : [],
      model, usage: u, ms: Date.now() - t0, cost_usd: Number(cost.toFixed(5)), raw: json,
    };
  } finally {
    await remove(file);
  }
}

module.exports = { configured, checkVideo, DEFAULT_PRICES };
