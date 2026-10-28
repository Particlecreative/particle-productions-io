/**
 * Finance rules for a budget-line change — what needs a reason, what gets logged, what emails finance.
 * Pure: the routes run the change inside a transaction, call these, and roll back when `needs` is set
 * (the browser then asks for the reason and sends the same change again with `_finance`).
 */
const B = require('./budget');

// Fields that are the budget itself (frozen when a production is locked; Editor+ only)
const BUDGET_FIELDS = new Set(['item', 'full_name', 'type', 'planned_budget', 'currency_code', 'timeline_start', 'timeline_end', 'expense_month', 'supplier']);
// Fields Accounting may change, and that stay open after a production is closed (suppliers are paid up to 30 days later)
const PAYMENT_FIELDS = new Set([
  'actual_spent', 'payment_status', 'payment_method', 'bank_details', 'business_type', 'supplier_type',
  'invoice_status', 'invoice_url', 'invoice_type', 'receipt_required', 'paid_at', 'payment_note', 'paid_by', 'payment_due',
  'drive_url', 'dropbox_url', 'payment_proof_url', 'payment_proof_drive_url', 'payment_proof_dropbox_url', 'id_number',
]);
// Postponement / completion prompts apply once a production is past "Pending"
const DATE_WATCH_STAGES = new Set(['Pre Production', 'Production', 'Post', 'Paused']);

const label = (li) => (li ? (String(li.item || '').replace(/<[^>]*>/g, ' ').trim() || li.full_name || li.type || 'Line') : 'Line');
const month = (d) => B.monthOf(B.ymdOf(d));

/** Expected cost in USD at `rate` (or the line's own date rate via rateFor). */
const expUsd = (li, rate) => (li ? B.toUsd(B.financeCost(li), li.currency_code || 'USD', rate) : 0);

/**
 * @param ctx { prod, before: lines[], after: lines[], oldLine, newLine, op: 'create'|'update'|'delete',
 *              decision, todayMonth: 'YYYY-MM-01', rate, base: { brand_id, production_id, user_id, user_name, source, batch_id } }
 * @returns { needs, events, raisePlannedTo }
 */
