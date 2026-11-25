// Studio — a new video ticket's Frame.io folder goes where the team puts them.   cd backend && node --test test/studioFrameFolders.test.js
// Every folder name below is a real one, read in the Frame.io account on 25 Nov 2026.
const test = require('node:test');
const assert = require('node:assert/strict');
const F = require('../src/lib/studio/frameFolders');

const NOV25 = new Date('2026-11-25T12:00:00Z');
const DEC02 = new Date('2026-12-02T09:00:00Z');
const YEARS = ['2026', '2025', '2024'];
const MONTHS_2026 = ['11_November', '10_October', 'September', '08_August', 'July', '06_June', '05_May', '04_April', 'March', 'February', 'January'];
const NOV_PRODUCTS = ['Colour Lab AI', 'Clearstep', 'Gravité Cologne', 'Multiple Products', 'WEBSITE BANNER', 'Not a Product Task', 'BIOMELLA', 'Infinite Male',
  'Lady Killer Set', 'neck cream', 'Gravite bundle', 'Shaving Gel', 'Deodorant', 'Body Wash', 'Ab Firming Cream', 'Hand cream', 'Bumper ads', 'Shampoo',
  "Ultimate Men's Gift Bundle", 'Instant Eye Firming Cream', 'Anti Gray Serum', 'Test Product', 'Face Cream', 'NeoRoot', 'gravite', 'Face Wash'];
const PRODUCTIONS_TOP = ['3D', '4th of July', 'AGS_AI_2026', 'Anti Gray Serum', 'Black Friday', 'black friday 2026', 'BLURR', 'Born bare', 'Born Bare', 'Brandformance',
  'Dont Turn Around', 'FaceCream', 'Gravite', 'Hand Cream', 'Memorial Day Sale', 'New Years', 'Others', 'Re-Branding', 'Shaving Gel', 'SOUND TEST', 'Sunscreen', 'TV Template'];
const GRAVITE_COMMERCIALS = ['Adapt TV Commercials to Australia', 'Bending Time', 'Droplets of Greatness', 'Elevator', 'Gravite AI', 'Gravite Excitment',
  'Gravité Testomonials new Bar', 'Heart Rate', "Re-Edit commercial", "She Won't Have to"];

test('a video ticket: Video / year / month / product / the ticket name without the pipes', () => {
  const p = F.folderPlan({ department: 'Marketing/Media', brand: 'Particle', product: 'Instant Eye Firming Cream', when: NOV25,
    itemName: 'Instant Eye Firming Cream | CGI Mechanism Videos | Meta | CGI Mechanism V2',
    lists: { years: YEARS, months: MONTHS_2026, products: NOV_PRODUCTS, tickets: [] } });
  assert.equal(p.project, 'video');
  assert.deepEqual(p.parts, ['2026', '11_November', 'Instant Eye Firming Cream', 'Instant Eye Firming Cream CGI Mechanism Videos Meta CGI Mechanism V2']);
});

test('the ticket name keeps its apostrophes, dashes and quotes — only the pipes go', () => {
  assert.equal(F.folderName("Face Cream | Creators Nov '26 | Meta | Andrew Goff Face Cream UGC Edit — Straight Cut x2 Hooks"),
    "Face Cream Creators Nov '26 Meta Andrew Goff Face Cream UGC Edit — Straight Cut x2 Hooks");
  assert.equal(F.folderName('Gravité | ChatGPT | Gravité TV Commercial She Won\'t Have To'), "Gravité ChatGPT Gravité TV Commercial She Won't Have To");
  assert.equal(F.folderName('Face Cream | before/after | Meta'), 'Face Cream before-after Meta');
});

