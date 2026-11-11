/**
 * MEDIUM 🔮 settings: code defaults deep-merged with settings.medium_config (editable in /medium → What it learns from).
 * Board columns are the ones Medium writes (Medium spec §10); the corpus requester is whose briefs teach the house style.
 */
const db = require('../../db');
const { merge } = require('../captain/config');

const BOARDS = {
  video: {
    board_id: '5433027071',
    columns: {
      requester: 'person', product: 'label9', type: 'label4', department: 'label', platform: 'single_selectu06tevn', ratio: 'multi_select_Mjj2VFZH',
      duration: 'numeric_mm209bwg', hook: 'short_text_mkn8n4bx', brief: 'long_text_mkn8c1ax', script: 'long_text_Mjj2uK4g', priority: 'priority_mkm11w0a',
      campaign: 'dropdown_mm3n9vjc', editor: 'people',
    },
  },
  design: {
    board_id: '8036329818',
    columns: {
      requester: 'people_Mjj2RrZM', product: 'label9', brand: 'color_mm8q3pn9', department: 'status_1__1', product_line: 'dropdown_mm8q7ysv',
      campaign: 'dropdown_mm3n7bw1', platform: 'single_selectrz7230p', ratio: 'multi_select_Mjj2tEdu', copy: 'long_text_mkngjytf', brief: 'long_textpvqldjpg', designer: 'people',
    },
  },
};

const DEFAULTS = {
  // Off = shadow mode: briefs are written, checked and reviewed in CP, nothing is created on Monday (spec §14 phase 1)
  monday_submit: false,
  // Where Medium's tickets land (CP's token; lane in the name — Tomer's choices, 11 Nov 2026). "Form Requests" on both boards.
  monday_groups: { video: 'new_group__1', design: 'new_group__1' },
  // Weekly autopilot (spec §12): Sunday 07:00 Asia/Jerusalem Medium picks winners and queues briefs. Off until switched on.
  autopilot: { enabled: false, weekday: 0, hour: 7, per_week: 12 },
  // Weekly Growth digest to the creative Slack channel (spec §9.3). Off until switched on.
  digest: { enabled: false, weekday: 1, hour: 9 },
  corpus: { requesters: ['Lilian Krumholz'], since: '2026-03-15', thin_chars: 60 },
  // Separate test brands — never Particle lanes, never winners, peer sets, templates or transfers (spec §2)
  test_brands: [
    { name: 'Ashford', tokens: ['ashford'], campaigns: [], products: ['Testosterone and Hormone', 'Bone & Joint', 'Bone and Joint', 'Joint Mobility'] },
    { name: 'Levitas', tokens: ['levitas'], campaigns: ['Levitas 1.0'], products: [] },
    { name: 'Biomella', tokens: ['biomella'], campaigns: [], products: [] },
    { name: 'Blurr', tokens: ['blurr'], campaigns: [], products: [] },
  ],
  lane_mix: { Particle: { video: 3, static: 3 }, SFY: { video: 2, static: 2 }, GT: { video: 1, static: 0 }, WAC: { video: 0, static: 2 }, transfers: { video: 2, static: 2 } },
  caps: { per_week: 40, per_winner: 3, transfer_tests_per_product: 2 },
  models: { writer: 'claude-sonnet-5-5', analyst: 'claude-opus-5-5', scorer: 'claude-sonnet-5-5' },
  // The full house style guide (learned from the corpus). Empty = the built-in summary in prompts/writer.txt.
  style_guide: '',
  // Upspring account read pasted/synced in (data, never instructions) until the server-side Upspring connection exists
  upspring_snapshot: '',
  language_bank: [],
};

// The lanes come from Captain Caption's config, so a lane means the same thing in both
const { DEFAULTS: CAPTAIN } = require('../captain/config');
const LANES = CAPTAIN.lanes;

