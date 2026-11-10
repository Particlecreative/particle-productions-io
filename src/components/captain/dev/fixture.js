// Local-dev fixture for Captain Caption HQ (vite dev without VITE_CAPTAIN_LIVE=1). Based on the real first test:
// the RESELLERS hooks where Gemini caught "CUSTUMER" and lowercase "particle".
const now = Date.now();
const ago = (min) => new Date(now - min * 60000).toISOString();

const issuesH1 = [
  { id: 1, idx: 0, start_s: 0, end_s: 2, frame: 1, duration_frames: 48, found: 'SAVE 10$ ON PARTICLE?', fix: 'Bought Particle from a reseller to save a few bucks?', type: 'script_mismatch', severity: 'check', note: 'Opening hook differs from the brief' },
  { id: 2, idx: 1, start_s: 1, end_s: 2, frame: 25, duration_frames: 24, found: '10$', fix: '$10', type: 'spelling', severity: 'must_fix', note: 'Currency symbol goes before the number' },
  { id: 3, idx: 2, start_s: 7.5, end_s: 8.5, frame: 181, duration_frames: 24, found: 'CUSTUMER', fix: 'CUSTOMER', type: 'spelling', severity: 'must_fix', note: null, comment_id: 'c1', feedback: 'good_catch' },
  { id: 4, idx: 3, start_s: 26.5, end_s: 28.5, frame: 637, duration_frames: 48, found: 'CUSTUMER', fix: 'CUSTOMER', type: 'spelling', severity: 'must_fix', note: null, comment_id: 'c2' },
  { id: 5, idx: 4, start_s: 31, end_s: 33.5, frame: 745, duration_frames: 60, found: 'particle', fix: 'Particle', type: 'brand_name', severity: 'must_fix', note: 'House rule: always capitalised' },
];

const checks = [
  { id: '11111111-1111-4111-8111-111111111111', discipline: 'video', status: 'issues', trigger: 'manual', board_id: '5433027071', item_id: '12818442030', item_name: 'Face Cream | Meta | Claude | COPYCAT Campaign | RESELLERS', department: 'Marketing/Media', product: 'Face Cream', person: 'Omri Tabachnik', scope_reason: 'Department: Marketing/Media', deliverable: 'Version 1 · 16x9', round: 2, engine: 'gemini', model: 'gemini-3.8-flash', issue_count: 5, cost_usd: 0.021, duration_ms: 16400, posting: 'test', posted_at: ago(4), created_at: ago(5), asset: { view_url: 'https://next.frame.io/' }, top_issues: issuesH1.map(({ idx, found, fix, type, severity }) => ({ idx, found, fix, type, severity })) },
  { id: '22222222-2222-4222-8222-222222222222', discipline: 'video', status: 'running', trigger: 'manual', item_name: 'Face Cream | Meta | Claude | COPYCAT Campaign | RESELLERS', deliverable: 'Version 2 · 16x9', round: 2, person: 'Omri Tabachnik', product: 'Face Cream', issue_count: 0, created_at: ago(1), asset: {} },
  { id: '33333333-3333-4333-8333-333333333333', discipline: 'video', status: 'skipped', skip_reason: 'TV project (Department: TV)', trigger: 'review', item_name: 'Face Cream | Claude | The Hunt TV commercial Offline', department: 'TV', issue_count: 0, created_at: ago(90), asset: {} },
  { id: '44444444-4444-4444-8444-444444444444', discipline: 'video', status: 'passed', trigger: 'for_approval', item_name: 'Gravité | Meta | Summer Nights | Hook test', deliverable: 'Version 1 · 9x16', round: 3, person: 'Yael Ben-Dor', product: 'Gravité', model: 'gemini-3.8-flash', issue_count: 0, cost_usd: 0.018, duration_ms: 15100, created_at: ago(240), asset: {} },
  { id: '55555555-5555-4555-8555-555555555555', discipline: 'video', status: 'error', trigger: 'review', item_name: 'Deodorant | Meta | Gym bag', deliverable: 'Version 1 · 4x5', round: 1, error: 'Frame.io has no playable copy of this file yet', issue_count: 0, created_at: ago(600), asset: {} },
];

