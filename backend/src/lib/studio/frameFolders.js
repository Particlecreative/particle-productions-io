/**
 * Studio — a new video ticket's Frame.io folder, made where the team makes them by hand today (Tomer, 25 Nov 2026:
 * "auto Frame.io link — read the structure of the Frame drive we have now and imitate it, once a ticket is created";
 * "pay attention that TV has a Productions folder"). Video tickets only — design gets Dropbox only.
 *
 * What's there (read 25 Nov 2026 in the Frame.io account, "Aviad's Account"):
 *   · Project "Video" — every non-TV video ticket:
 *       Video / <YYYY> / <MM_Month> / <Product> / <the ticket name without the "|">
 *       e.g. Video / 2026 / 11_November / Instant Eye Firming Cream / Instant Eye Firming Cream CGI Mechanism Videos Meta CGI Mechanism V2
 *     Month folders are "04_April" … "11_November" (a few older ones are just "July" / "September" — an existing one is
 *     used whatever its spelling). Product folders are Monday's Product label ("Face Cream", "Not a Product Task",
 *     "Multiple Products", "Test Product") — sometimes spelled differently ("gravite", "Hand cream"), so the one that's
 *     already there wins. A sister brand's ticket goes in its brand's folder when there is one ("BIOMELLA").
 *     Two tickets with the same name share one folder (seen on the Creators tickets).
 *   · Project "Productions" — TV:
 *       Productions / <Product> / <the commercial>        e.g. Productions / Gravite / She Won't Have to
 *       Productions / <campaign> / <the commercial>       newer: "black friday 2026", "Memorial Day Sale", "4th of July"
 *     The commercial's folder is shared by all its tickets (the TV cut, its resizes, the Australia adaptation…), so an
 *     existing one is reused; the name is the ticket's last part without the product and "TV Commercial"
 *     ("Gravité TV Commercial She Won't Have To" → "She Won't Have To").
 * The folder link goes in the ticket's "Frame" column as "Frame.io folder" — the same text the team's links use.
 *
 * Uses CP's own Frame.io connection (Creative Weekly's — signed in as Tomer), so the folders show as made by him.
 * Frame.io allows about 10 new folders a minute per person — a ticket needs at most 4.
 */
const fio = require('../creative/providers/frameio');
const { productName } = require('./dropboxFolders');
const { BRANDS } = require('./brand');

const PROJECTS = {
  // seed = a folder right under the project's top, read when the project doesn't say its top folder
  video: { id: 'd0a48ec1-1487-47cf-97cb-ee5311f76b09', name: 'Video', seed: '48482ebc-31bd-4bb3-a80a-e20010791ac4' },
  productions: { id: '556ffd57-4057-42f4-9d67-75a614215903', name: 'Productions', seed: '79305506-994e-45ee-a5e1-4d83000d7bf4' },
};
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// ── names (pure — tested against the real folders) ───────────────────────────
const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '');

/** A folder name: no "|" (the team's folders drop them), no "/" or control characters, one space, ≤ 200. */
function folderName(s, max = 200) {
  return String(s || '').replace(/\s*\|\s*/g, ' ').replace(/[\\/]+/g, '-').replace(/[\u0000-\u001f]/g, '')
    .replace(/\s+/g, ' ').trim().slice(0, max).trim();
}

const isTv = (department) => /^tv$/i.test(String(department || '').trim());

function monthOf(when = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Jerusalem', year: 'numeric', month: 'numeric' })
    .formatToParts(when).map(x => [x.type, x.value]));
  const m = Number(p.month);
  return { mm: String(m).padStart(2, '0'), name: MONTHS[m - 1], year: String(p.year) };
}

/** The month folder: the one that's there ("11_November", "November", "11. November"), else "MM_Month". */
function monthFolder(existing, when = new Date()) {
  const m = monthOf(when);
  const hit = (existing || []).find(n => fold(n).replace(/^\d+/, '') === fold(m.name));
  return hit || `${m.mm}_${m.name}`;
}