// What each lane's brief must carry and must never do (spec §5.4) — the writer follows it, the guardrails check it
const LANE_RULES = {
  Particle: { job: 'Sell the product or bundle now.', required: ['offer / price tier when there is a sale', 'a CTA', 'the B&A disclaimer whenever before & after is used'],
    never: ['angles the latest account read marks fatigued (generic "All Products", abstract / AI science visuals)'], first_line: null },
  SFY: { job: 'The ad qualifies the reader and earns the click; the article does the persuading.', required: ['the destination article URL as the first line ("Ad leads to:" for video, "Page:" for statics)', 'the article type (listicle / confession / explainer)', 'the SFY design system', '"No Particle branding anywhere" on statics'],
    never: ['a Particle logo or pack shot in statics (unless the article ranks the product)', 'a claim the article does not make'], first_line: { video: 'Ad leads to:', design: 'Page:' } },
  GT: { job: 'Curiosity about the ranking; the article reveals Particle.', required: ['the GT article URL', 'an end card showing the article on a phone', 'a CTA like "See which cologne she picked."'],
    never: ['revealing the #1 product in the ad'], first_line: { video: 'Ad leads to:', design: 'Page:' } },
  WAC: { job: 'Occasion- and identity-driven cologne listicles that lead to Gravité.', required: ['the WAC article URL as the first line ("Page:")', 'the WAC look and feel', 'headline V1–V3'],
    never: ['revealing the #1 product (keep the lead bottle concealed)', 'B&W couples for attraction angles'], first_line: { video: 'Ad leads to:', design: 'Page:' } },
};

const MOVES = {
  ITERATE: 'Keep the proven body, write 4–6 new hooks (the hook is the weak link or the ad is 30+ days live).',
  REFRESH: 'Same concept, new people and execution — the winner is fatiguing.',
  TRANSFER_PRODUCT: 'Take a winning concept to another product in the same lane — one variable only.',
  TRANSFER_LANE: 'Take a winning concept to another lane for the same product — one variable only.',
  TRANSFER_FORMAT: 'Turn a video winner into a static set, or the reverse.',
  REVIVE: 'A never-ran sibling of a current winner, brought back.',
  NEW_ANGLE: 'An underused angle or a category gap (at most 20% of a batch).',
};

const PRODUCTS = ['Face Cream', 'Instant Eye Firming Cream', 'Neck Cream', 'Hand Cream', 'Face Mask', 'Anti-Gray Serum', 'Hair Revival Kit', 'Thickening Shampoo', 'NeoRoot',
  'Gravité', 'Varros', 'Gravité Deodorant', 'Bold Moves', 'Shaving Gel', 'Face Wash', 'Face Shield', 'Lip Balm', 'Ab Firming Cream', 'Body Firming Cream', 'Eye Bag Killer Set',
  "Golfer's Bundle", 'Lady Killer Kit', 'Skin Vitamin Gummies', 'Hair Vitamin Gummies'];

