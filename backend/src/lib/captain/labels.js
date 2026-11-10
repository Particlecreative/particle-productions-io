/**
 * Naming deliverables the way the team talks about them.
 *   - "_V1" / "_V2" (or "_Hook1" / "_Hook2") in a file name = Version 1 / 2 = a deliverable variant (e.g. two hooks because the brief asked
 *     for "Versions Needed: 2") — NOT a revision.
 *   - Revisions are Frame.io versions stacked on the same file → "round 1, 2, 3…".
 *   - Size from "16X9" / "4x5" in a video name, or from a Figma frame's pixel size (1200×1200 → 1:1).
 * The biggest size is made first (16x9 if asked for, else 9x16) and cut down afterwards — the "master".
 */

const RATIOS = [
  ['16x9', 16 / 9], ['9x16', 9 / 16], ['4x5', 4 / 5], ['1x1', 1], ['5x4', 5 / 4], ['2x3', 2 / 3], ['3x2', 3 / 2], ['1.91x1', 1.91],
];

function sizeFromName(name) {
  const m = String(name || '').match(/(?:^|[^0-9])(\d{1,2})\s*[xX×]\s*(\d{1,2})(?![0-9])/);
  return m ? `${Number(m[1])}x${Number(m[2])}` : null;
}

/** 1200×1200 → '1x1', 900×1600 → '9x16', 1080×1350 → '4x5' (closest common ratio within 3%). */
function sizeFromPixels(w, h) {
  if (!w || !h) return null;
  const r = w / h;
  let best = null, bestErr = Infinity;
  for (const [label, v] of RATIOS) { const err = Math.abs(r - v) / v; if (err < bestErr) { bestErr = err; best = label; } }
  return bestErr <= 0.03 ? best : `${Math.round(w)}x${Math.round(h)}`;
}

function variantFromName(name) {
  const m = String(name || '').match(/(?:^|[_\s-])(?:V|Hook[\s_-]?)(\d{1,2})(?=[_\s.-]|$)/i);
  return m ? Number(m[1]) : null;
}

function deliverableLabel({ variant, size }) {
  return [variant ? `Version ${variant}` : null, size].filter(Boolean).join(' · ') || 'Main';
}

// Bigger canvases come first: 16x9 is the master when present, otherwise 9x16, then 4x5, 1x1…
const MASTER_ORDER = ['16x9', '9x16', '4x5', '1x1'];
const sizeRank = (s) => { const i = MASTER_ORDER.indexOf(s); return i === -1 ? MASTER_ORDER.length : i; };

module.exports = { sizeFromName, sizeFromPixels, variantFromName, deliverableLabel, sizeRank };