const brain = [
  ...['Particle', 'Face Cream', 'Instant Eye Firming Cream', 'Anti Gray Serum', 'Gravité', 'Deodorant'].map((t, i) => ({ id: i + 1, type: 'term', title: t, content: null, discipline: 'both', active: true, status: 'approved', source: 'seed', added_by: 'spec', created_at: ago(2000) })),
  { id: 20, type: 'rule', title: 'Particle is always capitalised', content: 'The brand name “Particle” is ALWAYS capitalised, even inside lowercase-style subtitles.', discipline: 'both', active: true, status: 'approved', source: 'seed', added_by: 'Tomer Wilf Lezmy', created_at: ago(1000) },
  { id: 21, type: 'rule', title: 'Currency symbol before the number', content: 'Prices use US formatting: “$10”, never “10$”.', discipline: 'both', active: true, status: 'approved', source: 'seed', added_by: 'Tomer Wilf Lezmy', created_at: ago(1000) },
  { id: 30, type: 'do_not_flag', title: 'gonna', content: 'Marked “not a typo”', discipline: 'video', active: true, status: 'pending', source: 'feedback', added_by: 'Omer Barak', created_at: ago(30) },
  { id: 40, type: 'rule', title: 'No period at the end of on-screen text', content: 'Captions and on-screen lines never end with a full stop, unless they contain two sentences.', discipline: 'both', active: true, status: 'pending', source: 'import', added_by: 'History import', created_at: ago(5),
    evidence: { count: 64, reviewers: ['Aviad Eilam', 'Lilian Krumholz'], products: [], confidence: 'high', examples: [
      { id: 1, source: 'frameio', author: 'Aviad Eilam', product: 'Deodorant', text: 'Remove the period', found: 'Stay fresh all day.', fix: 'Stay fresh all day', outcome: 'fixed' },
      { id: 2, source: 'figma', author: 'Aviad Eilam', product: null, text: 'Remove quotation mark', found: null, fix: null, outcome: 'cant_tell' }] } },
  { id: 41, type: 'term', title: 'Gravité', content: 'Often written without the accent (“Gravite”).', discipline: 'both', active: true, status: 'pending', source: 'import', added_by: 'History import', created_at: ago(5),
    evidence: { count: 14, reviewers: ['Aviad Eilam'], products: ['Gravité'], confidence: 'high', examples: [{ id: 3, source: 'frameio', author: 'Aviad Eilam', product: 'Gravité', text: '*Gravité', found: 'Gravite', fix: 'Gravité', outcome: 'fixed' }] } },
  { id: 42, type: 'learned', title: 'Price Goes Back Up November 23', content: 'Holiday price line used on Ab Firming Cream designs.', discipline: 'design', active: true, status: 'pending', source: 'import', added_by: 'History import', created_at: ago(5),
    evidence: { count: 3, reviewers: ['Lilian Krumholz'], products: ['Ab Firming Cream'], confidence: 'medium', possibly_expired: true, examples: [] } },
  { id: 43, type: 'insight', title: 'Keep the bottle on screen while stats show', content: 'When claims or percentages appear, keep the product visible instead of cutting to stock footage.', discipline: 'video', active: true, status: 'pending', source: 'import', added_by: 'History import', created_at: ago(5),
    evidence: { count: 9, reviewers: ['Lilian Krumholz'], products: ['Face Cream', 'Instant Eye Firming Cream'], confidence: 'medium', examples: [] } },
];

const settings = {
  triggers: { video: { first: ['Review'], second: ['For Approval'] }, design: { first: ['Quality Check'], second: ['For Approval'] } },
  done_statuses: ['Completed', 'Upload Complete'],
  scope: { video_departments: ['Marketing/Media', 'Socials', 'Website', 'Retention'], design_departments: ['Marketing', 'Socials', 'Website', 'Email'], title_keywords: ['Meta'], tv_departments: ['TV'], tv_types: ['TV'] },
  auto_versions: { video: true, design: true },
  engines: { video: { engine: 'gemini', model: 'gemini-3.8-flash' }, design: { engine: 'claude', model: 'claude-sonnet-5-5' } },
  second_opinion: { video: false, design: false }, max_reference_images: 4, insights: true,
  posting: { mode: 'test', test_frameio_folders: ['d2acf872'], test_figma_files: ['qTzVZh3p4cEXc6OiK24sUY'], test_monday_items: [] },
  worker: { concurrency: 1 },
};

