/**
 * Never post the same Captain comment twice (re-runs, repeated triggers). Before posting, the Captain reads his own
 * earlier comments on the file — every bot comment starts with the "🧑‍✈️ Captain Caption:" prefix — and skips any with
 * the same text at the same spot: the same frame (± tolerance) in Frame.io, the same layer in Figma.
 * Each earlier comment can match once, so two real issues with the same wording at different moments still post.
 */
const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim().toLowerCase();

function makeMatcher(existing, { tolerance = 12 } = {}) {
  const pool = (existing || []).map(c => ({ ...c, used: false }));
  return function match(text, where) {
    const t = norm(text);
    const places = Array.isArray(where) ? where.filter(Boolean) : where;
    const hit = pool.find(c => {
      if (c.used || norm(c.text) !== t) return false;
      if (places == null || c.where == null) return true;
      if (typeof places === 'number') return Math.abs(Number(c.where) - places) <= tolerance;
      return (Array.isArray(places) ? places : [places]).includes(c.where);
    });
    if (hit) hit.used = true;
    return hit || null;
  };
}

/** The Captain's earlier comments on a Frame.io file → a matcher. A read failure means "nothing found" (old behaviour). */
async function frameioMatcher(frameio, fileId, prefix) {
  try {
    const list = await frameio.listComments(fileId);
    return makeMatcher(list.filter(c => String(c.text || '').startsWith(prefix)).map(c => ({ id: c.id, text: c.text, where: Number.isFinite(Number(c.timestamp)) ? Number(c.timestamp) : null })));
  } catch { return makeMatcher([]); }
}

async function figmaMatcher(figma, fileKey, prefix) {
  try {
    const list = await figma.comments(fileKey);
    return makeMatcher(list.filter(c => !c.parent_id && String(c.message || '').startsWith(prefix)).map(c => ({ id: c.id, text: c.message, where: c.client_meta?.node_id || null })));
  } catch { return makeMatcher([]); }
}

module.exports = { makeMatcher, frameioMatcher, figmaMatcher };
