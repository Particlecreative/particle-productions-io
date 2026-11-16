// MEDIUM — customer data: on-site surveys (PFM Surveys) and who's buying (OuterSignal).   cd backend && node --test test/mediumCustomerData.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../src/lib/medium/surveys');
const B = require('../src/lib/medium/buyerSignal');
const M = require('../src/lib/medium/monday');

const PRODUCTS = ['Face Cream', 'Instant Eye Firming Cream', 'Neck Cream', 'Hand Cream', 'Anti-Gray Serum', 'Gravité', 'Face Wash'];

test('which product a survey is about — full name or initials, longest wins', () => {
  assert.equal(S.productOf('FC LP | Skin concerns', PRODUCTS), 'Face Cream');
  assert.equal(S.productOf('IEFC — what bothers you', PRODUCTS), 'Instant Eye Firming Cream');
  assert.equal(S.productOf('AGS post purchase', PRODUCTS), 'Anti-Gray Serum');
  assert.equal(S.productOf('Gravite LP | Scent', PRODUCTS), 'Gravité');
  assert.equal(S.productOf('Neck Cream checkout', PRODUCTS), 'Neck Cream');
  assert.equal(S.productOf('Homepage exit intent', PRODUCTS), null);
});

test('written answers are kept without emails or phone numbers', () => {
  assert.equal(S.scrub('Email me at john.doe@gmail.com or call +1 (414) 555-0199 please'), 'Email me at [email] or call [number] please');
});

test('a survey as plain lines for the writer — only questions with enough answers', () => {
  const t = S.surveyText({ name: 'FC LP | Skin concerns', product: 'Face Cream', active: true, responses: 1240, last_answer_at: '2026-11-16T10:00:00Z', questions: [
    { text: 'What bothers you most about your skin?', total: 1240, bars: [{ label: 'Dark circles', pct: 34.2 }, { label: 'Wrinkles', pct: 28 }] },
    { text: 'Anything else?', total: 4, bars: [], verbatims: [{ text: 'too few to count' }] },
    { text: 'What almost stopped you?', total: 388, bars: [], phrases: [{ phrase: 'price', count: 40 }], verbatims: [{ text: 'I didn’t think a cream would work' }] },
  ] });
  assert.match(t, /^Survey “FC LP \| Skin concerns” \(Face Cream\), running now — 1,240 answers, latest 2026-11-16:/);
  assert.match(t, /Q “What bothers you most about your skin\?” \(1240 answers\): Dark circles 34% · Wrinkles 28%/);
  assert.doesNotMatch(t, /too few to count/);
  assert.match(t, /words they use most: price/);
  assert.match(t, /“I didn’t think a cream would work”/);
});

test('the Monday update says which customer data the brief stands on', () => {
  const b = { format: 'design', product: 'Neck Cream', request: {}, fields: { brief: 'x' }, evidence: { items: [
    { claim: '28% of 1,240 Face Cream visitors said wrinkles bother them most', source: 'Survey' },
    { claim: 'Silver Leisure Seekers +1.9 pts', source: 'OuterSignal' },
    { claim: 'a winner', source: 'Upspring' },
  ] } };
  const html = M.briefHtml(b, 'Tomer');
  assert.match(html, /<p><strong>From our customer data<\/strong><\/p><ul><li>28% of 1,240 Face Cream visitors said wrinkles bother them most <em>\(Survey\)<\/em><\/li><li>Silver Leisure Seekers \+1\.9 pts <em>\(OuterSignal\)<\/em><\/li><\/ul>/);
  assert.doesNotMatch(html, /a winner/);
  assert.doesNotMatch(M.briefHtml({ ...b, evidence: { items: [] } }, 'Tomer'), /customer data/);
});

test("OuterSignal's week as plain lines — personas, movement, trending, the notable mix", () => {
  const t = B.signalText({ week_from: '2026-11-09', week_to: '2026-11-16', notable_total: 521, types: [{ type: 'Industry Experts', count: 226 }],
    personas: [{ name: 'Corporate Commander', share_pct: 42.6, change_pts: -4 }, { name: 'Silver Leisure Seeker', share_pct: 8.8, change_pts: 1.9 }],
    trending: [{ product: 'Particle Gravité', persona: 'Distinguished Professional', share_pct: 10.1, prior_share_pct: 4.7, units: 216, prior_units_per_week: 104 }] });
  assert.match(t, /\(2026-11-09 → 2026-11-16\)/);
  assert.match(t, /Corporate Commander 42\.6% \(−4 pts\) · Silver Leisure Seeker 8\.8% \(\+1\.9 pts\)/);
  assert.match(t, /Trending: Particle Gravité with Distinguished Professional — 10\.1% of what they bought, up from 4\.7% \(216 units vs 104\/week before\)/);
  assert.match(t, /Notable buyers this week: 521 — Industry Experts 226/);
  assert.equal(B.signalText(null), null);
});

test('connecting needs a real-looking key', async () => {
  await assert.rejects(S.connect('hello'), /doesn’t look like a PFM Surveys key/);
});
