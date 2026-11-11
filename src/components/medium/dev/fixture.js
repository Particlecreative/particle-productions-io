// Local-dev fixture for MEDIUM (vite dev without VITE_MEDIUM_LIVE=1). Sample data only — nothing here is real output.
const now = Date.now();
const ago = (min) => new Date(now - min * 60000).toISOString();

const MOVES = {
  ITERATE: 'Keep the proven body, write 4–6 new hooks.', REFRESH: 'Same concept, new people and execution.', TRANSFER_PRODUCT: 'Winning concept → another product, same lane.',
  TRANSFER_LANE: 'Winning concept → another lane, same product.', TRANSFER_FORMAT: 'Video winner → static set, or the reverse.', REVIVE: 'A never-ran sibling of a winner.', NEW_ANGLE: 'An underused angle or a category gap.',
};

const videoFields = {
  brief: 'A 55–65 man at his bathroom mirror, buttoning a collared shirt before a family dinner. Real, not styled. He tilts his chin up and notices the skin under his jaw for the first time in years. Kizik structure carries it: bold claim + product in hand → live demo with timer → resolution. Vertical 9:16, 30s, sizes 9:16 · 4:5. Reference attached.',
  script: '0–4s — THE HOOK (talking to camera, Neck Cream in hand)\nSCRIPT: "Your neck ages before your face does. Nobody told me that."\nVISUALS: He holds the jar up next to his jaw. Mirror behind him. Casual, not selling.\n\n4–12s — THE WHY\nSCRIPT: "The skin there has fewer oil glands, so it thins first."\nVISUALS: Close-up of his fingers smoothing the cream upward, timer on screen: 0:00.\n\n12–24s — THE DEMO\nSCRIPT: "Firms, lifts, moisturizes. Ten seconds a day."\nVISUALS: Timer hits 0:10. Texture close-up, no sheen.\n\n24–30s — CTA\nSCRIPT: "Try it risk-free."\nVISUALS: Product on the sink, CTA card.\n\nVO style: Calm, conversational male. Authoritative-friend register, not announcer.',
  copy: '', hook: '"Your neck ages before your face does. Nobody told me that."',
  why: 'Transfers the face-and-body cluster’s “part that ages first” hook to Neck Cream; the timer demo is the most-borrowed structure in the corpus [AfterLife].',
  test: 'Hook only — 3 versions, same body. Win = hook rate above 30% at $1k spend.', vo_style: 'Calm, conversational male. Authoritative-friend register, not announcer.',
  donts: ['No real brand or label on any prop', 'No “eliminates” — “visibly firms”', 'No music under the VO'], sizes: ['9x16', '4x5'], duration: 30, video_type: 'UGC', template: 'Kizik live demo', persona: '', donor: 'Kizik',
};

const designFields = {
  brief: 'Please look at attached reference (the “Respect Your Face” split-face static), copy style, apply to Particle design.\nDark navy header bar, bold white headline, light-blue italic subtitle. Split-screen close-up of one man’s neck, before on the left, after on the right — same light, same angle. Natural window light, not overly retouched. Nothing else on the frame — no badges, no product shot.\nSizes 4×5 · 1×1 · 9×16.',
  script: '', hook: '',
  copy: 'On all versions: Results may vary.\n\nV1\nHeadline: Respect Your Neck.\nSubtitle: It ages first. Treat it first.\n\nV2\nHeadline: The Part You Forgot.\nSubtitle: Firms, lifts and moisturizes.\n\nV3\nHeadline: Your Face Gets Cream. Your Neck Gets Nothing.\nSubtitle: Until now.',
  why: 'Reuses the split-face layout the team already ranks highly, on the product with no static library yet [AfterLife].', test: 'Headline only — V1 / V2 / V3, same layout. Win = CTR above 1.2% at $1k spend.',
  vo_style: '', donts: ['No product shot on the frame', 'B&A must be the same man, same light'], sizes: ['4x5', '1x1', '9x16'], duration: null, video_type: '', template: 'Respect Your Face', persona: '', donor: '',
};

