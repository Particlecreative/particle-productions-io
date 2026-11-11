// MEDIUM — pure-logic tests:  cd backend && node --test test/medium.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../src/lib/medium/classify');
const { styleCheck, composeBrief } = require('../src/lib/medium/style');
const calendar = require('../src/lib/medium/calendar');

test('corpus: the kind of job comes from the opening line', () => {
  assert.equal(C.kindOf({ brief: 'Please look at attached reference (IEFC derma sticker static), copy style, apply to Particle design.' }), 'reference_adaptation');
  assert.equal(C.kindOf({ brief: 'Copy the layout exactly, swap the product to Hand Cream, refresh the background tone for fall.' }), 'template_swap');
  assert.equal(C.kindOf({ name: 'Ab Firming Cream | Black Friday 2026 | Meta | Extra 30 GIF', brief: 'Turn the approved Extra 30 static into a GIF design' }), 'static_gif');
  assert.equal(C.kindOf({ brief: 'FOOTAGE: https://dropbox.com/x\nEDIT: Go through the raw footage…' }), 'creator_edit');
  assert.equal(C.kindOf({ name: 'IEFC | Meta | Hooks for Ticker Hook', brief: 'We need 3–4 additional hooks we will add to the existing videos here' }), 'new_hooks');
  assert.equal(C.kindOf({ name: 'Face Cream | Meta | Italian translation', brief: 'Translate the approved static' }), 'translation');
  assert.equal(C.kindOf({ brief: 'A 55–60 man at his bathroom mirror, getting ready. Real, not styled.' }), 'original');
  // the team's real variants
  assert.equal(C.kindOf({ brief: 'REFERENCE — REPLICATE: app.upspring.ai/public/intelligence/ad/4036 (DADFUEL). Copy the reference exactly: shot types…' }), 'reference_adaptation');
  assert.equal(C.kindOf({ brief: 'Copy the attached reference beat for beat (Smileactives, https://app.upspring.ai/…): unboxing top-down…' }), 'reference_adaptation');
  assert.equal(C.kindOf({ brief: 'Same concept as reference just for neck cream' }), 'reference_adaptation');
  assert.equal(C.kindOf({ brief: 'Black Friday extra static for Shampoo, 30% offer, built on the phone-notification layout (reference: https://…)' }), 'reference_adaptation');
  assert.equal(C.kindOf({ brief: 'Same layout and fall background as the set. Product: Gravité.' }), 'template_swap');
  assert.equal(C.kindOf({ brief: 'Take the existing July 4th lineup design (attached reference) and rework for Labor Day: swap headline block and code pill.' }), 'template_swap');
  assert.equal(C.kindOf({ brief: 'Please turn assets into motion 7-10 seconds, no CTA needed' }), 'static_gif');
});

test('corpus: donor brands as written, not the ingredient', () => {
  const { donorPattern } = require('../src/lib/medium/corpus');
  assert.equal(donorPattern('Seed').test('Strikethrough price like the Seed ad'), true);
  assert.equal(donorPattern('Seed').test('Hyaluronic Acid, Coffee Seed Extract, caffeine'), false);
  assert.equal(donorPattern('Seed').test('seedless'), false);
  assert.equal(donorPattern('Mars Men').test('Mars Men multi-product layout'), true);
});

test('corpus: test brands are excluded — the campaign token beats a Particle product label', () => {
  assert.equal(C.testBrandOf({ name: 'Face Cream | Levitas 1.0 | Meta | Face Map', product: 'Face Cream' }), 'Levitas');
  assert.equal(C.testBrandOf({ name: 'Test Product | Ashford | Meta | Would You Date Him' }), 'Ashford');
  assert.equal(C.testBrandOf({ name: 'Joint support static', product: 'Bone & Joint' }), 'Ashford');
  assert.equal(C.testBrandOf({ name: 'Test Product | NeoRoot Launch | Meta | Comparison Series', product: 'Test Product' }), null);   // "Test Product" is not a brand signal
  assert.equal(C.testBrandOf({ name: 'x', brandColumn: 'Biomella' }), 'Biomella');
  assert.equal(C.testBrandOf({ name: 'x', brandColumn: 'Particle' }), null);
});

test('corpus: thin briefs, templates, personas, tool tokens, lanes', () => {
  assert.equal(C.isThin({ brief: 'tbd' }), true);
  assert.equal(C.isThin({ brief: 'see reference' }), true);
  assert.equal(C.isThin({ brief: 'https://dropbox.com/very/long/link/to/a/file/that/is/not/a/brief.png' }), true);
  assert.equal(C.isThin({ brief: 'A 55–60 man at his bathroom mirror, getting ready. Real, not styled. He is heading to a family event.' }), false);
  assert.equal(C.templateOf('Face Cream | Fall Flash Sale | Meta | Fall Flash Sale Static, Receipt Vertical, Face Cream'), 'Receipt Vertical');
  assert.equal(C.personaOf('Test Product | NeoRoot Launch | Meta | Comparison Series | 4 Executions - Younger'), 'Younger');
  assert.deepEqual(C.toolTokensOf('Gravité | Meta | Claude | Gravité Meta His Side'), ['Claude']);
  const c = C.classifyTicket({ name: 'Face Cream | Science For You | Meta | Understand the Why', brief: 'Ad leads to: https://scienceforyou.co/x\nA 55–65 man at the mirror, real not styled, native iPhone look. Fast 2s beats, five warning signs.' });
  assert.equal(c.lane, 'SFY');
  assert.equal(c.excluded, false);
});

const videoBrief = {
  format: 'video', kind: 'original', move: 'NEW_ANGLE', lane: 'Particle',
  fields: {
    brief: 'A 55–60 man at his bathroom mirror, getting ready. Real, not styled. Kizik structure carries it. Vertical 9:16, 30s. Reference attached.',
    script: '0–4s — THE HOOK\nSCRIPT: "Honestly — this is the fastest fix I could find."\nVISUALS: He holds the tube up.\n4–10s — THE CONTEXT\nSCRIPT: "…"\nVISUALS: …\nVO style: Conversational male, first person, native UGC.',
    why: 'Iterates the IEFC ticker winner [AfterLife]; the hook is the weak link.', test: 'Hook only — 3 versions, same body. Win = hook rate above 30% at $1k spend.',
    donts: ['no music'], hook: '"Honestly — this is the fastest fix I could find."',
  },
};