// Seed: named layouts from the corpus (house style §8)
const TEMPLATES = [
  ['Respect Your Face', 'static', 'Navy header bar, white headline, light-blue italic subtitle, split-face B&A of one man', ['respect your face']],
  ['5 Bucks. 5 Problems.', 'static', 'Generic product with red ✘ list vs Particle with blue ✔ list', ['5 bucks']],
  ['Receipt Vertical', 'static', 'Pill, headline, line item with strikethrough price, shipping, savings, total', ['receipt']],
  ['Hero 25 / Hero 30', 'static', 'Black Friday hero layouts by discount tier', ['hero 25', 'hero 30', 'hero25', 'hero30']],
  ['Search Bar', 'static', 'Real-query search bar + product cards (search-result style)', ['search bar', 'search result']],
  ['Ask Me Anything sticker', 'static', 'Expert/coach face, native IG question sticker, answer line, nothing else', ['ask me anything', 'ama sticker', 'question sticker']],
  ['Persona Slogan (locked)', 'static', 'Same action shot, environment + slogan change per persona', ['locked design', 'persona slogan']],
  ['Icon Grid "N Signs"', 'static', 'Age-anchored headline, 4×2 icon grid, closing line, soft CTA', ['icon grid', 'signs']],
  ['Seed strikethrough', 'static', 'Strikethrough price + benefit list', ['strikethrough']],
  ['Women Lie (Gravité Deo)', 'static', 'Product static with the "women lie" hook', ['women lie']],
  ['iPhone Notes overlay', 'static', 'Woman with Notes-app text overlay', ['notes app', 'iphone notes']],
  ['Top 5 podium / Top 5 GIF', 'gif', 'Listicle teaser (GT/WAC)', ['top 5', 'podium']],
  ['Mars Men multi-product', 'static', 'Catalogue-style multi-product layout', ['mars men']],
  ['Stop Motion catalogue GIFs', 'gif', 'Product stop-motion for catalogue ads', ['stop motion']],
  ['Kizik live demo', 'video', 'Bold claim + product → live demo with timer → resolution → durability', ['kizik']],
  ['Hello Klean CGI demo', 'video', '~15s CGI product, no people, text overlays carry it', ['hello klean', 'cgi demo']],
  ['Hello Klean testimonial relay', 'video', 'Split-screen speakers hand the story to each other', ['testimonial relay', 'relay']],
  ['Rabanne macro notes', 'video', '~6s CGI macro of scent notes, labels, end on bottle', ['rabanne', 'macro']],
  ['Podcast split-screen hook', 'video', 'Question card → podcaster answer → cut to body', ['podcast']],
];

// Seed: outside brands whose structure is borrowed (house style §7)
const DONORS = [
  ['Kizik', 'live demo with timer'], ['Hello Klean', 'CGI product demo; split-screen testimonial relay'], ['Rabanne One Million', 'macro scent-notes'],
  ['Saltair', 'search-result format'], ['Haus', 'greenscreen reaction'], ['Mars Men', 'multi-product catalogue'], ['Seed', 'strikethrough price + benefits'],
  ['Thorne', 'clinical credibility'], ['RYZE', 'native UGC voice'], ['Beekman 1802', 'founder story'], ['Forge Men', '"three quick reasons", greenscreen product page'],
  ['Lumin', 'men\'s skincare comparison'], ['Nutrafol', 'expert-led hair proof'],
];

const PERSONAS = ['Younger', 'Silver Executive', 'Specialized Professional', 'Mid-Career Climber', 'Business Traveler', 'Dad', 'Golfer', 'Retired'];

// Seed: product clusters and starting transfer scores (spec §6.2) — learned from tests later
const AFFINITY = [
  ['aging', 'Face Cream', 'Neck Cream', 0.8], ['aging', 'Face Cream', 'Hand Cream', 0.75], ['aging', 'Face Cream', 'Instant Eye Firming Cream', 0.85],
  ['aging', 'Instant Eye Firming Cream', 'Face Cream', 0.8], ['aging', 'Instant Eye Firming Cream', 'Neck Cream', 0.7], ['aging', 'Neck Cream', 'Face Cream', 0.6],
  ['aging', 'Hand Cream', 'Face Cream', 0.6], ['aging', 'Face Cream', 'Face Mask', 0.5], ['aging', 'Face Cream', 'Anti-Gray Serum', 0.3],
  ['hair', 'Hair Revival Kit', 'Thickening Shampoo', 0.7], ['hair', 'Hair Revival Kit', 'NeoRoot', 0.75], ['hair', 'Thickening Shampoo', 'Hair Revival Kit', 0.65],
  ['hair', 'Anti-Gray Serum', 'Hair Revival Kit', 0.5], ['hair', 'NeoRoot', 'Hair Revival Kit', 0.75],
  ['fragrance', 'Gravité', 'Varros', 0.6, 'only when the concept is not built on "bold/night" — Varros is daytime/fresh'], ['fragrance', 'Gravité', 'Gravité Deodorant', 0.7],
  ['fragrance', 'Gravité', 'Bold Moves', 0.75], ['fragrance', 'Varros', 'Gravité', 0.55],
  ['shave', 'Shaving Gel', 'Face Wash', 0.6], ['shave', 'Face Wash', 'Shaving Gel', 0.6], ['shave', 'Shaving Gel', 'Face Shield', 0.5],
];

