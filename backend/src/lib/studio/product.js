/**
 * The product of a task on the studio boards (Video Projects, Design Projects 2.0).
 *
 * 12 Nov 2026: the team added a "Product" dropdown (Video dropdown_mm8qh5b, Design dropdown_mm8q7ysv — one label each)
 * and renamed the status column label9 to "Product (old)". The dropdown wins; a task only tagged in the old column falls
 * back to it. "-" counts as not set. The dropdown also carries products the old column never had (Bone & Joint,
 * Testosterone and Hormone, Antifungal Foot Treatment). Board configs keep `product` = label9 (saved configs still name
 * it) and add `product_dropdown`.
 */

const UNSET = new Set(['', '-']);

/** The label(s) of a status or dropdown column value, as text (pure). */
function labelText(cv) {
  if (!cv) return '';
  if (Array.isArray(cv.values) && cv.values.length) return cv.values.map(v => v?.label).filter(Boolean).join(', ').trim();
  return String(cv.label ?? cv.text ?? '').trim();
}

/** dropdown first, then Product (old); '' when neither is set (pure — tested). */
function productText(dropdownCv, oldCv) {
  const now = labelText(dropdownCv);
  if (!UNSET.has(now)) return now;
  const old = labelText(oldCv);
  if (!UNSET.has(old)) return old;
  return now || old;   // '-' when that's all there is (the readers already skip it)
}

/** The product from column values by id + a board's columns ({ product, product_dropdown }) (pure — tested). */
function productOf(byId, columns) {
  const c = columns || {};
  return productText(c.product_dropdown ? byId?.[c.product_dropdown] : null, c.product ? byId?.[c.product] : null);
}

/**
 * Write a product to both columns — each only with a label it already has, so an unknown label never fails the create
 * (pure — tested). has(col, label) → boolean | null (null = the column's labels aren't known: write the old column only).
 * Returns { values: { [col]: value }, written: [col ids] }.
 */
function productValues(product, columns, has) {
  const c = columns || {};
  const v = String(product || '').trim();
  const values = {};
  if (!v) return { values, written: [] };
  const old = c.product ? has(c.product, v) : false;
  const now = c.product_dropdown ? has(c.product_dropdown, v) : false;
  if (old === true || (old === null && now !== true)) values[c.product] = { label: v };
  if (now === true) values[c.product_dropdown] = { labels: [v] };
  return { values, written: Object.keys(values) };
}

module.exports = { labelText, productText, productOf, productValues, UNSET };