test('the product folder that is already there wins, whatever its spelling', () => {
  assert.equal(F.productFolder(NOV_PRODUCTS, 'Gravité', 'Particle'), 'gravite');
  assert.equal(F.productFolder(NOV_PRODUCTS, 'Hand Cream', 'Particle'), 'Hand cream');
  assert.equal(F.productFolder(NOV_PRODUCTS, 'Neck Cream', 'Particle'), 'neck cream');
  assert.equal(F.productFolder(NOV_PRODUCTS, 'Not a Product Task', 'Particle'), 'Not a Product Task');
  assert.equal(F.productFolder(NOV_PRODUCTS, 'Hair Revival Kit', 'Particle'), 'Hair Revival Kit');   // new → its own name
  assert.equal(F.productFolder([], 'Face Cream', 'Particle'), 'Face Cream');
});

test("a sister brand's ticket goes in its brand's folder, else gets the brand in front", () => {
  assert.equal(F.productFolder(NOV_PRODUCTS, 'Face Cream', 'Biomella'), 'BIOMELLA');
  assert.equal(F.productFolder(['Face Cream'], 'Face Cream', 'Levitas'), 'Levitas Face Cream');
  assert.equal(F.productFolder(NOV_PRODUCTS, 'Antifungal Foot Treatment', 'Clearstep'), 'Clearstep');
});

test('a new month: "12_December" (and a year folder when there is none)', () => {
  assert.equal(F.monthFolder(MONTHS_2026, DEC02), '12_December');
  assert.equal(F.monthFolder(MONTHS_2026, new Date('2026-07-10T12:00:00Z')), 'July');        // the one that's there
  assert.equal(F.monthFolder(['11. November'], NOV25), '11. November');
  const p = F.folderPlan({ department: 'Socials', product: 'Face Cream', itemName: 'Face Cream | Meta | X', when: new Date('2027-01-04T12:00:00Z'), lists: { years: YEARS } });
  assert.deepEqual(p.parts.slice(0, 2), ['2027', '01_January']);
});

test('two tickets with the same name share one folder', () => {
  const name = "Face Cream | Creators Nov '26 | Meta | Andrew Goff Face Cream UGC Edit — Enhanced Cut x2 Hooks";
  const p = F.folderPlan({ department: 'Marketing/Media', product: 'Face Cream', itemName: name, when: NOV25,
    lists: { years: YEARS, months: MONTHS_2026, products: NOV_PRODUCTS, tickets: [F.folderName(name)] } });
  assert.equal(p.parts[3], F.folderName(name));
  assert.equal(p.reuse, true);
});

test("TV: Productions / product / the commercial — the commercial's folder is shared and reused", () => {
  const p = F.folderPlan({ department: 'TV', brand: 'Particle', product: 'Gravité', itemName: "Gravité | ChatGPT | Gravité TV Commercial She Won't Have To",
    lists: { top: PRODUCTIONS_TOP, commercials: GRAVITE_COMMERCIALS } });
  assert.equal(p.project, 'productions');
  assert.deepEqual(p.parts, ['Gravite', "She Won't Have to"]);
  // Face Cream's folder is "FaceCream"
  const fc = F.folderPlan({ department: 'TV', product: 'Face Cream', itemName: 'Face Cream | TV | Face Cream TV Commercial Elevator Pitch', lists: { top: PRODUCTIONS_TOP, commercials: [] } });
  assert.deepEqual(fc.parts, ['FaceCream', 'Elevator Pitch']);
});

test("TV: a campaign that has its own folder in Productions goes there", () => {
  const p = F.folderPlan({ department: 'TV', product: 'Gravité', campaigns: ['Black Friday 2026'], itemName: 'Gravité | Black Friday 2026 | Gravité TV Black Friday 30s Commercial',
    lists: { top: PRODUCTIONS_TOP, commercials: [] } });
  assert.deepEqual(p.parts, ['black friday 2026', 'Black Friday 30s']);
  // a campaign with no folder → the product's
  const q = F.folderPlan({ department: 'TV', product: 'Gravité', campaigns: ['Evergreen'], itemName: 'Gravité | Evergreen | Gravité TV Commercial Lift', lists: { top: PRODUCTIONS_TOP } });
  assert.deepEqual(q.parts, ['Gravite', 'Lift']);
});