function evaluateLine(ctx) {
  const { prod, before, after, oldLine, newLine, op, decision, todayMonth, rate, base } = ctx;
  const approved = B.isApproved(prod);
  const r = approved ? (B.num(prod.approved_fx_rate) || rate) : rate;
  const events = [];
  const li = newLine || oldLine;
  const ev = (e) => events.push({ ...base, line_item_id: li?.id || null, label: label(li), ...e });
  let needs = null, raisePlannedTo = null;

  // ── The budget amount ──
  const oldAmt = op === 'create' ? 0 : B.num(oldLine?.planned_budget);
  const newAmt = op === 'delete' ? 0 : B.num(newLine?.planned_budget);
  const oldCur = oldLine?.currency_code || 'USD', newCur = newLine?.currency_code || 'USD';
  const amountMoved = op === 'update' ? (Math.abs(oldAmt - newAmt) > 0.004 || (oldCur !== newCur && (oldAmt || newAmt))) : (op === 'create' ? newAmt > 0 : oldAmt > 0);

  if (amountMoved) {
    const kind = op === 'create' ? 'line_added' : op === 'delete' ? 'line_removed' : (oldCur !== newCur ? 'currency_changed' : 'amount_changed');
    const deltaUsd = B.round2(B.toUsd(newAmt, newCur, r) - B.toUsd(oldAmt, oldCur, r));
    const common = {
      kind, field: 'planned_budget',
      old_value: op === 'create' ? null : `${oldAmt} ${oldCur}`, new_value: op === 'delete' ? null : `${newAmt} ${newCur}`,
      currency: newCur, delta: oldCur === newCur ? B.round2(newAmt - oldAmt) : null, delta_usd: deltaUsd,
      expense_month: B.primaryMonth(li, prod),
    };
    if (approved && !B.isUnexpected(li)) {
      const cls = B.classifyChange(prod, before, after, rate);
      if (cls.impact) {
        if (!decision?.reason) {
          needs = { code: 'reason_required', mode: cls.inBuffer ? 'in_buffer' : 'over_planned', impact: cls, line: label(li) };
        } else if (!cls.inBuffer && !decision.approved_by) {
          needs = { code: 'reason_required', mode: 'over_planned', need_approver: true, impact: cls, line: label(li) };
        } else {
          ev({ ...common, ...decisionFields(decision), in_buffer: cls.inBuffer, meta: { left_after: cls.leftAfter, planned: cls.planned } });
          if (!cls.inBuffer) {
            raisePlannedTo = Math.max(B.round2(cls.coreAfter), decision.new_planned || 0);
            ev({
              kind: 'budget_increase', field: 'planned_budget_2026', line_item_id: null,
              old_value: cls.planned, new_value: raisePlannedTo, currency: 'USD', delta_usd: B.round2(raisePlannedTo - cls.planned),
              ...decisionFields(decision), meta: { trigger: label(li), core_after: cls.coreAfter },
            });
          }
        }
      } else {
        ev({ ...common, in_buffer: true });
      }
    } else {
      ev({ ...common, ...(decision ? decisionFields(decision) : {}) });
    }
  }

  // ── A change to a past month on a production finance already booked ──
  // Budget changes (a line added / removed / re-priced / moved in time) alert finance at once.
  // An invoice or actual coming in for a past month is routine: logged for the digest + accrual report,
  // and emailed (bundled, not urgent) only when it's far off what was expected.
  if (!needs && B.financeKnows(prod)) {
    const months = [oldLine && op !== 'create' ? B.primaryMonth(oldLine, prod) : null, newLine && op !== 'delete' ? B.primaryMonth(newLine, prod) : null].filter(Boolean);
    const past = months.filter(m => m < todayMonth);
    const oldExp = op === 'create' ? 0 : expUsd(oldLine, r), newExp = op === 'delete' ? 0 : expUsd(newLine, r);
    const datesMoved = op === 'update' && oldLine && newLine && ['timeline_start', 'timeline_end', 'expense_month'].some(k => B.ymdOf(oldLine[k]) !== B.ymdOf(newLine[k]));
    const structural = op !== 'update' || amountMoved || datesMoved;
    const delta = newExp - oldExp;
    if (past.length && Math.abs(delta) >= 1) {
      let notify;                                                       // undefined → the kind's default (instant)
      if (base?.source === 'sheet') notify = null;                      // finance made it in their own sheet
      else if (!structural) notify = Math.abs(delta) >= Math.max(500, 0.1 * Math.max(oldExp, newExp)) ? 'bundle' : null;
      ev({
        kind: 'historical_change', field: 'expected_cost', old_value: B.round2(oldExp), new_value: B.round2(newExp),
        currency: 'USD', delta_usd: B.round2(delta), expense_month: past.sort()[0],
        ...(decision ? decisionFields(decision) : {}),
        meta: { op, closed: !!prod.locked, invoice_vs_expected: !structural },
        ...(notify !== undefined ? { notify } : {}),
      });
    }
  }

  // ── Payments (log only) ──
  if (op === 'update' && oldLine && newLine) {
    if (B.num(oldLine.actual_spent) !== B.num(newLine.actual_spent)) {
      ev({ kind: 'actual_changed', field: 'actual_spent', old_value: B.num(oldLine.actual_spent), new_value: B.num(newLine.actual_spent),
        currency: newCur, delta: B.round2(B.num(newLine.actual_spent) - B.num(oldLine.actual_spent)),
        delta_usd: B.round2(B.toUsd(newLine.actual_spent, newCur, r) - B.toUsd(oldLine.actual_spent, newCur, r)),
        expense_month: B.primaryMonth(newLine, prod) });
    }
    const wasPaid = /^paid$/i.test(oldLine.payment_status || ''), isPaid = /^paid$/i.test(newLine.payment_status || '');
    if (wasPaid !== isPaid) {
      ev({ kind: isPaid ? 'paid' : 'unpaid', field: 'payment_status', old_value: oldLine.payment_status, new_value: newLine.payment_status,
        currency: newCur, meta: { paid_at: B.ymdOf(newLine.paid_at), paid_by: newLine.paid_by, method: newLine.payment_method } });
    }
    if (String(oldLine.invoice_status || '') !== String(newLine.invoice_status || '') && /^received$/i.test(newLine.invoice_status || '')) {
      ev({ kind: 'invoice_received', field: 'invoice_status', old_value: oldLine.invoice_status, new_value: newLine.invoice_status });
    }
    const oldDates = `${B.ymdOf(oldLine.timeline_start)}|${B.ymdOf(oldLine.timeline_end)}|${B.ymdOf(oldLine.expense_month)}`;
    const newDates = `${B.ymdOf(newLine.timeline_start)}|${B.ymdOf(newLine.timeline_end)}|${B.ymdOf(newLine.expense_month)}`;
    if (oldDates !== newDates) {
      ev({ kind: 'dates_changed', field: 'timeline', old_value: oldDates.replace(/null/g, '—'), new_value: newDates.replace(/null/g, '—') });
    }
  }

  return { needs, events: needs ? [] : events, raisePlannedTo: needs ? null : raisePlannedTo };
}

/**
 * Production dates moved (they come from the lines). Start moving to a later month = postponed:
 * needs a reason, and "any work or cost this month?" when the old start was this month or earlier.
 */
function evaluateDates({ prod, before, after, flow, todayMonth, base }) {
  const oldStart = month(before?.start), newStart = month(after?.start);
  const watched = B.isApproved(prod) || DATE_WATCH_STAGES.has(B.normalizeStage(prod.stage));
  if (!watched || !oldStart || !newStart || newStart <= oldStart || prod.locked) return { needs: null, events: [] };
  const askWork = oldStart <= todayMonth;
  if (!flow?.note || (askWork && flow.work_this_month == null)) {
    return { needs: { code: 'postpone_required', from: before, to: after, ask_work: askWork }, events: [] };
  }
  return {
    needs: null,
    events: [{
      ...base, kind: 'postponed', field: 'dates', old_value: `${before.start} → ${before.end}`, new_value: `${after.start} → ${after.end}`,
      expense_month: oldStart, note: flow.note, label: prod.project_name,
      meta: { work_this_month: askWork ? flow.work_this_month : null, from_month: oldStart, to_month: newStart },
    }],
  };
}

function decisionFields(d) {
  if (!d) return {};
  return { reason: d.reason || null, approved_by: d.approved_by || null, approved_at: d.approved_at || null, note: d.note || null, link: d.link || null };
}

/** The prompt answers for postpone / complete / pause / reopen / unlock. */
function parseFlow(body) {
  const f = body?._finance;
  if (!f || typeof f !== 'object') return null;
  const note = String(f.note || '').trim().slice(0, 2000);
  const w = f.work_this_month;
  return {
    note: note || null,
    work_this_month: w === true || w === 'yes' ? true : w === false || w === 'no' ? false : null,
    reason: f.reason || null,
    approved_by: f.approved_by || null,
  };
}

module.exports = { evaluateLine, evaluateDates, parseFlow, decisionFields, label, BUDGET_FIELDS, PAYMENT_FIELDS, DATE_WATCH_STAGES };