const score = (total, band) => ({
  total, band, calibrated: false, measured_weight: 70, guardrails: { passed: band !== 'blocked', violations: band === 'blocked' ? ['“eliminates wrinkles” is an absolute claim'] : [] },
  subs: {
    evidence: { score: null, why: '[AfterLife] — needs the winners feed' }, pattern_fit: { score: null, why: '[Upspring] — needs the account read' },
    hook_strength: { score: 82, why: 'Fact + consequence, in his own voice' }, proof: { score: 70, why: 'Timer demo; no B&A' }, freshness: { score: 88, why: 'Nothing too similar in the last 60 days' },
    message_match: { score: 62, why: 'PDP promise matches “firms, lifts”' }, maker_ready: { score: 86, why: 'Timings, VO style, sizes and references all there' }, test_design: { score: 80, why: 'One variable, a decision rule' },
  },
  critics: { buyer: 'He’d believe “nobody told me that” — it sounds like a man, not an ad. The timer makes “ten seconds” concrete.', media_buyer: 'Distinct from the live Face Cream set; launchable as three hook cuts.', maker: 'One location, one creator, one product — makeable this week.' },
  fixes: [{ fix: 'Add a 2-second B&A of the jawline at 20s', gain: 6, evidence: 'Proof device in the aging cluster' }, { fix: 'Name the persona (Silver Executive) in the ticket', gain: 2, evidence: 'Corpus naming' }],
});

const briefs = [
  { id: 'b1', status: 'PENDING_REVIEW', source: 'generator', author: 'Tomer W.', lane: 'Particle', product: 'Neck Cream', format: 'video', move: 'TRANSFER_PRODUCT', kind: 'original', ticket_name: 'Neck Cream | Meta | Medium | The Part That Ages First — Mirror Timer',
    fields: videoFields, score: score(79, 'one_more_pass'), preflight: { check_id: 'c1', verdict: 'passed', must_fix: 0, issues: [{ line_id: 'l3', found: 'Ten seconds a day', fix: 'check it is substantiated', type: 'claim_unverified', severity: 'should_fix', rule: 'Claims sheet' }], notes: [] },
    style: { passed: true, failures: [], rewrites: 0 }, cost_usd: 0.071, created_at: ago(12),
    evidence: { items: [{ claim: 'Face & body cluster transfer score 0.8 (Face Cream → Neck Cream)', source: 'corpus' }, { claim: 'Timer demo used in 14 briefs since March', source: 'corpus' }], afterlife: { available: false, reason: "AFTERLIFE's winners endpoint isn't live yet" }, examples: [{ id: 1, item_id: '13001', name: 'IEFC | Meta | Claude | Family Event 40% Survey' }] } },
  { id: 'b2', status: 'PENDING_REVIEW', source: 'freeform', author: 'Tomer W.', lane: 'Particle', product: 'Neck Cream', format: 'design', move: 'FREEFORM', kind: 'reference_adaptation', ticket_name: 'Neck Cream | Meta | Medium | Respect Your Neck — Split Face V1–V3',
    fields: designFields, score: score(84, 'ready'), preflight: { check_id: 'c2', verdict: 'issues', must_fix: 1, issues: [{ line_id: 'l5', found: 'Your Face Gets Cream. Your Neck Gets Nothing.', fix: 'At most 32 for the headline in 9x16 — cut 13', type: 'fit', severity: 'must_fix', rule: 'Layout limit: Respect Your Face' }], notes: [] },
    style: { passed: true, failures: [], rewrites: 1 }, cost_usd: 0.12, created_at: ago(40),
    versions: { medium: { ticket_name: 'Neck Cream | Meta | Medium | Respect Your Neck — Split Face V1–V3', fields: designFields, score: score(84, 'ready') }, mine: { ticket_name: 'Neck Cream | Meta | Medium | Neck B&A static', fields: { ...designFields, copy: 'V1\nHeadline: Your neck ages first.\n\nV2\nHeadline: Neck cream for men.' }, score: score(68, 'one_more_pass') } },
    evidence: { items: [], chips: { lane: 'Particle', product: 'Neck Cream', format: 'design', length: '—', talent: 'man 55–65', move: 'NEW_ANGLE', structure: 'Respect Your Face', offer: 'none' },
      findings: [{ tag: 'supports', text: 'Split-face B&A is the most-used static layout in the corpus.', source: 'corpus' }, { tag: 'overlap', text: '“Respect Your Face” already ran on Face Cream — this makes it a deliberate product transfer.', source: 'corpus' }, { tag: 'gap', text: 'No neck B&A photography on file — book a shoot or use the texture close-up fallback.', source: 'brand doc' }],
      changed: 'Medium added V3 and the “Results may vary” line, and named the reference layout.', question: '' } },
  { id: 'b3', status: 'DROPPED', source: 'generator', author: 'Tomer W.', lane: 'SFY', product: 'Hand Cream', format: 'video', move: 'REFRESH', kind: 'original', ticket_name: 'Hand Cream | Science For You | Meta | Medium | Understand the Why', fields: { ...videoFields, brief: 'This ad explains why hands age.' },
    style: { passed: false, failures: ['The first line must be “Ad leads to: {article URL}”', 'Opening doesn’t match the kind of job'], rewrites: 1 }, error: 'Failed the house-style check twice', cost_usd: 0.06, created_at: ago(90) },
  { id: 'b4', status: 'APPROVED', source: 'generator', author: 'Tomer W.', lane: 'WAC', product: 'Gravité', format: 'design', move: 'NEW_ANGLE', kind: 'reference_adaptation', ticket_name: 'Gravité | WAC | Meta | Medium | The 5 Colognes Men Actually Want This Christmas', fields: designFields, score: score(81, 'ready'), preflight: { verdict: 'passed', must_fix: 0, issues: [] }, reviewer: 'Tomer W.', cost_usd: 0.08, created_at: ago(300) },
];

