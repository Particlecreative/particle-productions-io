// Studio — who fits a ticket, learned from history.   cd backend && node --test test/studioFit.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildModel, fitOne, workdays, rowOf } = require('../src/lib/studio/fit');

const TODAY = '2026-11-16';
const row = (people, o = {}) => ({ id: String(Math.random()), board: 'video', people, req: o.req || [], type: o.type || '', product: o.product || '', brand: o.brand || 'Particle', platform: o.platform || 'Meta', dept: o.dept || 'Marketing/Media', days: o.days ?? 2, done: o.done || '2026-11-01' });
const rows = [
  ...Array.from({ length: 14 }, () => row(['yael'], { req: ['lilian'], type: 'AI Creator', product: 'Face Cream', days: 2 })),
  ...Array.from({ length: 6 }, () => row(['yael'], { req: ['tomer'], type: 'Iterations/Cuts/Edits', product: 'Gravité', days: 1 })),
  ...Array.from({ length: 9 }, () => row(['doron'], { req: ['tomer'], type: 'Iterations/Cuts/Edits', product: 'Gravité', days: 1 })),
  ...Array.from({ length: 5 }, () => row(['doron'], { req: ['lilian'], type: 'Script (<1 min)', product: 'Bone & Joint', brand: 'Ashford', days: 3 })),
  ...Array.from({ length: 4 }, () => row(['omri'], { req: ['lilian'], type: 'AI Creator', product: 'Neck Cream', days: 3, done: '2026-06-01' })),   // not active lately
];
const model = buildModel(rows, TODAY);

test('the brain: who did what — and someone with nothing finished in 90 days isn\'t suggested', () => {
  assert.deepEqual(Object.keys(model.people).sort(), ['doron', 'yael']);
  assert.equal(model.people.yael.n, 20);
  assert.equal(model.people.yael.req.lilian, 14);
});

test("Lilian's AI Creator video for Face Cream → Yael first, with the reasons", () => {
  const [best, next] = fitOne(model, { board: 'video', type: 'AI Creator', product: 'Face Cream', brand: 'Particle', requested_by: ['lilian'] }, { today: TODAY });
  assert.equal(best.person, 'yael');
  assert.equal(next.person, 'doron');
  assert.deepEqual(best.reasons.map(r => r.kind), ['req', 'type', 'product']);
  assert.deepEqual(best.reasons[0], { kind: 'req', id: 'lilian', n: 14, of: 23 });   // of all Lilian's tickets, a former editor's too
  assert.equal(best.days, 2);                    // their usual for this type
  assert.equal(best.days_from, 'theirs');
});

test('an Ashford script → Doron (the brand and the type are his); the house brand is never a "skill"', () => {
  const [best] = fitOne(model, { board: 'video', type: 'Script (<1 min)', product: 'Bone & Joint', brand: 'Ashford', requested_by: ['lilian'] }, { today: TODAY });
  assert.equal(best.person, 'doron');
  assert.ok(best.reasons.some(r => r.kind === 'brand' && r.n === 5));
  assert.equal(best.days, 3);
  const [p] = fitOne(model, { board: 'video', type: 'AI Creator', brand: 'Particle', requested_by: [] }, { today: TODAY });
  assert.ok(!p.reasons.some(r => r.kind === 'brand'));
});

test("Tomer's Gravité edit → Doron (did 9 of Tomer's 15) ahead of Yael", () => {
  const fits = fitOne(model, { board: 'video', type: 'Iterations/Cuts/Edits', product: 'Gravité', requested_by: ['tomer'] }, { today: TODAY });
  assert.deepEqual(fits.map(f => f.person), ['doron', 'yael']);
  assert.equal(fits[0].days, 1);
});

test('working days are Sunday–Thursday', () => {
  assert.equal(workdays('2026-11-15', '2026-11-19'), 5);   // Sun → Thu
  assert.equal(workdays('2026-11-19', '2026-11-22'), 2);   // Thu, (Fri, Sat), Sun
  assert.equal(workdays('2026-11-20', '2026-11-21'), 0);
  assert.equal(workdays(null, '2026-11-21'), 0);
});

test('a Monday item → a history row (product from the new dropdown first, brand from the Brands column)', () => {
  const board = { columns: { person: 'people', requested_by: 'person', type: 'label4', product: 'label9', product_dropdown: 'dd', platform: 'plat', department: 'label', timeline: 'tl', brand_status: 'br' } };
  const r = rowOf({ id: 1, name: 'Ashford | Bone & Joint | Meta | Would You Date Him', column_values: [
    { id: 'people', persons_and_teams: [{ id: 7, kind: 'person' }] }, { id: 'person', persons_and_teams: [{ id: 9, kind: 'person' }] },
    { id: 'label4', label: 'Script (<1 min)' }, { id: 'label9', label: '-' }, { id: 'dd', text: 'Bone & Joint', values: [{ label: 'Bone & Joint' }] },
    { id: 'plat', label: 'Meta' }, { id: 'label', label: 'Marketing/Media' }, { id: 'tl', from: '2026-11-09', to: '2026-11-11' }, { id: 'br', label: 'Ashford' },
  ] }, board, 'video');
  assert.deepEqual({ people: r.people, req: r.req, type: r.type, product: r.product, brand: r.brand, days: r.days, done: r.done },
    { people: ['7'], req: ['9'], type: 'Script (<1 min)', product: 'Bone & Joint', brand: 'Ashford', days: 3, done: '2026-11-11' });
});
