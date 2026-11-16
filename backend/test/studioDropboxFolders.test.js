// Studio — a new ticket's Dropbox folder goes where today's folders go.   cd backend && node --test test/studioDropboxFolders.test.js
// Every expected path below is a real folder the old script made (16 Nov 2026 research), with the product/concept it was made for.
const test = require('node:test');
const assert = require('node:assert/strict');
const F = require('../src/lib/studio/dropboxFolders');

const NOV16 = new Date('2026-11-16T12:00:00Z');
const OCT21 = new Date('2026-10-21T12:00:00Z');
const B = '/Creative Assets 2026 - MV Sync';

test('Marketing video and design: department › Products › product › Video|Image › platform › MM_Month YYYY › concept', () => {
  assert.equal(F.folderPath({ board: 'video', department: 'Marketing/Media', product: 'Gravité', platform: 'Meta', concept: 'The Last Spritz', when: NOV16 }),
    `${B}/Marketing Ads/Products/Gravité/Video/Meta/11_November 2026/The Last Spritz`);
  assert.equal(F.folderPath({ board: 'design', department: 'Marketing', product: 'Instant Eye Firming Cream', platform: 'Meta', concept: 'IEFC Search Bar', when: OCT21 }),
    `${B}/Marketing Ads/Products/Instant Eye Firming Cream/Image/Meta/10_October 2026/IEFC Search Bar`);
  assert.equal(F.folderPath({ board: 'video', department: 'Marketing/Media', product: 'Testosterone and Hormone', platform: 'Meta', concept: '“Built for This” (ancestral explainer)', when: NOV16 }),
    `${B}/Marketing Ads/Products/Testosterone and Hormone/Video/Meta/11_November 2026/“Built for This” (ancestral explainer)`);
});

test('bundles, kits and sets go under Bundles; Multiple Products and non-product tasks under Other', () => {
  assert.equal(F.folderPath({ board: 'video', department: 'Marketing/Media', product: 'Lady Killer Kit', platform: 'GIF | Meta', concept: 'iMessage GIF 25% Off', when: NOV16 }),
    `${B}/Marketing Ads/Bundles/Lady Killer Kit/Video/GIF | Meta/11_November 2026/iMessage GIF 25% Off`);
  assert.equal(F.categoryOf('Gravite Bundle'), 'Bundles');
  assert.equal(F.categoryOf('Eye Bag-Killer Set'), 'Bundles');
  assert.equal(F.categoryOf('Hair Revival Kit'), 'Bundles');
  assert.equal(F.categoryOf('Face Cream'), 'Products');
  assert.equal(F.folderPath({ board: 'design', department: 'Socials', product: 'Multiple Products', platform: 'Other', concept: 'Neon Bumper 25% Off', when: NOV16 }),
    `${B}/Marketing Ads/Other/Multiple Products/Image/Other/11_November 2026/Neon Bumper 25% Off`);
});

test('Website: its own branch, the website task for design, no platform or month', () => {
  assert.equal(F.folderPath({ board: 'design', department: 'Website', product: 'Face Cream', platform: 'Meta', websiteTask: 'PDP', concept: 'Main Gallery Images', when: NOV16 }),
    `${B}/Website/Products/Face Cream/Image/PDP/Main Gallery Images`);
  assert.equal(F.folderPath({ board: 'design', department: 'Website', product: 'Not a Product Task', websiteTask: '', concept: 'Main Images', when: NOV16 }),
    `${B}/Website/Other/Not a Product Task/Image/Other/Main Images`);
  assert.equal(F.folderPath({ board: 'video', department: 'Website', product: 'Face Cream', platform: 'Other', concept: 'Before & After in Spanish (GIF)', when: NOV16 }),
    `${B}/Website/Products/Face Cream/Video/Before & After in Spanish (GIF)`);
});

test('other video departments land in Unknown (as today); TV has its own; design departments all go to Marketing Ads', () => {
  assert.equal(F.folderPath({ board: 'video', department: 'Socials', product: 'Multiple Products', platform: 'Other', concept: 'Amazon UK Launch Big Ben GIF', when: NOV16 }),
    `${B}/Unknown/Other/Multiple Products/Video/Other/11_November 2026/Amazon UK Launch Big Ben GIF`);
  assert.equal(F.folderPath({ board: 'video', department: '', product: 'Antifungal Nail Repair', platform: 'Meta', concept: 'Yellow, Thick Toenails 15% Off', when: NOV16 }),
    `${B}/Unknown/Products/Antifungal Nail Repair/Video/Meta/11_November 2026/Yellow, Thick Toenails 15% Off`);
  assert.equal(F.folderPath({ board: 'video', department: 'TV', product: 'Face Cream', platform: 'Other', concept: 'Comedy Export', when: OCT21 }),
    `${B}/TV/Products/Face Cream/October 2026/Comedy Export`);
  assert.equal(F.folderPath({ board: 'design', department: 'Ulta', product: 'Instant Eye Firming Cream', platform: 'Other', concept: 'B&A', when: NOV16 }),
    `${B}/Marketing Ads/Products/Instant Eye Firming Cream/Image/Other/11_November 2026/B&A`);
});

test('names Dropbox takes: quotes and question marks out, "/" never makes a sub-folder; no product → Unknown Product; no platform → Other', () => {
  assert.equal(F.clean('Video 3 – "The One He\'ll Actually Wear" (48s)'), 'Video 3 – The One He\'ll Actually Wear (48s)');
  assert.equal(F.clean('Tired of Hiding Your Feet? (Winter)'), 'Tired of Hiding Your Feet (Winter)');
  assert.equal(F.clean('“It’s Not Your Age” (annotated before/after)'), '“It’s Not Your Age” (annotated before-after)');
  assert.equal(F.clean('Ends with dots...  '), 'Ends with dots');
  assert.equal(F.conceptOf('Face Cream | Black Friday 2026 | Meta | Claude | Three Quick Reasons'), 'Three Quick Reasons');
  assert.equal(F.folderPath({ board: 'video', department: 'Marketing/Media', product: '', platform: '', concept: 'X', when: NOV16 }),
    `${B}/Marketing Ads/Products/Unknown Product/Video/Other/11_November 2026/X`);
  assert.equal(F.folderPath({ board: 'video', department: 'Marketing/Media', product: '-', platform: 'Meta', concept: '', when: NOV16 }),
    `${B}/Marketing Ads/Products/Unknown Product/Video/Meta/11_November 2026/Untitled`);
});

test('the month is Israel time — 31 Oct 23:30 UTC is already November', () => {
  assert.deepEqual(F.monthOf(new Date('2026-10-31T23:30:00Z')), { mm: '11', name: 'November', year: '2026' });
  assert.deepEqual(F.monthOf(new Date('2026-12-31T21:59:00Z')), { mm: '12', name: 'December', year: '2026' });
});

test('a ticket is never blocked by Dropbox: not connected → no folder (null)', async () => {
  const secrets = require('../src/lib/studio/secrets');
  const t = test.mock.method(secrets, 'getSecret', async () => null);
  F.reset();
  assert.equal(await F.createTicketFolder({ board: 'video', department: 'Marketing/Media', product: 'Gravité', platform: 'Meta', itemName: 'Gravité | Meta | X' }), null);
  t.mock.restore();
});