test('style: a house-style video brief passes', () => {
  assert.deepEqual(styleCheck(videoBrief), { passed: true, failures: [] });
});

test('style: each house rule fails on its own', () => {
  const f = (patch, opts) => styleCheck({ ...videoBrief, ...patch, fields: { ...videoBrief.fields, ...(patch.fields || {}) } }, opts).failures.join(' | ');
  assert.match(f({ fields: { brief: 'This ad shows a man using the cream. 9:16.' } }), /Opening/);
  assert.match(f({ fields: { script: 'He talks to camera and then shows the tube.' } }), /time-coded/);
  assert.match(f({ fields: { script: '0–4s — THE HOOK\nSCRIPT: "Hi"\nVISUALS: x\n4–8s\nSCRIPT: "Yo"\nVISUALS: y' } }), /VO style/);
  assert.match(f({ fields: { donts: [] } }), /Don’ts/);
  assert.match(f({ fields: { brief: `${videoBrief.fields.brief} I want this to feel luxurious.` } }), /first-person/);
  assert.match(f({ fields: { why: '' } }), /Why/);
  assert.match(f({ fields: { brief: `${videoBrief.fields.brief} Sizes 4x5 and 9x16.` } }), /house notation/);
  assert.match(f({ lane: 'SFY' }, { laneFirst: 'Ad leads to:' }), /first line must be “Ad leads to:/);
  const sfy = styleCheck({ ...videoBrief, lane: 'SFY', fields: { ...videoBrief.fields, brief: `Ad leads to: https://scienceforyou.co/neck\n${videoBrief.fields.brief}` } }, { laneFirst: 'Ad leads to:' });
  assert.equal(sfy.passed, true);
});