const summary = (b) => ({ id: b.id, status: b.status, source: b.source, author: b.author, lane: b.lane, product: b.product, format: b.format, move: b.move, kind: b.kind, ticket_name: b.ticket_name, hook: b.fields?.hook, why: b.fields?.why,
  score: b.score?.total ?? null, band: b.score?.band, preflight: b.preflight?.verdict, must_fix: b.preflight?.must_fix, style_passed: b.style?.passed, error: b.error, cost_usd: b.cost_usd, created_at: b.created_at });

const KINDS = [['original', 'Original concept'], ['reference_adaptation', 'Reference adaptation'], ['template_swap', 'Template swap'], ['static_gif', 'Static → GIF'], ['creator_edit', 'Creator edit'], ['new_hooks', 'New hooks'], ['translation', 'Translation']];

export function fixtureCall(path, { method = 'GET', body } = {}) {
  const p = path.split('?')[0];
  if (p === '/overview') {
    return {
      counts: [{ status: 'PENDING_REVIEW', lane: 'Particle', n: 2 }, { status: 'APPROVED', lane: 'WAC', n: 1 }, { status: 'DROPPED', lane: 'SFY', n: 1 }],
      beliefs: [
        { id: 1, claim: 'A man 55–65 is the default talent; “Younger” (30–45) is a named test persona.', because: 'The most common age band across the corpus.', status: 'assumption', change_condition: 'A Younger cell beating 55–65 on the same body.' },
        { id: 2, claim: 'Native and real beats polished.', because: 'House style across the corpus.', status: 'assumption', change_condition: 'A polished cell beating native on the same concept.' },
        { id: 3, claim: 'Theme alone doesn’t sell holidays.', because: 'Theme-only holiday ads fatigued (account read).', status: 'testing', change_condition: 'A theme-only holiday ad reaching the 60th percentile.' },
      ],
      tests: [], donors: [{ brand: 'Kizik', takes: 'live demo with timer', usage_count: 14 }, { brand: 'Hello Klean', takes: 'CGI product demo; split-screen testimonial relay', usage_count: 9 }, { brand: 'Saltair', takes: 'search-result format', usage_count: 6 }],
      recent: briefs.map(summary),
      sources: { afterlife: { connected: false, reason: "AFTERLIFE's winners endpoint isn't live yet" }, upspring: { connected: false, snapshot: false }, corpus: { used: 1298, total: 1357, at: ago(60) }, monday: { submit: false }, worker: { alive: true } },
      articles: [
        { id: 1, lane: 'SFY', url: 'https://scienceforyou.co/neck-skin-thinnest', title: 'Why neck skin ages first', products: ['Neck Cream'], opportunity: false },
        { id: 2, lane: 'GT', url: 'https://gentlemantoday.co/best-anti-aging-creams-men', title: 'The 7 best anti-aging creams for men', products: ['Face Cream'], opportunity: false },
        { id: 3, lane: 'WAC', url: 'https://wearecolognes.com/top-colognes-2026', title: 'Top colognes of 2026', products: [], opportunity: false },
        { id: 4, lane: 'SFY', url: 'opportunity:sfy-hand-skin', title: 'Why hands give your age away', products: ['Hand Cream'], opportunity: true },
      ],
      digest: { enabled: false, weekday: 1, hour: 9, webhook: true },
      language_bank: ['Barber asked if I dyed my hair.', 'My wife said I look younger.', 'No mess on the pillowcase.'],
      holidays: [{ name: 'Black Friday 2026', date: '2026-11-27', brief_by: '2026-11-06', days_to_brief_by: -5 }, { name: 'Christmas 2026', date: '2026-12-25', brief_by: '2026-12-04', days_to_brief_by: 23 }, { name: "Valentine's Day 2027", date: '2027-02-14', brief_by: '2027-01-24', days_to_brief_by: 74 }],
      options: { lanes: ['Particle', 'SFY', 'GT', 'WAC'], moves: MOVES, products: ['Face Cream', 'Neck Cream', 'Hand Cream', 'Instant Eye Firming Cream', 'Gravité', 'Shaving Gel', 'NeoRoot'], kinds: KINDS.map(([id, label]) => ({ id, label })) },
    };
  }
  if (p === '/corpus') {
    return {
      stats: {
        formats: [{ format: 'video', n: 535, used: 528 }, { format: 'design', n: 822, used: 770 }],
        mix: [['video', 'original', 320], ['video', 'reference_adaptation', 81], ['video', 'static_gif', 48], ['video', 'creator_edit', 55], ['video', 'new_hooks', 8], ['video', 'translation', 6], ['design', 'original', 435], ['design', 'reference_adaptation', 321], ['design', 'template_swap', 32], ['design', 'translation', 18]].map(([format, kind, n]) => ({ format, kind, n })),
        lanes: [{ lane: 'Particle', format: 'video', n: 516 }, { lane: 'Particle', format: 'design', n: 700 }, { lane: 'SFY', format: 'design', n: 45 }, { lane: 'GT', format: 'design', n: 18 }, { lane: 'WAC', format: 'design', n: 7 }],
        excluded: [{ reason: 'Test brand: Ashford', n: 40 }, { reason: 'Test brand: Levitas', n: 19 }, { reason: 'Thin brief', n: 25 }],
        at: ago(60), first: '2026-03-15T08:00:00Z', latest: ago(1500), ai_written: 178, winners: 0,
      },
      templates: [{ id: 1, name: 'Respect Your Face', format: 'static', description: 'Navy header bar, white headline, light-blue italic subtitle, split-face B&A', usage_count: 23, afterlife_rank: null }, { id: 2, name: 'Receipt Vertical', format: 'static', description: 'Pill, headline, line item with strikethrough price', usage_count: 17, afterlife_rank: null }, { id: 3, name: 'Kizik live demo', format: 'video', description: 'Bold claim + product → live demo with timer', usage_count: 14, afterlife_rank: null }],
      donors: [{ id: 1, brand: 'Kizik', takes: 'live demo with timer', usage_count: 14 }, { id: 2, brand: 'Hello Klean', takes: 'CGI product demo', usage_count: 9 }],
      ingest: { status: 'done', finished_at: ago(60), result: { video: 535, design: 822, excluded: 84 } }, style_guide_chars: 0, requesters: ['Lilian Krumholz'], since: '2026-03-15',
    };
  }
  if (p === '/corpus/exemplars') return { exemplars: [{ id: 1, item_id: '13001', board_id: '5433027071', format: 'video', name: 'IEFC | Meta | Claude | Family Event 40% Survey', kind: 'original', lane: 'Particle', product: 'Instant Eye Firming Cream', brief: 'A 55–60 man at his bathroom mirror, getting ready. Real, not styled…', monday_created: ago(9000) }] };
  if (p === '/corpus/ingest') return { queued: true };
  if (p === '/generate') return { queued: body?.count || 1, ids: ['b1'] };
  if (p === '/freeform') return { queued: 1, id: 'b2' };
  if (p === '/briefs') {
    const q = new URLSearchParams(path.split('?')[1] || '');
    let list = briefs;
    if (q.get('status')) list = list.filter(b => q.get('status').split(',').includes(b.status));
    if (q.get('lane')) list = list.filter(b => b.lane === q.get('lane'));
    if (q.get('ids')) list = list.filter(b => q.get('ids').split(',').includes(b.id));
    return { briefs: list.map(summary) };
  }
  if (p.startsWith('/briefs/') && p.split('/').length === 3) {
    const b = briefs.find(x => x.id === p.split('/')[2]) || briefs[0];
    if (method === 'PUT') return { ok: true, style: { passed: true, failures: [] }, preflight: b.preflight };
    const f = b.fields || {};
    const lines = String(f.brief || '').split('\n');
    const brief_text = [lines[0], f.why ? `Why: ${f.why}` : null, lines.slice(1).join('\n').trim() || null, (f.donts || []).length ? `Don'ts:\n${f.donts.map(d => `- ${d}`).join('\n')}` : null, f.test ? `Test: ${f.test}` : null].filter(Boolean).join('\n\n');
    return { brief: { ...b, brief_text }, examples: b.evidence?.examples || [] };
  }
  if (p.endsWith('/approve')) return { ok: true, status: 'APPROVED', monday: 'Shadow mode — nothing was created on Monday' };
  if (p.endsWith('/reject') || p.endsWith('/regenerate')) return { ok: true, queued: 1, id: 'b1' };
  if (p === '/config') return { config: { monday_submit: false, style_guide: '', upspring_snapshot: '', language_bank: ['Barber asked if I dyed my hair.'], corpus: { requesters: ['Lilian Krumholz'], since: '2026-03-15' } } };
  if (p === '/affinity') {
    const rows = [['aging', 'Face Cream', 'Neck Cream', 0.8], ['aging', 'Face Cream', 'Hand Cream', 0.75], ['aging', 'Face Cream', 'Instant Eye Firming Cream', 0.85], ['aging', 'Instant Eye Firming Cream', 'Face Cream', 0.8], ['aging', 'Neck Cream', 'Face Cream', 0.6], ['aging', 'Face Cream', 'Anti-Gray Serum', 0.3],
      ['fragrance', 'Gravité', 'Varros', 0.6, 'only when the concept is not built on “bold/night”'], ['fragrance', 'Gravité', 'Bold Moves', 0.75], ['hair', 'Hair Revival Kit', 'NeoRoot', 0.75]];
    return { affinity: rows.map(([cluster, source, target, score, note], i) => ({ id: i, cluster, source, target, score, note: note || null, tested: 0, won: 0 })) };
  }
  if (p.startsWith('/beliefs/')) return { belief: { id: 1, status: body?.status } };
  if (p === '/holiday/plan') {
    const tiers = (body?.tiers || []).filter(t => Number(t.tier));
    const parents = (body?.products || []).flatMap(product => [
      ...(body?.static_templates || []).flatMap(template => tiers.map(t => ({ kind: 'static', format: 'design', product, template, tier: Number(t.tier), code: String(t.code || '').toUpperCase(), ticket_name: `${product} | ${body.holiday} 2026 | Meta | Medium | ${template} ${t.tier}` }))),
      ...(body?.video_templates || []).map(template => ({ kind: 'video', format: 'video', product, template, ticket_name: `${product} | ${body.holiday} 2026 | Meta | Medium | ${template}` })),
    ]);
    return { plan: { holiday: `${body?.holiday} 2026`, parents, counts: { statics: parents.filter(x => x.kind === 'static').length, videos: parents.filter(x => x.kind === 'video').length, derivatives: (body?.products || []).length * 3 },
      prices: (body?.products || []).flatMap(product => tiers.map(t => (product === 'Neck Cream' ? { product, list: 59, text: `$59.00 → $${(59 * (100 - t.tier) / 100).toFixed(2)} (${t.tier}% off)` } : { product, list: null, text: `[PRICE] — add ${product}'s list price in Captain → Brain → Price list` }))),
      est_cost: Math.round(parents.length * 8) / 100 } };
  }
  if (p === '/holiday/campaigns') return { campaigns: [{ batch_id: 'c0ffee00-0000-4000-8000-000000000001', holiday: 'Christmas 2026', briefs: 3, writing: 0, waiting: 2, approved: 1 }] };
  if (p.startsWith('/holiday/') && method === 'GET') return { briefs: briefs.slice(0, 3).map(b => ({ ...summary(b), source: 'holiday' })) };
  if (p === '/digest/preview') return { text: '*🔮 Medium — the week* (9 briefs written · 4 approved · 2 on Monday · 1 rejected)\n*Tests decided:* 1 won, 0 failed — winners: Neck Cream carries the thinnest-skin hook\n*Next holiday:* Christmas 2026 — briefs due in 23 days (2026-12-04)\nAI cost this week: $1.12' };
  if (p === '/digest/send') return { sent: true };
  if (/^\/briefs\/\d+\/static-version$/.test(p)) return { id: 999, queued: true };
  if (p === '/scorecard') return { rows: [{ lane: 'Particle', source: 'generator', move: 'TRANSFER_PRODUCT', briefs: 3, approved: 1, rejected: 0, shipped: 0, edited: 1, avg_score: 78, cost: 0.31 }], tests: [] };
  return {};
}