test('TV title: drops the product, brand and "TV Commercial", keeps the name; never empty', () => {
  assert.equal(F.tvTitle('Face Cream | ChatGPT | Face Cream TV Motion Design The Math', 'Face Cream'), 'Motion Design The Math');
  assert.equal(F.tvTitle('Gravité | TV Commercial', 'Gravité'), 'TV Commercial');
  assert.equal(F.tvTitle('Sunscreen | Particle TV Spot Beach Day', 'Sunscreen', 'Particle'), 'Beach Day');
  assert.equal(F.isTv('TV'), true);
  assert.equal(F.isTv('Marketing/Media'), false);
  assert.equal(F.isTv('Special Project (SP)'), false);
});

test('the link is the folder in the next.frame.io web app', () => {
  assert.equal(F.folderUrl(F.PROJECTS.video.id, 'abc'), 'https://next.frame.io/project/d0a48ec1-1487-47cf-97cb-ee5311f76b09/abc');
});

// ── the walk against a fake Frame.io: uses what's there, makes only what's missing, writes nothing twice ──
test('createTicketFolder: finds the existing folders, makes the missing ones under the right parents', async () => {
  const fio = require('../src/lib/creative/providers/frameio');
  const orig = { api: fio.api, listChildren: fio.listChildren, accessToken: fio.accessToken, resolveAccount: fio.resolveAccount };
  const tree = { ROOT: [{ id: 'Y26', name: '2026' }], Y26: [{ id: 'NOV', name: '11_November' }], NOV: [{ id: 'GRV', name: 'gravite' }], GRV: [] };
  const posts = [];
  fio.accessToken = async () => 'tk';
  fio.resolveAccount = async () => 'ACC';
  fio.listChildren = async (acct, id) => (tree[id] || []).map(f => ({ ...f, type: 'folder' }));
  fio.api = async (path, opts = {}) => {
    if (/\/projects\//.test(path)) return { data: { root_folder_id: 'ROOT' } };
    const m = path.match(/\/folders\/([^/]+)\/folders$/);
    if (m && opts.method === 'POST') {
      const id = `NEW${posts.length}`;
      posts.push({ parent: m[1], name: opts.body.data.name });
      tree[m[1]] = [...(tree[m[1]] || []), { id, name: opts.body.data.name }];
      tree[id] = [];
      return { data: { id, name: opts.body.data.name } };
    }
    throw new Error(`unexpected ${path}`);
  };
  try {
    F.reset();
    const r = await F.createTicketFolder({ department: 'Marketing/Media', brand: 'Particle', product: 'Gravité', itemName: 'Gravité | Meta | The Last Spritz', when: NOV25 });
    assert.deepEqual(posts, [{ parent: 'GRV', name: 'Gravité Meta The Last Spritz' }]);
    assert.equal(r.url, `https://next.frame.io/project/${F.PROJECTS.video.id}/NEW0`);
    assert.equal(r.path, 'Video / 2026 / 11_November / gravite / Gravité Meta The Last Spritz');
    // the same ticket name again → the same folder, nothing made
    const again = await F.createTicketFolder({ department: 'Marketing/Media', brand: 'Particle', product: 'Gravité', itemName: 'Gravité | Meta | The Last Spritz', when: NOV25 });
    assert.equal(posts.length, 1);
    assert.equal(again.url, r.url);
    assert.equal(again.reused, true);
    // December, new product: month + product + ticket made, in that order
    const dec = await F.createTicketFolder({ department: 'Marketing/Media', product: 'Hair Revival Kit', itemName: 'Hair Revival Kit | Meta | Day One', when: DEC02 });
    assert.deepEqual(posts.slice(1).map(p => p.name), ['12_December', 'Hair Revival Kit', 'Hair Revival Kit Meta Day One']);
    assert.equal(posts[1].parent, 'Y26');
    assert.equal(dec.made.length, 3);
  } finally {
    Object.assign(fio, orig);
    F.reset();
  }
});

test('createTicketFolder: null when Frame.io is not connected', async () => {
  const fio = require('../src/lib/creative/providers/frameio');
  const orig = fio.accessToken;
  fio.accessToken = async () => { throw Object.assign(new Error('Frame.io is not connected'), { code: 'NOT_CONNECTED' }); };
  try { assert.equal(await F.createTicketFolder({ department: 'TV', product: 'Gravité', itemName: 'x' }), null); } finally { fio.accessToken = orig; }
});

// ── both links on a new ticket (New ticket panel + Medium): video → Dropbox + Frame.io, design → Dropbox only ──
test('makeTicketFolders: video gets both links in their columns; design gets Dropbox only; a failure never stops the other', async () => {
  const T = require('../src/lib/studio/ticketFolders');
  const D = require('../src/lib/studio/dropboxFolders');
  const monday = require('../src/lib/monday');
  const orig = { d: D.createTicketFolder, f: F.createTicketFolder, q: monday.mondayQuery };
  const writes = [];
  const frameCalls = [];
  D.createTicketFolder = async ({ board }) => ({ url: `https://www.dropbox.com/scl/fo/${board}`, path: '/Creative Assets 2026 - MV Sync/x' });
  F.createTicketFolder = async (a) => { frameCalls.push(a); return { url: 'https://next.frame.io/project/p/f', path: 'Video / 2026 / 11_November / Face Cream / x' }; };
  monday.mondayQuery = async (q, v) => { writes.push({ board: v.b, item: v.i, values: JSON.parse(v.v) }); return {}; };
  try {
    const v = await T.makeTicketFolders({ board: 'video', itemId: '1', itemName: 'Face Cream | Meta | x', department: 'Marketing/Media', product: 'Face Cream', campaigns: ['Black Friday 2026'] });
    assert.equal(v.dropbox.in_column, true);
    assert.equal(v.frame.in_column, true);
    assert.deepEqual(writes[0], { board: '5433027071', item: '1', values: {
      link4__1: { url: 'https://www.dropbox.com/scl/fo/video', text: 'Dropbox Link' },
      link: { url: 'https://next.frame.io/project/p/f', text: 'Frame.io folder' } } });
    assert.deepEqual(frameCalls[0].campaigns, ['Black Friday 2026']);

    const d = await T.makeTicketFolders({ board: 'design', itemId: '2', itemName: 'Face Cream | Meta | y', department: 'Marketing', product: 'Face Cream' });
    assert.equal(d.frame, undefined);
    assert.equal(frameCalls.length, 1);
    assert.deepEqual(writes[1], { board: '8036329818', item: '2', values: { link0__1: { url: 'https://www.dropbox.com/scl/fo/design', text: 'Dropbox Link' } } });

    F.createTicketFolder = async () => { throw new Error('Frame.io 403: not allowed'); };
    const e = await T.makeTicketFolders({ board: 'video', itemId: '3', itemName: 'z', product: 'Face Cream' });
    assert.equal(e.dropbox.in_column, true);
    assert.match(e.frame.error, /^Frame\.io: Frame\.io 403/);
    assert.deepEqual(Object.keys(writes[2].values), ['link4__1']);

    // the brief update names both
    const lines = T.folderLines(v);
    assert.equal(lines.length, 2);
    assert.match(lines[1], /^🎬 Frame\.io folder for review: <a href="https:\/\/next\.frame\.io\/project\/p\/f">Video \/ 2026/);
  } finally {
    D.createTicketFolder = orig.d; F.createTicketFolder = orig.f; monday.mondayQuery = orig.q;
  }
});

test("Medium's brief update ends with the ticket's folders", () => {
  const { briefHtml } = require('../src/lib/medium/monday');
  const html = briefHtml({ format: 'video', product: 'Face Cream', fields: { brief: 'Concept' } }, 'Dana', [], {
    folders: { dropbox: { url: 'https://www.dropbox.com/scl/fo/a', path: '/x/y' }, frame: { url: 'https://next.frame.io/project/p/f', path: 'Video / 2026' } } });
  assert.match(html, /📁 Dropbox folder for the finished files/);
  assert.match(html, /🎬 Frame\.io folder for review/);
  assert.doesNotMatch(briefHtml({ format: 'design', product: 'Face Cream', fields: {} }, 'Dana'), /Frame\.io/);
});