test('style: design copy must be labelled per element, in versions', () => {
  const d = {
    format: 'design', kind: 'reference_adaptation', move: 'REFRESH', lane: 'Particle',
    fields: { brief: 'Please look at attached reference (the "Respect Your Face" split-face static), copy style, apply to Particle design.\nSizes 4×5 · 1×1 · 9×16.', why: 'x', test: 'y', donts: ['no badges'],
      copy: 'On all versions: USE CODE XMAS30\n\nV1\nHeadline: Your neck ages first.\nCTA button: Shop Now\n\nV2\nHeadline: Nobody treats their neck.' },
  };
  assert.equal(styleCheck(d).passed, true);
  assert.match(styleCheck({ ...d, fields: { ...d.fields, copy: 'Your neck ages first. Shop now.' } }).failures.join(' | '), /versions.*\|.*Label/);
  assert.equal(composeBrief({ ...d.fields }).split('\n\n')[1], 'Why: x');
  assert.match(composeBrief(d.fields), /Don't:?s?:\n- no badges\n\nTest: y$/);
});

test('calendar: US sale holidays and brief-by dates', () => {
  const h = Object.fromEntries(calendar.holidaysOf(2026).map(x => [x.name, x.date.toISOString().slice(0, 10)]));
  assert.equal(h['Memorial Day'], '2026-05-25');
  assert.equal(h['Labor Day'], '2026-09-07');
  assert.equal(h["Father's Day"], '2026-06-21');
  assert.equal(h['Black Friday'], '2026-11-27');
  const up = calendar.upcoming(new Date('2026-11-11T09:00:00Z'), 3);
  assert.deepEqual(up.map(x => x.name), ['Black Friday 2026', 'Christmas 2026', "Valentine's Day 2027"]);
  assert.equal(up[1].brief_by, '2026-12-04');
  assert.equal(up[1].days_to_brief_by, 23);
});

test('writer: kinds per move, lane first lines, output cleaning', () => {
  const W = require('../src/lib/medium/writer');
  assert.equal(W.kindFor('ITERATE', 'video'), 'new_hooks');
  assert.equal(W.kindFor('TRANSFER_PRODUCT', 'design'), 'template_swap');
  assert.equal(W.kindFor('NEW_ANGLE', 'design', 'original'), 'original');
  assert.equal(W.laneFirstFor('WAC', 'design'), 'Page:');
  assert.equal(W.laneFirstFor('Particle', 'video'), null);
  const o = W.normalizeOut({ ticket_name: ' X ', kind: 'original', why: 'Why: because', test: 'Test: hook', hook: '', vo_style: '', brief: 'b', script: 's', copy: 'c', donts: ['a', ''], sizes: ['9x16'], duration: 30, video_type: 'UGC', template: '', persona: '', donor: '', evidence: [],
    lines: [{ id: 'l1', kind: 'Super', text: 'Hi', version: '', size: '9x16', start: -1, end: -1, lang: '' }, { id: 'l2', kind: 'vo', text: ' ', version: '', size: '', start: 0, end: 2, lang: 'en' }] }, 'video');
  assert.equal(o.fields.why, 'because');
  assert.equal(o.fields.copy, '');
  assert.deepEqual(o.fields.donts, ['a']);
  assert.deepEqual(o.lines, [{ id: 'l1', kind: 'super', text: 'Hi', version: null, size: '9x16', start: null, end: null, lang: 'en' }]);
});

test('writer: database parameters — Postgres arrays stay arrays, JSONB becomes JSON text', () => {
  const { toParam } = require('../src/lib/medium/writer');
  assert.deepEqual(toParam('exemplar_ids', [353, 364, 17]), [353, 364, 17]);   // INT[] — the bug that lost the first two test briefs
  assert.deepEqual(toParam('exemplar_ids', null), []);
  assert.equal(toParam('lines', [{ id: 'l1' }]), '[{"id":"l1"}]');
  assert.equal(toParam('fields', { why: 'x' }), '{"why":"x"}');
  assert.equal(toParam('status', 'PENDING_REVIEW'), 'PENDING_REVIEW');
});

test('score gate: only "block" violations block; warnings never do', () => {
  const { gate } = require('../src/lib/medium/writer');
  assert.equal(gate({ passed: false, violations: [{ text: 'Claim not in a claims sheet yet', severity: 'warn' }] }).passed, true);
  const g = gate({ passed: true, violations: [{ text: 'Reveals the #1 product', severity: 'block' }, { text: 'Article URL missing', severity: 'warn' }] });
  assert.equal(g.passed, false);
  assert.deepEqual(g.blocks, ['Reveals the #1 product']);
  assert.deepEqual(g.warnings, ['Article URL missing']);
  assert.equal(gate({ violations: ['old-style string'] }).passed, false);
  assert.equal(gate({}).passed, true);
});

test('Captain brief check: AI findings that change nothing are dropped; an empty fix means remove', () => {
  const { cleanAiIssues } = require('../src/lib/captain/brief');
  const ids = new Set(['l1']);
  const out = cleanAiIssues([
    { line_id: 'l1', found: '"My wife said I look younger." It\'s', fix: 'My wife said I look younger. It\'s', type: 'rule', severity: 'must_fix', rule: 'x' },
    { line_id: 'l1', found: 'Free Shipping', fix: 'null', type: 'rule', severity: 'should_fix', rule: 'y' },
    { line_id: 'zz', found: 'recieve', fix: 'receive', type: 'spelling', severity: 'must_fix', rule: 'Spelling' },
  ], ids);
  assert.equal(out.length, 2);
  assert.equal(out[0].fix, 'Remove it');
  assert.equal(out[1].line_id, null);
});

test('freshness: everyday brief words don\'t count; a gentler curve', () => {
  const { freshnessScore, tokenSet } = require('../src/lib/medium/writer');
  assert.equal(freshnessScore(0.15), 100);
  assert.equal(freshnessScore(0.44), 52);    // the WAC gift-guide variant of its own winner was 30 before
  assert.equal(freshnessScore(0.7), 0);
  assert.deepEqual([...tokenSet('Please look at attached reference, copy style, apply to Particle design. Gift guide.')], ['gift', 'guide']);
});

test('CTA: magazine-lane calls to action count', () => {
  const R2 = require('../src/lib/captain/briefRules');
  const req = (text, kind = 'pill') => R2.normalizeRequest({ lines: [{ kind, text }] }).req;
  for (const t of ['See The Full List', 'Read the article', 'See which cologne she picked', 'View the ranking', 'Check out the Top 5']) {
    assert.deepEqual(R2.requiredElements(req(t).lines, req(t), 'WAC').filter(i => i.type === 'missing_cta'), [], t);
  }
  const none = req('5 Colognes She Loves', 'headline');
  assert.equal(R2.requiredElements(none.lines, none, 'WAC')[0].type, 'missing_cta');
});

test('Captain brief check: the same claim in VO and subtitle is listed once', () => {
  const { claimsToIssues } = require('../src/lib/captain/brief');
  const out = claimsToIssues([
    { line_id: 'l1', claim: 'Neck skin is thinner and moves all day', in_sheet: 'no_sheet', in_article: 'n/a' },
    { line_id: 'l2', claim: 'Neck skin is thinner, and moves all day.', in_sheet: 'no_sheet', in_article: 'n/a' },
  ], { ids: new Set(['l1', 'l2']), product: 'Neck Cream', lane: { name: 'Particle' }, hasArticle: false });
  assert.equal(out.length, 1);
});

test('corpus: a Monday item becomes an exemplar row', () => {
  const { toRow } = require('../src/lib/medium/corpus');
  const { DEFAULTS } = require('../src/lib/medium/config');
  const row = toRow('design', { id: 1, name: 'Neck Cream | Meta | Respect Your Face V2', created_at: '2026-05-01T10:00:00Z', column_values: [
    { id: 'people_Mjj2RrZM', text: 'Lilian Krumholz' }, { id: 'label9', text: 'Neck Cream' }, { id: 'long_textpvqldjpg', text: 'Please look at attached reference (the "Respect Your Face" split-face static), copy style, apply to Particle design.' },
    { id: 'long_text_mkngjytf', text: 'V1\nHeadline: Respect your neck.' }], updates: [] }, DEFAULTS);
  assert.equal(row.kind, 'reference_adaptation');
  assert.equal(row.template, 'Respect Your Face');
  assert.equal(row.requester, 'Lilian Krumholz');
  assert.equal(row.excluded, false);
});

// ── phases 2–5 ───────────────────────────────────────────────────────────────
test('Monday: column values use the board labels; lane goes in the ticket name', () => {
  const M = require('../src/lib/medium/monday');
  const labels = { label9: ['Neck Cream', 'Gravité'], label: ['Marketing/Media'], single_selectu06tevn: ['Meta'], multi_select_Mjj2VFZH: ['4x5', '9x16', '1x1', '16x9'], label4: ['UGC/Creator', 'Script (<1 min)'] };
  const b = { format: 'video', lane: 'Particle', product: 'Neck Cream', ticket_name: 'Neck Cream | Meta | Medium | Mirror', fields: { brief: 'A man…', why: 'w', test: 't', donts: ['x'], hook: '"Hi"', script: '0–4s', sizes: ['9x16', '5x7'], duration: 29.4, video_type: 'UGC' } };
  const { values, skipped } = M.columnValues(b, { labels, requesterId: '101019167' });
  assert.deepEqual(values.label9, { label: 'Neck Cream' });
  assert.deepEqual(values.label, { label: 'Marketing/Media' });
  assert.deepEqual(values.multi_select_Mjj2VFZH, { labels: ['9x16'] });   // 5x7 isn't a size on the board
  assert.equal(values.numeric_mm209bwg, '29');
  assert.deepEqual(values.label4, { label: 'UGC/Creator' });
  assert.deepEqual(values.person, { personsAndTeams: [{ id: 101019167, kind: 'person' }] });
  assert.match(values.long_text_mkn8c1ax.text, /Why: w/);
  assert.deepEqual(skipped, []);
  const odd = M.columnValues({ ...b, product: 'Mystery Serum' }, { labels });
  assert.equal(odd.values.label9, undefined);
  assert.match(odd.skipped[0], /Mystery Serum/);
  assert.equal(M.ticketName({ ...b, lane: 'SFY', ticket_name: 'Face Cream | Meta | Medium | Why' }), 'Face Cream | Science For You | Meta | Medium | Why');
  assert.equal(M.ticketName({ ...b, lane: 'WAC', ticket_name: 'Gravité | WAC | Meta | Medium | Gift' }), 'Gravité | WAC | Meta | Medium | Gift');
});

test('Holiday Builder: the matrix, price math and derivative wording', () => {
  const H = require('../src/lib/medium/holiday');
  const prices = [{ title: 'Neck Cream', data: { list_price: 59 } }];
  const plan = H.planHoliday({ holiday: 'Christmas', ends: '2026-12-21', lanes: ['Particle'], tiers: [{ tier: 25, code: 'xmas25' }, { tier: 30, code: 'XMAS30' }], products: ['Neck Cream', 'Hand Cream'],
    static_templates: ['Hero', 'Extra / Stock-Up'], video_templates: ['Three Quick Reasons'], derivatives: { gif: true, imessage: true, translations: true, remarketing: false } }, { prices });
  assert.equal(plan.holiday, 'Christmas 2026');
  assert.deepEqual(plan.counts, { statics: 8, videos: 2, derivatives: 8 });   // 2 products × 2 templates × 2 tiers; 2 × 1; (2 gif + 1 imessage + 1 translation) × 2
  assert.equal(plan.parents[0].ticket_name, 'Neck Cream | Christmas 2026 | Meta | Medium | Hero 25');
  assert.equal(plan.parents[0].code, 'XMAS25');
  assert.equal(plan.parents[0].price.text, '$59.00 → $44.25 (25% off)');
  assert.match(plan.parents.find(p => p.product === 'Hand Cream').price.text, /\[PRICE\]/);
  assert.equal(plan.parents.find(p => p.kind === 'video').tier, 30);   // videos carry the top tier
  const gif = H.derivativeBrief('gif', { ticket_name: 'Neck Cream | Christmas 2026 | Meta | Medium | Extra / Stock-Up 30', monday_item_id: '123', request: { holiday: { template: 'Extra / Stock-Up', tier: 30 } } });
  assert.match(gif.fields.brief, /^Turn the approved Extra \/ Stock-Up 30 static into a GIF design: https:\/\/particle-for-men\.monday\.com\/boards\/8036329818\/pulses\/123 — keep the layout and copy as designed/);
  assert.equal(gif.format, 'video');
  assert.match(H.derivativeBrief('translation', { ticket_name: 'x', request: { holiday: {} } }).fields.brief, /Percentage only, no currency/);
});

test('autopilot: the weekly plan follows the lane mix, skips briefed winners, adds transfers', () => {
  const { planWeek } = require('../src/lib/medium/autopilot');
  const w = (key, lane, format, product, winner = true) => ({ key, lane, format, product, winner, percentile: 90, spend: 2000 });
  const winners = [w('a', 'Particle', 'video', 'Face Cream'), w('b', 'Particle', 'video', 'Shampoo'), w('c', 'Particle', 'static', 'Neck Cream'), w('d', 'SFY', 'static', 'Face Cream'), w('e', 'Particle', 'video', 'Gravité', false)];
  const plan = planWeek(winners, { mix: { Particle: { video: 1, static: 1 }, SFY: { video: 0, static: 1 }, transfers: { video: 1, static: 0 } }, recent: { a: 3 }, perWeek: 10, edges: [{ source: 'Shampoo', target: 'Hair Revival Kit', score: 0.7 }] });
  assert.deepEqual(plan.map(p => `${p.lane}:${p.format}:${p.move}:${p.product}`), ['Particle:video:ITERATE:Shampoo', 'Particle:design:REFRESH:Neck Cream', 'SFY:design:REFRESH:Face Cream', 'Particle:video:TRANSFER_PRODUCT:Hair Revival Kit']);
  assert.equal(planWeek(winners, { mix: { Particle: { video: 5, static: 5 } }, perWeek: 2 }).length, 2);
});

test('outcomes: decision rule and learned transfer scores', () => {
  const { decide, updatedEdge } = require('../src/lib/medium/outcomes');
  assert.equal(decide({ percentile: null, spend: 0 }), 'waiting');
  assert.equal(decide({ percentile: 75, spend: 400 }, { days: 5 }), 'running');
  assert.equal(decide({ percentile: 75, spend: 1200 }, { days: 5 }), 'won');
  assert.equal(decide({ percentile: 30, spend: 100 }, { days: 15 }), 'failed');
  assert.equal(decide({ percentile: 50, spend: 1500 }, { days: 3 }), 'inconclusive');
  assert.equal(updatedEdge(0.8, 0, true), 0.84);
  assert.equal(updatedEdge(0.8, 0, false), 0.64);
});

test('improve loop: up to 3 rounds, stops when a round gains under 3 points', () => {
  const { canImprove } = require('../src/lib/medium/writer');
  const b = { status: 'PENDING_REVIEW', score: { fixes: [{ fix: 'x' }] } };
  assert.equal(canImprove(b), true);
  assert.equal(canImprove({ ...b, versions: { improved: { round: 1, gain: 6 } } }), true);
  assert.equal(canImprove({ ...b, versions: { improved: { round: 1, gain: 2 } } }), false);
  assert.equal(canImprove({ ...b, versions: { improved: { round: 3, gain: 9 } } }), false);
  assert.equal(canImprove({ ...b, score: { fixes: [] } }), false);
});

test('articles: magazine links in lane tickets become the article list', () => {
  const { articlesFrom } = require('../src/lib/medium/corpus');
  const out = articlesFrom([
    { lane: 'WAC', product: 'Gravité', monday_created: '2026-10-01', t: 'Page: https://wearecolognes.com/most-colognes-die-in-the-cold.\nHeadline V1…' },
    { lane: 'WAC', product: 'Varros', monday_created: '2026-11-01', t: 'Page: https://www.wearecolognes.com/most-colognes-die-in-the-cold/' },
    { lane: 'SFY', product: 'Face Cream', monday_created: '2026-09-01', t: 'Ad leads to: https://scienceforyou.co/understand-the-why (see ref)' },
    { lane: 'SFY', product: 'Face Cream', t: 'no link here' },
  ]);
  assert.equal(out.length, 2);
  const wac = out.find(a => a.lane === 'WAC');
  assert.equal(wac.url, 'https://wearecolognes.com/most-colognes-die-in-the-cold');
  assert.equal(wac.title, 'Most Colognes Die In The Cold');
  assert.deepEqual(wac.products, ['Gravité', 'Varros']);
  assert.equal(wac.last_seen, '2026-11-01');
});

test('digestText: headline counts, decided tests, next holiday and cost', () => {
  const { digestText } = require('../src/lib/medium/digest');
  const t = digestText({
    briefs: { written: 9, approved: 4, submitted: 2, rejected: 1 },
    tests: [{ status: 'won', hypothesis: 'Neck carries thinnest-skin' }, { status: 'failed', hypothesis: 'x' }],
    edges: [{ source: 'Face Cream', target: 'Neck Cream', score: 0.71, won: 2, tested: 3 }],
    opportunities: [{ lane: 'SFY', title: 'Why hands give your age away' }],
    holiday: { name: 'Christmas 2026', brief_by: '2026-12-04', days_to_brief_by: 23 },
    cost: 1.123, link: 'https://example.test/medium',
  });
  assert.match(t, /9 briefs written · 4 approved · 2 on Monday · 1 rejected/);
  assert.match(t, /1 won, 1 failed — winners: Neck carries thinnest-skin/);
  assert.match(t, /Face Cream → Neck Cream 0\.71 \(2\/3\)/);
  assert.match(t, /SFY: Why hands give your age away/);
  assert.match(t, /Christmas 2026 — briefs due in 23 days/);
  assert.match(t, /\$1\.12 · <https:\/\/example\.test\/medium\|Open Medium>/);
  const empty = digestText({});
  assert.equal(empty.split('\n').length, 2);
});

test('extractHeadlines: labelled lines, option lists, Hebrew label, junk dropped', () => {
  const { extractHeadlines, headlinesForRow, cleanHeadline } = require('../src/lib/medium/headlines');
  const copy = [
    'Headline: “The Cream Men Are Quietly Switching To”',
    'Subheadline: Science-backed. Barber-approved.',
    'CTA: Shop Now',
    '',
    'Headline options:',
    '1. Your Neck Is Telling Everyone Your Age',
    '2) Why Is Nobody Talking About Neck Skin?',
    '- Same as reference',
    '',
    'כותרת: הקרם שגברים עוברים אליו',
    'Title: https://example.com/page',
    'H1: **Stop Looking Tired**',
  ].join('\n');
  const got = extractHeadlines(copy).map(c => c.text);
  assert.deepEqual(got, ['The Cream Men Are Quietly Switching To', 'Your Neck Is Telling Everyone Your Age', 'Why Is Nobody Talking About Neck Skin?', 'הקרם שגברים עוברים אליו', 'Stop Looking Tired']);
  assert.equal(cleanHeadline('TBD'), '');
  assert.equal(cleanHeadline('One'), '');
  assert.equal(cleanHeadline('"Barber asked if I dyed my hair"'), 'Barber asked if I dyed my hair');
  const row = headlinesForRow({ copy: 'Headline: Stop Looking Tired', brief: 'Headline: Stop looking tired\nTitle: Look Rested in 2 Minutes', hook: 'Look Rested in 2 Minutes' });
  assert.deepEqual(row.map(c => c.text), ['Stop Looking Tired', 'Look Rested in 2 Minutes']);
  assert.equal(row[0].from, 'brief copy');
});

test('planWeek: headline hooks only for winning statics with a known headline, once per static', () => {
  const { planWeek } = require('../src/lib/medium/autopilot');
  const W = (key, extra) => ({ key, lane: 'Particle', format: 'static', product: 'Neck Cream', winner: true, percentile: 90, ...extra });
  const winners = [W('a', { headline: 'Your Neck Is Telling Everyone Your Age', headline_from: 'brief copy' }), W('b', {}), W('c', { headline: 'Stop Looking Tired' }), W('d', { headline: 'x y', winner: false })];
  const plan = planWeek(winners, { mix: {}, perWeek: 10, hooks: 5, hooked: { c: 1 } });
  assert.deepEqual(plan.map(p => [p.move, p.winner.key, p.format]), [['HEADLINE_HOOK', 'a', 'video']]);
  assert.equal(plan[0].headline, 'Your Neck Is Telling Everyone Your Age');
  assert.equal(planWeek(winners, { mix: {}, perWeek: 10, hooks: 0 }).length, 0);
});

test('rebalance: a slot moves from the weakest cell to the strongest, total unchanged, plain reasons', () => {
  const { rebalance } = require('../src/lib/medium/mix');
  const mix = { Particle: { video: 3, static: 3 }, SFY: { video: 2, static: 2 }, GT: { video: 1, static: 0 }, WAC: { video: 0, static: 2 }, transfers: { video: 2, static: 2 } };
  const before = JSON.stringify(mix);
  const sum = (m) => Object.values(m).reduce((a, x) => a + x.video + x.static, 0);
  const r = rebalance(mix, [
    { lane: 'SFY', format: 'static', won: 4, failed: 1, inconclusive: 0 },
    { lane: 'Particle', format: 'video', won: 0, failed: 3, inconclusive: 1 },
    { lane: 'WAC', format: 'static', won: 1, failed: 0, inconclusive: 0 },     // < 3 decided → never moves
  ]);
  assert.equal(JSON.stringify(mix), before, 'input untouched');
  assert.equal(r.mix.SFY.static, 3);
  assert.equal(r.mix.Particle.video, 2);
  assert.equal(r.mix.WAC.static, 2);
  assert.equal(sum(r.mix), sum(mix));
  assert.deepEqual(r.changes.map(c => c.why), [
    'SFY statics won 4 of 5 tests — one more slot a week (2 → 3).',
    'Particle videos won 0 of 4 tests — one slot moves to SFY statics (3 → 2).',
  ]);
});

test('rebalance: no move without 3 decided tests, a 20-point gap, or when a lane would drop to zero', () => {
  const { rebalance } = require('../src/lib/medium/mix');
  const mix = { Particle: { video: 3, static: 3 }, GT: { video: 1, static: 0 }, transfers: { video: 2, static: 2 } };
  assert.equal(rebalance(mix, [{ lane: 'Particle', format: 'video', won: 2, failed: 0, inconclusive: 0 }, { lane: 'GT', format: 'video', won: 0, failed: 2, inconclusive: 0 }]).changes.length, 0);
  assert.equal(rebalance(mix, [{ lane: 'Particle', format: 'video', won: 2, failed: 2, inconclusive: 0 }, { lane: 'Particle', format: 'static', won: 1, failed: 2, inconclusive: 0 }]).changes.length, 0);
  // GT has one slot in total — it keeps it, however badly it tested
  assert.equal(rebalance(mix, [{ lane: 'Particle', format: 'static', won: 3, failed: 0, inconclusive: 0 }, { lane: 'GT', format: 'video', won: 0, failed: 5, inconclusive: 0 }]).changes.length, 0);
  // transfers move the same way (inside the transfers budget here)
  const t = rebalance(mix, [{ lane: 'transfers', format: 'video', won: 3, failed: 0, inconclusive: 0 }, { lane: 'transfers', format: 'design', won: 0, failed: 3, inconclusive: 0 }]);
  assert.deepEqual(t.mix.transfers, { video: 3, static: 1 });
  assert.match(t.changes[0].why, /^Video transfers won 3 of 3 tests/);
  assert.match(t.changes[1].why, /one slot moves to video transfers/);
});

test('rebalance: each cell moves at most one slot a week', () => {
  const { rebalance } = require('../src/lib/medium/mix');
  const mix = { Particle: { video: 3, static: 3 }, SFY: { video: 2, static: 2 } };
  const r = rebalance(mix, [
    { lane: 'SFY', format: 'video', won: 5, failed: 0, inconclusive: 0 }, { lane: 'SFY', format: 'static', won: 4, failed: 1, inconclusive: 0 },
    { lane: 'Particle', format: 'video', won: 0, failed: 5, inconclusive: 0 }, { lane: 'Particle', format: 'static', won: 0, failed: 4, inconclusive: 1 },
  ]);
  assert.deepEqual(r.mix, { Particle: { video: 2, static: 2 }, SFY: { video: 3, static: 3 } });
  assert.equal(r.changes.length, 4);
  assert.ok(r.changes.every(c => Math.abs(c.to - c.from) === 1));
});

test('market: winner norms, plain-sentence norms, slim ads and Upspring references', () => {
  const M = require('../src/lib/medium/market');
  const U = require('../src/lib/medium/upspring');
  const all = [{ id: 'problem_statement', label: 'Problem statement', share: 0.268 }, { id: 'demo', label: 'Demo', share: 0.035 }, { id: 'myth_correction', label: 'Myth correction', share: 0.11 }, { id: 'rare', label: 'Rare', share: 0.002 }];
  const win = [{ id: 'problem_statement', label: 'Problem statement', share: 0.278 }, { id: 'demo', label: 'Demo', share: 0.052 }, { id: 'myth_correction', label: 'Myth correction', share: 0.088 }, { id: 'pov_format', label: 'POV', share: 0.045 }];
  const n = M.computeNorms(all, win);
  assert.equal(n[0].id, 'pov_format');
  assert.deepEqual(n.find(r => r.id === 'demo'), { id: 'demo', label: 'Demo', all: 3.5, winners: 5.2, lift: 1.7 });
  assert.ok(!n.some(r => r.id === 'rare'));
  const text = M.normsText({ Hooks: n });
  assert.match(text, /winners use POV more \(4\.5% vs 0%\)/);
  assert.match(text, /less: Myth correction \(8\.8% vs 11%\)/);
  assert.equal(M.normsText({ Hooks: [] }), '');
  const now = Date.parse('2026-11-11T12:00:00Z');
  const a = M.slimAd({ id: 9, advertiser: { id: 5, name: 'Lumin' }, media_type: 'video', is_active: true, started_at: '2026-11-08T07:00:00Z', hook_text: 'Men over 50, listen', strength: { impressions: 4, engagement: 'high' }, media: { thumbnail_url: 't.webp' }, ad_library_url: 'https://fb/ad' }, now);
  assert.equal(a.new, true); assert.equal(a.backed, true); assert.equal(a.days, 3); assert.equal(a.image, 't.webp'); assert.equal(a.id, '9');
  assert.equal(U.upspringAdId('upspring-ad:1636030538'), '1636030538');
  assert.equal(U.upspringAdId('https://app.upspring.ai/ads/abc123def'), 'abc123def');
  assert.equal(U.upspringAdId('https://example.com/ads/abc123def'), null);
  const ref = U.adAsReference({ advertiser: { name: 'Caldera + Lab' }, media_type: 'image', is_active: true, one_line: 'Static product hero', hook_text: null, offer: { text: '20% off', cta_label: 'Shop now' }, dimensions: [{ field: 'persona', label: 'Men 50+' }], strength: { impressions: 3, engagement: 'observed' } });
  assert.match(ref, /Caldera \+ Lab \(image, running\)/);
  assert.match(ref, /Offer: 20% off · CTA “Shop now”/);
  assert.match(ref, /persona: Men 50\+/);
});

test('Upspring ranks: lane and product from names, percentile within peers, winners', () => {
  const R = require('../src/lib/medium/ranks');
  assert.equal(R.laneOf('NC Static V2', 'US | SFY | Listicle | Conversions'), 'SFY');
  assert.equal(R.laneOf('Gravité WAC top 7'), 'WAC');
  assert.equal(R.laneOf('Starter Bundle 25% Image V4 Dan Bundles Elpage', 'US | Limited-Time Bundle Deals | Winback'), 'Particle');
  assert.equal(R.productOf('Starter Bundle 25% Image V4 Dan Bundles Elpage'), 'Starter Bundle');
  assert.equal(R.productOf('Particle Instant Eye Firming Cream UGC'), 'Instant Eye Firming Cream');
  assert.equal(R.productOf('Gravite Deodorant static'), 'Gravité Deodorant');
  assert.equal(R.productOf('NC_Static_NeckTruth_4x5'), 'Neck Cream');
  assert.equal(R.productOf('Brand awareness video'), null);
  const row = R.fromUpspring({ creative_id: 'c1', adName: 'Neck Cream Mirror V1', adType: 'image', campaignName: 'US | Main', spend: 5093.4, roas: 2.62, headlines: ['Men! Save 25%'], copies: ['x'], descriptors: 'd', image_url: 'https://storage.googleapis.com/a.jpg', externalIds: ['9'] }, 'Particle Main');
  assert.deepEqual([row.key, row.format, row.product, row.lane, row.spend, row.account], ['c1', 'static', 'Neck Cream', 'Particle', 5093, 'Particle Main']);
  const rows = Array.from({ length: 10 }, (_, i) => ({ key: `k${i}`, lane: 'Particle', product: 'Neck Cream', format: 'static', spend: 400 + i * 200, roas: 1 + i * 0.2 }));
  rows.push({ key: 'tiny', lane: 'Particle', product: 'Neck Cream', format: 'static', spend: 100, roas: 9 });
  const ranked = R.rank(rows);
  assert.equal(ranked[0].key, 'k9');
  assert.equal(ranked[0].peer.level, 'lane · product · format');
  assert.equal(ranked[0].winner, true);                      // 95th pct, $2,200
  assert.equal(ranked.find(r => r.key === 'k8').winner, true);
  assert.equal(ranked.find(r => r.key === 'k2').winner, false);
  assert.equal(ranked.find(r => r.key === 'tiny').percentile, null);   // under the $300 floor
});

test('Upspring account: PKCE and reading MCP answers from JSON or an event stream', () => {
  const A = require('../src/lib/medium/upspringAccount');
  const p = A.pkce('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk');
  assert.equal(p.challenge, 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');   // RFC 7636 appendix B
  assert.equal(A.readRpc('{"jsonrpc":"2.0","id":3,"result":{"ok":1}}', 3).result.ok, 1);
  const sse = 'event: message\ndata: {"jsonrpc":"2.0","method":"notifications/progress"}\n\nevent: message\ndata: {"jsonrpc":"2.0","id":7,"result":{"content":[{"type":"text","text":"{}"}]}}\n\n';
  assert.ok(A.readRpc(sse, 7).result.content);
  assert.equal(A.readRpc(sse, 8), null);
});

test('Mass production: plans are clamped, products matched, 40 at most', () => {
  const M = require('../src/lib/medium/mass');
  const p = M.normalizePlan({ summary: 's', question: '', groups: [
    { lane: 'SFY', product: 'neck cream', format: 'design', move: 'NEW_ANGLE', count: 30, angle: 'a', note: 'n', campaign: 'Black Friday 2026' },
    { lane: 'Nope', product: 'Face Cream', format: 'video', move: 'MADE_UP', count: 20, angle: '', note: '', campaign: '' },
    { lane: 'GT', product: '', format: 'video', move: 'ITERATE', count: 3 },
  ] });
  assert.deepEqual(p.groups.map(g => [g.lane, g.product, g.format, g.move, g.count]), [['SFY', 'Neck Cream', 'design', 'NEW_ANGLE', 12], ['Particle', 'Face Cream', 'video', 'NEW_ANGLE', 12]]);
  assert.equal(p.total, 24); assert.equal(p.est_cost, 3.6); assert.equal(p.capped, true);
  assert.equal(p.groups[0].campaign, 'Black Friday 2026'); assert.equal(p.groups[1].campaign, null);
  const big = M.normalizePlan({ groups: Array.from({ length: 6 }, () => ({ lane: 'Particle', product: 'Face Cream', format: 'video', move: 'NEW_ANGLE', count: 10 })) });
  assert.equal(big.total, 40);
});

test('Headline → Hook from Upspring: on-image line first, then the Meta headline; link pattern', () => {
  const H = require('../src/lib/medium/headlines');
  const c = H.upspringCandidates({ on_image: '25% OFF THE STARTER BUNDLE — ON US', headlines: ['Men! Save 25% On This Bundle! Offer Ends Soon!', '25% off the starter bundle — on us'] });
  assert.deepEqual(c.map(x => [x.text, x.from]), [['25% OFF THE STARTER BUNDLE — ON US', 'on the ad'], ['Men! Save 25% On This Bundle! Offer Ends Soon!', 'its Meta headline']]);
  assert.equal(H.upspringLink('6a3c', 'https://app.example.ai/creatives/{id}'), 'https://app.example.ai/creatives/6a3c');
  assert.equal(H.upspringLink('6a3c', ''), null);
});

test('auto-improve: when it runs, when a round is kept, and Captain notes are weighed not obeyed', () => {
  const W = require('../src/lib/medium/writer');
  assert.equal(W.needsAutoFix({ total: 74, band: 'below_bar' }, { must_fix: 0 }), true);
  assert.equal(W.needsAutoFix({ total: 75, band: 'one_more_pass' }, { must_fix: 0 }), false);
  assert.equal(W.needsAutoFix({ total: 88, band: 'ready' }, { must_fix: 1 }), true);
  assert.equal(W.needsAutoFix({ total: null, band: 'blocked' }, { must_fix: 0 }), true);
  const v = (total, mf, band = 'below_bar', passed = true) => ({ score: { total, band }, pf: { must_fix: mf }, style: { passed } });
  assert.equal(W.isBetter(v(70, 0), v(62, 0)), true);           // clearly higher
  assert.equal(W.isBetter(v(63, 0), v(62, 0)), false);          // noise
  assert.equal(W.isBetter(v(60, 0), v(62, 2)), true);           // fixed Captain's notes, lost little
  assert.equal(W.isBetter(v(55, 0), v(62, 2)), false);          // fixed notes but lost too much
  assert.equal(W.isBetter(v(80, 0, 'ready', false), v(62, 0)), false);   // failed the house style
  assert.equal(W.isBetter(v(58, 0), v(null, 0, 'blocked')), true);       // out of a block
  const block = W.improveBlock({ hook: 'x' }, { fixes: [{ fix: 'Sharpen the hook', gain: 6.4, evidence: 'panel' }], guardrails: { violations: [{ text: 'Reveals the #1', severity: 'block' }, { text: 'Long VO', severity: 'warn' }] } },
    { issues: [{ severity: 'must_fix', found: 'Firms in 7 days', fix: 'Firmer-looking skin', rule: 'claims' }, { severity: 'info', found: 'note', rule: 'n' }] });
  assert.match(block, /Reveals the #1/); assert.doesNotMatch(block, /Long VO/);
  assert.match(block, /\+6 · panel/);
  assert.match(block, /not a checklist to apply word for word/);
  assert.match(block, /\[important\] Firms in 7 days → Firmer-looking skin/);
  assert.doesNotMatch(block, /\bnote \(n\)/);
  assert.match(block, /Keep the concept, the structure, the length/);
});

test('brand websites: sitemaps, product pages, schema.org data, page text and the Brain block', () => {
  const W = require('../src/lib/captain/site');
  assert.deepEqual(W.locs('<urlset><url><loc>https://a.com/product/x/</loc></url><url><loc> https://a.com/products/y?from=1&amp;to=2 </loc></url></urlset>'), ['https://a.com/product/x/', 'https://a.com/products/y?from=1&to=2']);
  assert.deepEqual(W.productUrls(['https://www.a.com/product/face-cream/', 'https://a.com/product/face-cream', 'https://a.com/product/face-cream-subscription/', 'https://a.com/blog/x', 'https://b.com/products/z', 'https://a.com/products/gift-card'], 'a.com'),
    ['https://www.a.com/product/face-cream/']);
  const html = `<html><head><script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"WebPage"},{"@type":"Product","name":"Particle Neck Cream","description":"Firms &amp; lifts","offers":{"@type":"Offer","price":"59","priceCurrency":"USD"},"aggregateRating":{"@type":"AggregateRating","ratingValue":4.81,"reviewCount":1041}}]}</script></head>
    <body><nav>Menu Face Hair</nav><header>Cart</header><h1>Particle Neck Cream</h1><p>Visibly tightens neck skin</p><script>var x=1</script><footer>© 2026</footer></body></html>`;
  assert.deepEqual(W.productFromJsonLd(html), { name: 'Particle Neck Cream', price: 59, price_high: null, currency: 'USD', rating: 4.81, reviews: 1041, description: 'Firms & lifts' });
  const t = W.mainText(html);
  assert.match(t, /^Particle Neck Cream\nVisibly tightens neck skin/);
  assert.doesNotMatch(t, /Menu|Cart|var x|2026/);
  assert.equal(W.productFromJsonLd('<html></html>'), null);
  const brandRow = { brand: 'Particle', read_at: '2026-11-11T10:00:00Z', data: { tagline: 'Aesthetic science for men', promises: ['30-day money-back guarantee'], guarantee: '30 days', shipping: 'Free US shipping', social_proof: ['Used by over 1 million men'] } };
  const products = [
    { data: { name: 'Particle Face Cream', price: 69, currency: 'USD', rating: 4.81, reviews: 9027, promise: 'Fixes eye bags, dark spots and wrinkles', claims: ['6-in-1'], ingredients: ['Retinol — smooths lines'] } },
    { data: { name: 'Particle Neck Cream', price: 59, currency: 'USD', rating: 4.81, reviews: 1041, promise: 'Firms and lifts the neck', claims: ['Visibly tightens neck skin'], ingredients: ['Collagen', 'Hyaluronic acid'], how_to_use: 'Twice a day', offers: '4 units $45 each' } },
  ];
  const all = W.siteBlock(brandRow, products);
  assert.match(all, /FROM THE PARTICLE WEBSITE \(public, read 2026-11-11\)/);
  assert.match(all, /approved claims and price list win over it/);
  assert.match(all, /• Particle Face Cream \$69 · 4\.81★ \(9,027\) — Fixes eye bags/);
  assert.doesNotMatch(all, /Key ingredients/);
  const one = W.siteBlock(brandRow, products, { product: 'Neck Cream' });
  assert.match(one, /This product:\n• Particle Neck Cream — \$59 · 4\.81★ from 1,041 reviews/);
  assert.match(one, /Key ingredients: Collagen, Hyaluronic acid/);
  assert.match(one, /Offers on the page: 4 units \$45 each/);
  assert.match(one, /Other products:\n• Particle Face Cream/);
  assert.equal(W.siteBlock(null, []), '');
});

test('language bank: comments are scrubbed of names, handles, links and emails', () => {
  const { scrub } = require('../src/lib/medium/accountRead');
  assert.equal(scrub('@John Smith this cream actually works on my neck'), 'this cream actually works on my neck');
  assert.equal(scrub('My wife noticed!! see https://x.co/abc or mail me a.b@c.com'), 'My wife noticed!! see or mail me');
  assert.equal(scrub('@mike_88 does it work for 60+?'), 'does it work for 60+?');
  assert.equal(scrub('x'.repeat(500)).length, 400);
});