export function fixtureCall(path, { method = 'GET', body } = {}) {
  const p = path.split('?')[0];
  if (p === '/status') return { frameio: { configured: true, connected: false }, figma: { configured: true, connected: true, user_name: 'Captain Caption' }, monday: { configured: false, connected: false }, gemini: { configured: true }, anthropic: { configured: true }, worker: { alive: true, at: new Date().toISOString() }, posting: settings.posting, engines: settings.engines, queue: { done: 4 } };
  if (p === '/jobs') return { jobs: [{ id: 9, kind: 'video_check', status: 'running' }] };
  if (p === '/checks') {
    const q = new URLSearchParams(path.split('?')[1] || '');
    let list = checks;
    if (q.get('status')) list = list.filter(c => q.get('status').split(',').includes(c.status));
    if (q.get('q')) { const s = q.get('q').toLowerCase(); list = list.filter(c => JSON.stringify(c).toLowerCase().includes(s)); }
    return { total: list.length, checks: list };
  }
  if (p.startsWith('/checks/') && !p.endsWith('/rerun')) {
    const c = checks.find(x => x.id === p.split('/')[2]) || checks[0];
    return {
      check: { ...c, monday_url: c.item_id ? `https://particle-for-men.monday.com/boards/5433027071/pulses/${c.item_id}` : null, raw: c.status === 'issues' ? { on_screen_text: [{ start: 0.5, text: 'SAVE 10$ ON PARTICLE?' }, { start: 2.5, text: 'IT MIGHT COST YOU MORE' }, { start: 7.5, text: 'TO THE NEXT CUSTUMER' }, { start: 26.5, text: 'DEDICATED CUSTUMER SUPPORT' }], voiceover: [{ start: 0.4, text: 'Save ten dollars on Particle?' }, { start: 3.9, text: 'Here’s the problem.' }], issues: [] } : {}, usage: { promptTokenCount: 29448 } },
      issues: c.status === 'issues' ? issuesH1 : [],
      events: [{ id: 1, created_at: c.created_at, message: 'Checking Version 1 · 16x9 round 2' }, { id: 2, created_at: c.created_at, message: 'Posted 5 Frame.io comment(s)' }],
    };
  }
  if (p.endsWith('/rerun')) return { queued: true };
  if (p.startsWith('/issues/')) return { ok: true, learned: body?.feedback === 'not_a_typo' ? 99 : null };
  if (p === '/check') return { queued: true, job_id: 10 };
  if (p === '/brain') return method === 'POST' ? { item: body } : { items: brain };
  if (p.startsWith('/brain/')) return { ok: true };
  if (p === '/settings') return { settings: method === 'PUT' ? { ...settings, ...body, posting: { ...settings.posting, ...(body?.posting || {}) } } : settings };
  if (p === '/import') return { run: { id: 1, status: 'done', since: '2025-01-01', started_at: ago(400), finished_at: ago(200), plan: { frameio: { items: 1463 }, figma: { files: 12, items: 1081 }, learn: { phase: 'video', cost: { classify: 4.82, total: 4.82 }, counts: [{ source: 'frameio', cat: 'text', n: 3702, fixed: 0 }, { source: 'frameio', cat: 'creative', n: 5010 }, { source: 'figma', cat: 'text', n: 1405 }] } } }, progress: { done: 1476, all: 1476, failed: 0 }, assets: [{ source: 'frameio', n: 1180, items: 306 }, { source: 'figma', n: 480, items: 480 }], comments: [{ source: 'frameio', n: 2410, authors: 9 }, { source: 'figma', n: 1302, matched: 1104, authors: 7 }], authors: [{ author: 'Anton Shpakovskiy', n: 812 }, { author: 'Lilian Krumholz', n: 640 }, { author: 'Tomer Wilf Lezmy', n: 377 }], estimate: { total: 12.4 } };
  if (p === '/import/start') return { queued: true };
  if (p === '/frameio/connect') return { url: '#' };
  return {};
}
