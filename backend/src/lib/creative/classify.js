/**
 * Delivery classification from Monday status activity (pure, unit-tested).
 *
 * A ticket is "delivered" in a window when its status ENTERS the delivered set
 * (e.g. Quality Check → Approved). Moving within the set (Approved → Completed /
 * Upload Complete) is not a second delivery. If the ticket ends the window outside
 * the set (reopened), it is excluded and reported under `reopened`.
 */
const { normLabel } = require('../monday');

const BULK_WINDOW_MS = 3 * 60 * 1000;
const BULK_THRESHOLD = 15;

/**
 * @param {Array} events normalized activity events (any order) for ONE board
 * @param {object} opts
 *   statusColumn  column id of the status column
 *   delivered     array of delivered label texts
 *   fixes         array of fixes-round label texts
 *   fromMs, toMs  window [from, to)
 *   rule          { count_intra_delivered, exclude_reopened_in_week, treat_is_done_as_delivered }
 * @returns {{ delivered: Object<string, object>, reopened: string[], warnings: string[] }}
 */
function classifyDeliveries(events, { statusColumn = 'status', delivered = [], fixes = [], fromMs, toMs, rule = {} } = {}) {
  const D = new Set(delivered.map(normLabel));
  const F = new Set(fixes.map(normLabel));
  const inD = (v) => !!v && (D.has(normLabel(v.text)) || (rule.treat_is_done_as_delivered !== false && !!v.is_done));

  const byItem = new Map();
  for (const e of events || []) {
    if (e.column_id !== statusColumn || e.parent_item_id || !e.pulse_id) continue;
    if (!Number.isFinite(e.at_ms)) continue;
    if (!byItem.has(e.pulse_id)) byItem.set(e.pulse_id, []);
    byItem.get(e.pulse_id).push(e);
  }

  const result = { delivered: {}, reopened: [], warnings: [] };
  const entryLog = []; // for bulk-move detection

  for (const [id, list] of byItem) {
    list.sort((a, b) => a.at_ms - b.at_ms);
    const inWindow = list.filter(e => e.at_ms >= fromMs && e.at_ms < toMs);
    if (!inWindow.length) continue;

    let entries = inWindow.filter(e => inD(e.value) && !inD(e.prev));
    if (!entries.length && rule.count_intra_delivered) {
      entries = inWindow.filter(e => inD(e.value) && normLabel(e.value?.text) !== normLabel(e.prev?.text));
    }
    if (!entries.length) continue;

    const endState = inWindow[inWindow.length - 1];
    if (!inD(endState.value) && rule.exclude_reopened_in_week !== false) {
      result.reopened.push(id);
      continue;
    }

    const last = entries[entries.length - 1];
    result.delivered[id] = {
      delivered_at: last.at_ms,
      delivered_status: endState.value?.text || last.value?.text || '',
      rounds: entries.length,
      fixes_in_week: inWindow.filter(e => F.has(normLabel(e.value?.text))).length,
      by_automation: last.user_id === '-4',
      changed_by: last.user_id,
      pulse_name: last.pulse_name || '',
    };
    entryLog.push({ id, at: last.at_ms, user: last.user_id });
  }

  // Bulk-move guard: one user moving > 15 items into delivered within 3 minutes
  const byUser = new Map();
  for (const e of entryLog) {
    if (!byUser.has(e.user)) byUser.set(e.user, []);
    byUser.get(e.user).push(e.at);
  }
  for (const [user, times] of byUser) {
    times.sort((a, b) => a - b);
    let start = 0;
    for (let end = 0; end < times.length; end++) {
      while (times[end] - times[start] > BULK_WINDOW_MS) start++;
      if (end - start + 1 > BULK_THRESHOLD) {
        result.warnings.push(`Bulk move detected: user ${user} moved ${end - start + 1}+ items to delivered within 3 minutes — check for a board clean-up`);
        break;
      }
    }
  }

  return result;
}

/**
 * Sunday review. The deck is presented on Sunday about the week that just ended, and that week's work is often
 * approved the same morning. Classify deliveries over [first day, the day after the last day], then:
 *  - a delivery on the Sunday right after the period counts only if the task's timeline (else deadline) ended
 *    inside the period or before it — last week's work approved on review day;
 *  - a delivery on the period's own first day (a Sunday) whose task ended before the period belongs to the previous
 *    period (it was counted there), so nothing is counted twice.
 * delivered: { id: { delivered_at } } · endOf(id) → 'YYYY-MM-DD' | null
 */
function sundayReview(delivered, { firstDay, lastDay, endOf }) {
  const W = require('./week');
  const reviewDay = W.addDays(lastDay, 1);
  const out = {};
  for (const [id, info] of Object.entries(delivered || {})) {
    const day = W.localDate(info.delivered_at);
    const end = endOf(id);
    if (day < firstDay) continue;
    if (day > lastDay) {
      if (day === reviewDay && W.dow(reviewDay) === 0 && end && end <= lastDay) out[id] = { ...info, review_day: true };
      continue;
    }
    if (day === firstDay && W.dow(firstDay) === 0 && end && end < firstDay) continue;
    out[id] = info;
  }
  return out;
}

module.exports = { classifyDeliveries, sundayReview, BULK_THRESHOLD };
