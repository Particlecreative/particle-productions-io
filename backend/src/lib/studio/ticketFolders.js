/**
 * A new ticket's folders — Tomer, 25 Nov 2026: "new tickets at the New ticket panel or at Medium should also create
 * Dropbox and Frame.io links automatically. For design only Dropbox."
 *   video → a Dropbox folder (dropboxFolders.js) + a Frame.io folder (frameFolders.js)
 *   design → a Dropbox folder
 * Each link goes in its column on the ticket. Never stops the ticket — Monday has it already; a folder that couldn't be
 * made says why, so the person can add it by hand.
 */
const monday = require('../monday');
const dropbox = require('./dropboxFolders');
const frame = require('./frameFolders');

// The ticket's link columns (lib/creative/config.js has the same; a passed config wins)
const COLUMNS = { video: { dropbox: 'link4__1', frame: 'link' }, design: { dropbox: 'link0__1' } };
const BOARD_IDS = { video: '5433027071', design: '8036329818' };
const TEXT = { dropbox: 'Dropbox Link', frame: 'Frame.io folder' };

async function setLinks({ boardId, itemId, links }) {
  const v = Object.fromEntries(Object.entries(links).map(([col, { url, text }]) => [col, { url, text }]));
  if (!Object.keys(v).length) return;
  await monday.mondayQuery('mutation ($b: ID!, $i: ID!, $v: JSON!) { change_multiple_column_values(board_id: $b, item_id: $i, column_values: $v) { id } }',
    { b: String(boardId), i: String(itemId), v: JSON.stringify(v) });
}

/**
 * board 'video'|'design'; fields as the ticket has them. → { dropbox, frame } where each is
 * { url, path, in_column } · { error } · null (not connected) · undefined (not for this board).
 */
async function makeTicketFolders({ board, itemId, itemName, department, brand, product, platform, websiteTask, campaigns = [], config = null, brandId = 'particle' }) {
  const cols = { ...COLUMNS[board], ...(config?.boards?.[board]?.columns?.dropbox ? { dropbox: config.boards[board].columns.dropbox } : {}),
    ...(board === 'video' && config?.boards?.video?.columns?.frame ? { frame: config.boards.video.columns.frame } : {}) };
  const boardId = config?.boards?.[board]?.board_id || BOARD_IDS[board];
  const out = {};
  const tasks = [
    ['dropbox', () => dropbox.createTicketFolder({ board, department, brand, product, platform, websiteTask, itemName, brandId })],
    board === 'video' ? ['frame', () => frame.createTicketFolder({ department, brand, product, campaigns, itemName })] : null,
  ].filter(Boolean);
  await Promise.all(tasks.map(async ([kind, make]) => {
    try { out[kind] = await make(); } catch (e) {
      console.warn(`[studio] ${kind} folder:`, e.message);
      out[kind] = { error: `${kind === 'frame' ? 'Frame.io' : 'Dropbox'}: ${e.message}` };
    }
  }));
  const links = {};
  for (const kind of Object.keys(out)) if (out[kind]?.url && cols[kind]) links[cols[kind]] = { url: out[kind].url, text: TEXT[kind] };
  try {
    await setLinks({ boardId, itemId, links });
    for (const kind of Object.keys(out)) if (out[kind]?.url) out[kind] = { ...out[kind], in_column: !!cols[kind] };
  } catch (e) {
    for (const kind of Object.keys(out)) {
      if (out[kind]?.url) out[kind] = { ...out[kind], in_column: false, error: `The folder is made, but Monday didn’t take the link (${e.message}) — paste it in the ${kind === 'frame' ? 'Frame' : 'Dropbox'} column` };
    }
  }
  return out;
}

/** The lines the brief update gets (HTML), so the editor / designer sees where things go. */
function folderLines(f) {
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  return [
    f?.dropbox?.url ? `📁 Dropbox folder for the finished files: <a href="${esc(f.dropbox.url)}">${esc(f.dropbox.path || 'open')}</a>` : null,
    f?.frame?.url ? `🎬 Frame.io folder for review: <a href="${esc(f.frame.url)}">${esc(f.frame.path || 'open')}</a>` : null,
  ].filter(Boolean);
}

module.exports = { makeTicketFolders, folderLines, COLUMNS };
