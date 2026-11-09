const crypto = require('crypto');

/**
 * Creative Team Weekly: what the team deck needs on top of the shared week snapshot —
 * the Studio's hot projects, and (when AFTERLIFE is connected) how last week's work did on Meta.
 * Everything else (this week's workload, planned tasks, turnaround) is already in the snapshot.
 */

const slimItem = (it) => ({
  id: it.id, board: it.board, division: it.division, name: it.name, title: it.title, product: it.product, status: it.status,
  priority: it.priority || null, people: it.people, requested_by: it.requested_by, timeline: it.timeline, deadline: it.deadline,
  versions: it.versions, fix_rounds: it.fix_rounds || 0, review_rounds: it.review_rounds || 0, status_since: it.status_since || null,
  life: it.life ? { submitted: it.life.submitted, started: it.life.started, completed: it.life.completed, phases: it.life.phases || {} } : null,
  effort_total_s: it.effort_total_s ?? null, effort_week_s: it.effort_week_s ?? null, open: it.open,
  journey: (it.journey || []).slice(-40),
});

/** The pinned Hot Projects as they are now (Studio → Hot Projects), trimmed for a slide. */
async function hotProjects(brandId, warnings) {
  try {
    // Required here: hotProjects → studio/data → this folder's snapshot.js
    const { getHotProjects } = require('../studio/hotProjects');
    const data = await getHotProjects({ brandId });
    const byId = new Map((data.items || []).map(i => [i.id, i]));
    const people = {};
    const list = [];
    for (const p of data.projects || []) {
      const it = byId.get(p.item_id);
      if (!it) continue;
      for (const uid of [...it.people, ...it.requested_by]) if (data.people?.[uid]) people[uid] = data.people[uid];
      list.push({ id: p.id, title: p.title || null, note: p.note || '', health: p.health || null, related: (p.related_ids || []).length, item: slimItem(it) });
    }
    return { projects: list, people };
  } catch (e) {
    warnings.push(`Hot projects unavailable (${e.message})`);
    return { projects: [], people: {} };
  }
}

/** AFTERLIFE thumbnails become deck media refs (served and cached like ticket media; the path never reaches the browser). */
function registerThumbs(perf) {
  const refs = {};
  const add = (c) => {
    if (!c?.thumb) return;
    const id = `al_${crypto.createHash('sha1').update(c.thumb).digest('hex').slice(0, 16)}`;
    refs[id] = { kind: 'afterlife', path: c.thumb };
    c.ref = id;
    delete c.thumb;
  };
  for (const c of perf.creatives || []) add(c);
  for (const m of perf.makers || []) add(m.best);
  return refs;
}

/** { team, media_refs } — the team deck's extras and the media refs they add to the snapshot. */
async function teamExtras({ brandId, weekStart }) {
  const warnings = [];
  const [hot, performance] = await Promise.all([
    hotProjects(brandId, warnings),
    require('./afterlife').weekPerformance({ weekStart }).catch((e) => { warnings.push(`AFTERLIFE unavailable (${e.message})`); return null; }),
  ]);
  let media_refs = {};
  if (performance) {
    media_refs = registerThumbs(performance);
    // Makers by id, for names the CP's roster doesn't have
    performance.people = Object.fromEntries((performance.makers || []).map(m => [String(m.id), { id: String(m.id), name: m.name, photo: null }]));
    if (performance.partial) warnings.push(`Meta data in AFTERLIFE runs to ${performance.lastDay} — the last days of the week are still missing`);
  }
  return { team: { hot, performance, warnings }, media_refs };
}

module.exports = { teamExtras };
