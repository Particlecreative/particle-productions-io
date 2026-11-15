// MEDIUM × Higgsfield Ads Studio story films — pure parts.   cd backend && node --test test/mediumHiggsfield.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('../src/lib/medium/higgsfield');
const W = require('../src/lib/medium/writer');
const M = require('../src/lib/medium/monday');

// a slice of the real catalog (ads_studio_story_presets, 15 Nov 2026)
const RAW = {
  styles: [
    { id: 'sing', title: 'Singing ads', command: '/singing-ads' },
    { id: 'md', title: 'Micro drama', subtitle: 'A live-action mini drama shot like a film' },
    { id: 'cart', title: 'Cartoon story', subtitle: 'A 3D cartoon told by its hero' },
    { id: 'cin', title: 'Cinematic story', subtitle: 'The hero tells their story over cinematic scenes' },
  ],
  cards: [
    { id: 'c-sing', style_id: 'sing', title: 'GLIM - Tooth Whitener' },
    { id: 'c-fam', style_id: 'md', title: 'Family sabotage', subtitle: "The user's product beats a sibling's sabotage", settings: { duration_seconds: 240 }, preview: { poster_url: 'https://x/p.webp' } },
    { id: 'c-trap', style_id: 'md', title: 'Trap backfires', subtitle: 'A smug rival mocks the hero', settings: { duration_seconds: 120 } },
    { id: 'c-bear', style_id: 'cart', title: 'Bear proof', subtitle: 'An absurd problem', settings: { duration_seconds: 55 } },
    { id: 'c-lost', style_id: 'cin', title: 'Lost and found', settings: { duration_seconds: 115 } },
  ],
};
const PRODUCTS = [
  { product_id: 'p-fc', name: 'Particle Face Cream', price: '$69.00', images_count: 4, texts_ready: true },
  { product_id: 'p-sh', name: 'Particle Hair Thickening Shampoo', images_count: 3, texts_ready: true },
  { product_id: 'p-gr', name: 'Particle Gravité Cologne', images_count: 4, texts_ready: true },
  { product_id: 'p-x', name: 'Particle Neck Cream', images_count: 3, texts_ready: false },
];
const cat = H.shapeCatalog(RAW, { brand: { brand_id: 'b1', name: 'Particle for Men' }, products: PRODUCTS });

test('catalog: dramas only (no singing ads), realistic vs stylized, products mapped to Medium names', () => {
  assert.deepEqual(cat.styles.map(s => [s.title, s.realistic]), [['Micro drama', true], ['Cartoon story', false], ['Cinematic story', true]]);
  assert.deepEqual(cat.cards.map(c => c.id), ['c-fam', 'c-trap', 'c-bear', 'c-lost']);
  assert.equal(cat.cards[0].seconds, 240);
  assert.equal(cat.cards[0].poster, 'https://x/p.webp');
  assert.deepEqual(cat.products.map(p => p.product), ['Face Cream', 'Thickening Shampoo', 'Gravité', 'Neck Cream']);
  assert.equal(cat.products[3].ready, false);
  assert.equal(H.mediumProduct('Starter Bundle'), 'Starter Bundle');
});

test('what changed: new and removed cards, styles and products', () => {
  assert.equal(H.diffCatalog(null, cat).first, true);
  const next = { ...cat, cards: [...cat.cards.filter(c => c.id !== 'c-trap'), { id: 'c-new', title: 'Second chance', style: 'Micro drama' }] };
  const d = H.diffCatalog(cat, next);
  assert.deepEqual(d.added_cards, [{ id: 'c-new', title: 'Second chance', style: 'Micro drama' }]);
  assert.deepEqual(d.removed_cards.map(x => x.id), ['c-trap']);
  assert.equal(H.hasChanges(d), true);
  assert.equal(H.hasChanges(H.diffCatalog(cat, cat)), false);
});

test('lengths: 40 / 60 / 90 / 2 min, ~15 s clips', () => {
  assert.deepEqual([45, 60, 75, 100, 200].map(H.lengthOf), [40, 60, 60, 90, 120]);
  assert.deepEqual([40, 60, 90, 120].map(H.clipsFor), [3, 4, 6, 8]);
});

test('the daily pick: mostly realistic, new cards first, products take turns, never a product without copy', () => {
  // realistic only
  const a = H.pickDaily({ catalog: cat, n: 3, realisticShare: 1, topProducts: ['Gravité', 'Face Cream'] });
  assert.ok(a.every(x => x.card.realistic));
  assert.deepEqual(a.map(x => x.product.product), ['Gravité', 'Face Cream', 'Thickening Shampoo']);
  assert.ok(!a.some(x => x.product.product === 'Neck Cream'));                 // its Ads Studio copy isn't ready
  // a card new in Ads Studio goes first
  const b = H.pickDaily({ catalog: cat, n: 1, realisticShare: 1, added: ['c-lost'] });
  assert.equal(b[0].card.id, 'c-lost');
  assert.equal(b[0].fresh, true);
  // least-used card next
  const c = H.pickDaily({ catalog: cat, n: 1, realisticShare: 1, used: { 'c-fam': 3, 'c-lost': 1 } });
  assert.equal(c[0].card.id, 'c-trap');
  // 80% realistic → every 5th is stylized; 0 → all stylized
  const d = H.pickDaily({ catalog: cat, n: 5, realisticShare: 0.8, dayIndex: 0 });
  assert.deepEqual(d.map(x => x.card.realistic), [true, true, true, true, false]);
  assert.ok(H.pickDaily({ catalog: cat, n: 2, realisticShare: 0 }).every(x => !x.card.realistic));
  assert.deepEqual(H.pickDaily({ catalog: { cards: [], products: [] }, n: 2 }), []);
});

test('the writer gets the film instructions: length, clips, look, card, product, Ads Studio steps', () => {
  const block = W.dramaBlock({ product: 'Face Cream', higgsfield: { card_title: 'Family sabotage', card_subtitle: 'beats a sabotage', style: 'Micro drama', realistic: true, product_name: 'Particle Face Cream', length: 120, card_seconds: 240, recipe: 'ACT ONE: …' } });
  assert.match(block, /Length: 120 seconds, 9×16, 1080p, built from 8 clips/);
  assert.match(block, /105–120s\)/);
  assert.match(block, /Realistic live action/);
  assert.match(block, /card “Family sabotage”/);
  assert.match(block, /runs 240s; compress the arc to 120s/);
  assert.match(block, /MAKE IT IN HIGGSFIELD ADS STUDIO/);
  assert.match(block, /product “Particle Face Cream”/);
  assert.match(block, /ACT ONE: …/);
  const cartoon = W.dramaBlock({ product: 'Gravité', higgsfield: { style: 'Cartoon story', realistic: false, length: 60 } });
  assert.match(cartoon, /Cartoon story — keep the card's look/);
  assert.match(cartoon, /4 clips/);
  assert.match(cartoon, /\(not available — write the story from the card line above\)/);
});

test('Monday: a Higgsfield film is an "AI Project" on Video Projects', () => {
  const labels = { label9: ['Face Cream'], label4: ['AI Project', 'AI Creator', 'Iterations/Cuts/Edits'], label: ['Marketing/Media'], single_selectu06tevn: ['Meta'] };
  const { values } = M.columnValues({ format: 'video', product: 'Face Cream', fields: { video_type: 'Higgsfield micro drama' } }, { labels });
  assert.deepEqual(values.label4, { label: 'AI Project' });
});