/** First match by spelling-blind name among the folders that are there (pure). */
const findFold = (existing, ...names) => {
  for (const n of names.filter(Boolean)) {
    const hit = (existing || []).find(f => fold(f) === fold(n));
    if (hit) return hit;
  }
  return null;
};

/**
 * The product folder in a month (or under Productions): the product's folder that's there, a sister brand's own
 * folder ("BIOMELLA"), else the product's name as CP names it (sister brand on a Particle product → "Biomella Face Cream").
 */
function productFolder(existing, product, brand) {
  const name = productName(product, brand);
  const b = BRANDS.find(x => x.name.toLowerCase() === String(brand || '').trim().toLowerCase());
  const sister = b && !b.default ? b.name : null;
  // a sister brand never falls back to Particle's folder of the same product name
  return findFold(existing, name, sister || product) || name;
}

const TV_WORDS = new Set(['tv', 'commercial', 'commercials', 'spot', 'ad']);

/** The commercial's name from the ticket: its last part without the product / brand and "TV Commercial" (pure). */
function tvTitle(itemName, product, brand) {
  const last = String(itemName || '').split('|').pop().trim();
  const drop = new Set([...String(product || '').split(/\s+/), ...String(brand || '').split(/\s+/)].map(fold).filter(Boolean));
  const words = last.split(/\s+/).filter(Boolean);
  let a = 0, z = words.length;
  while (a < z && (drop.has(fold(words[a])) || TV_WORDS.has(fold(words[a])))) a++;
  while (z > a && TV_WORDS.has(fold(words[z - 1]))) z--;
  return folderName(words.slice(a, z).join(' ')) || folderName(last) || 'Untitled';
}

/**
 * Where the ticket's folder goes (pure). lists = the folder names already there at each level:
 *   non-TV: { years, months, products, tickets }      TV: { top, commercials }
 * → { project: 'video'|'productions', parts: [names from the project's top], reuse: whether the last one may be shared }
 */
function folderPlan({ department, brand, product, campaigns = [], itemName, when = new Date(), lists = {} }) {
  if (isTv(department)) {
    const parent = findFold(lists.top, ...(campaigns || [])) || productFolder(lists.top, product, brand);
    const title = tvTitle(itemName, product, brand);
    return { project: 'productions', parts: [parent, findFold(lists.commercials, title) || title], reuse: true };
  }
  const m = monthOf(when);
  const year = (lists.years || []).find(n => n.trim() === m.year) || m.year;
  const leaf = folderName(itemName) || 'Untitled';
  return {
    project: 'video',
    parts: [year, monthFolder(lists.months, when), productFolder(lists.products, product, brand), findFold(lists.tickets, leaf) || leaf],
    reuse: true,
  };
}

const folderUrl = (projectId, folderId) => `https://next.frame.io/project/${projectId}/${folderId}`;

// ── Frame.io ─────────────────────────────────────────────────────────────────
const roots = new Map();
const listed = new Map();   // folder id → { at, folders: [{ id, name }] }

async function topFolder(acct, key) {
  if (roots.has(key)) return roots.get(key);
  const p = PROJECTS[key];
  let id = null;
  try { id = (await fio.api(`/accounts/${acct}/projects/${p.id}`))?.data?.root_folder_id || null; } catch (e) {
    if (e.status === 401 || e.status === 403) throw e;
  }
  if (!id && p.seed) id = (await fio.api(`/accounts/${acct}/folders/${p.seed}`).catch(() => null))?.data?.parent_id || null;
  if (!id) throw new Error(`couldn’t find the top of the “${p.name}” project`);
  roots.set(key, id);
  return id;
}