// Seed: what the house style assumes but our own account hasn't proven yet (assumption ledger)
const BELIEFS = [
  ['A man 55–65 is the default talent; "Younger" (30–45) is a named test persona.', 'The most common age band across the corpus.', 'A Younger cell beating 55–65 on the same body.'],
  ['Native and real beats polished — iPhone feel, real bathroom, not overly retouched.', 'House style across the corpus.', 'A polished cell beating native on the same concept.'],
  ['Money-back guarantee and free shipping belong on DTC end cards.', '190+ and 165+ mentions in the corpus.', 'An end-card test without them holding conversion.'],
  ['Subtitles on by default for video.', 'House style.', 'A no-subtitle cell matching hook and hold rates.'],
  ['Comparison props are always generic — never a real brand or label.', 'House style and brand safety.', 'Legal guidance changing.'],
  ['Theme alone doesn\'t sell holidays — each holiday brief needs a product benefit or a gift job.', 'Theme-only holiday ads fatigued (account read).', 'A theme-only holiday ad reaching the 60th percentile.'],
];

async function getConfig(brandId = 'particle') {
  const { rows } = await db.query('SELECT medium_config FROM settings WHERE brand_id = $1', [brandId]).catch(() => ({ rows: [] }));
  const saved = rows[0]?.medium_config;
  return merge(DEFAULTS, typeof saved === 'string' ? JSON.parse(saved) : saved);
}

const EDITABLE = ['monday_submit', 'monday_groups', 'autopilot', 'digest', 'corpus', 'test_brands', 'lane_mix', 'caps', 'models', 'style_guide', 'upspring_snapshot', 'language_bank'];
async function saveConfig(patch, brandId = 'particle') {
  const clean = Object.fromEntries(Object.entries(patch || {}).filter(([k]) => EDITABLE.includes(k)));
  if ('style_guide' in clean && String(clean.style_guide).length > 60000) throw Object.assign(new Error('The style guide is too long (60,000 characters at most)'), { status: 400 });
  if ('monday_submit' in clean) clean.monday_submit = !!clean.monday_submit;
  const { rows } = await db.query('SELECT medium_config FROM settings WHERE brand_id = $1', [brandId]);
  const current = rows[0]?.medium_config || {};
  // arrays and long text replace, objects merge
  const next = merge(typeof current === 'string' ? JSON.parse(current) : current, clean);
  await db.query('UPDATE settings SET medium_config = $1 WHERE brand_id = $2', [JSON.stringify(next), brandId]);
  return getConfig(brandId);
}

/** Put the seed rows in once (templates, donors, affinity, beliefs) — never overwrites what the team changed. */
async function seed() {
  for (const [name, format, description, match] of TEMPLATES) {
    await db.query('INSERT INTO medium_templates (name, format, description, match) VALUES ($1,$2,$3,$4) ON CONFLICT (name) DO NOTHING', [name, format, description, match]);
  }
  for (const [brand, takes] of DONORS) await db.query('INSERT INTO medium_donors (brand, takes) VALUES ($1,$2) ON CONFLICT (brand) DO NOTHING', [brand, takes]);
  for (const [cluster, source, target, score, note] of AFFINITY) {
    await db.query('INSERT INTO medium_affinity (cluster, source, target, score, note) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (source, target) DO NOTHING', [cluster, source, target, score, note || null]);
  }
  const { rows } = await db.query('SELECT COUNT(*)::int AS n FROM medium_beliefs');
  if (!rows[0].n) for (const [claim, because, change] of BELIEFS) await db.query('INSERT INTO medium_beliefs (claim, because, change_condition) VALUES ($1,$2,$3)', [claim, because, change]);
}

module.exports = { BOARDS, DEFAULTS, LANES, LANE_RULES, MOVES, PRODUCTS, TEMPLATES, DONORS, PERSONAS, AFFINITY, BELIEFS, getConfig, saveConfig, seed };