async function subfolders(acct, folderId, { fresh = false } = {}) {
  const hit = listed.get(folderId);
  if (!fresh && hit && Date.now() - hit.at < 10 * 60 * 1000) return hit.folders;
  const kids = await fio.listChildren(acct, folderId);
  const folders = kids.filter(k => k.type === 'folder').map(k => ({ id: k.id, name: k.name }));
  listed.set(folderId, { at: Date.now(), folders });
  return folders;
}

async function makeFolder(acct, parentId, name) {
  const d = await fio.api(`/accounts/${acct}/folders/${parentId}/folders`, { method: 'POST', body: { data: { name } } });
  const f = d?.data;
  if (!f?.id) throw new Error('Frame.io didn’t return the new folder');
  listed.delete(parentId);
  return { id: f.id, name: f.name || name };
}

/** Walk the planned names from the project's top: use each folder that's there, make the ones that aren't. */
async function walk(acct, topId, parts) {
  let at = topId;
  const made = [];
  for (const name of parts) {
    const kids = await subfolders(acct, at, { fresh: name === parts[parts.length - 1] });
    const hit = kids.find(k => k.name === name) || kids.find(k => fold(k.name) === fold(name));
    if (hit) { at = hit.id; continue; }
    const f = await makeFolder(acct, at, name);
    made.push(name);
    at = f.id;
  }
  return { id: at, made };
}

/** In-process queue: two tickets at once never both make "12_December". */
let chain = Promise.resolve();
const serial = (fn) => { const run = chain.then(fn, fn); chain = run.catch(() => null); return run; };

/**
 * Make (or find) the ticket's folder. → { url, path, project, made: [new folder names], reused } · null when
 * Frame.io isn't connected. Throws with a readable reason otherwise.
 */
async function createTicketFolder({ department, brand, product, campaigns = [], itemName, when = new Date() }) {
  try { await fio.accessToken(); } catch (e) { if (e.code === 'NOT_CONNECTED') return null; throw new Error(`the Frame.io sign-in: ${e.message}`); }
  return serial(async () => {
    const acct = await fio.resolveAccount();
    const key = isTv(department) ? 'productions' : 'video';
    const top = await topFolder(acct, key);
    const lists = {};
    const names = (arr) => arr.map(f => f.name);
    let plan;
    if (key === 'productions') {
      lists.top = names(await subfolders(acct, top));
      const parentName = folderPlan({ department, brand, product, campaigns, itemName, when, lists }).parts[0];
      const parent = (await subfolders(acct, top)).find(f => f.name === parentName);
      lists.commercials = parent ? names(await subfolders(acct, parent.id, { fresh: true })) : [];
    } else {
      lists.years = names(await subfolders(acct, top));
      const m = monthOf(when);
      const year = (await subfolders(acct, top)).find(f => f.name.trim() === m.year);
      lists.months = year ? names(await subfolders(acct, year.id)) : [];
      const monthName = monthFolder(lists.months, when);
      const month = year ? (await subfolders(acct, year.id)).find(f => f.name === monthName) : null;
      lists.products = month ? names(await subfolders(acct, month.id)) : [];
      const prodName = productFolder(lists.products, product, brand);
      const prod = month ? (await subfolders(acct, month.id)).find(f => f.name === prodName) : null;
      lists.tickets = prod ? names(await subfolders(acct, prod.id, { fresh: true })) : [];
    }
    plan = folderPlan({ department, brand, product, campaigns, itemName, when, lists });
    const r = await walk(acct, top, plan.parts);
    return {
      url: folderUrl(PROJECTS[key].id, r.id),
      path: [PROJECTS[key].name, ...plan.parts].join(' / '),
      project: PROJECTS[key].name,
      made: r.made,
      reused: !r.made.includes(plan.parts[plan.parts.length - 1]),
    };
  });
}

const reset = () => { roots.clear(); listed.clear(); };

module.exports = { folderPlan, folderName, monthFolder, productFolder, tvTitle, isTv, folderUrl, createTicketFolder, reset, PROJECTS };
