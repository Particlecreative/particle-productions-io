const test = require('node:test');
const assert = require('node:assert/strict');
const { encodeHeader, buildMime } = require('../../src/lib/finance/mailer');
const sheet = require('../../src/lib/finance/sheet');
const { flagsFor } = require('../../src/lib/finance/invoiceReader');
const { normalizeUpdates } = require('../../src/lib/finance/service');
const tpl = require('../../src/lib/finance/templates');

test('email subjects keep ₪, em dashes and Hebrew (RFC 2047, short encoded words)', () => {
  assert.equal(encodeHeader('Plain subject'), 'Plain subject');
  const h = encodeHeader('[Blurr] 2652 Q4 — budget ₪12,000 שלום');
  assert.match(h, /^=\?UTF-8\?B\?/);
  const decoded = h.split('\r\n ').map(w => Buffer.from(w.slice(10, -2), 'base64').toString('utf8')).join('');
  assert.equal(decoded, '[Blurr] 2652 Q4 — budget ₪12,000 שלום');
  assert.ok(h.split('\r\n ').every(w => w.length <= 75));
});

test('MIME with a CSV attachment', () => {
  const raw = Buffer.from(buildMime({ to: 'a@b.com', subject: 'x', html: '<b>hi</b>', attachments: [{ filename: 'a.csv', mime: 'text/csv', content_base64: Buffer.from('x,y').toString('base64') }] }), 'base64url').toString();
  assert.match(raw, /multipart\/mixed/);
  assert.match(raw, /filename="a\.csv"/);
});

test('sheet value parsing', () => {
  assert.equal(sheet.canonStatus('Not Payed'), 'Not Paid');
  assert.equal(sheet.canonStatus('paid'), 'Paid');
  assert.equal(sheet.canonStatus('Pending approval'), 'Pending');
  assert.equal(sheet.parseInvoice('=HYPERLINK("https://drive.google.com/x","Link")'), 'https://drive.google.com/x');
  assert.equal(sheet.parseInvoice('Link'), '');
  assert.equal(sheet.parseNum('₪1,500.50'), 1500.5);
  assert.equal(sheet.parseNum(''), null);
});

test('Paid stamps the date + who; leaving Paid clears them; aliases and custom columns are kept', () => {
  const paid = normalizeUpdates({ payment_status: 'Paid' }, { payment_status: 'Not Paid' }, 'Ortal');
  assert.match(paid.paid_at, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(paid.paid_by, 'Ortal');
  const un = normalizeUpdates({ payment_status: 'Not Paid' }, { payment_status: 'Paid', paid_at: '2026-10-01', paid_by: 'X' }, 'Y');
  assert.equal(un.paid_at, null);
  assert.equal(un.paid_by, null);
  const al = normalizeUpdates({ date_paid: '2026-10-05', payment_screenshot_url: 'https://x', custom_123: 'v', bogus: 1 }, { custom_fields: { a: 1 } }, 'Z');
  assert.equal(al.paid_at, '2026-10-05');
  assert.equal(al.payment_proof_url, 'https://x');
  assert.deepEqual(JSON.parse(al.custom_fields), { a: 1, custom_123: 'v' });
  assert.equal('bogus' in al, false);
  assert.equal(normalizeUpdates({ expense_month: '2026-11' }, {}, '').expense_month, '2026-11-01');
});

test('invoice flags: wrong company, gap vs budget, duplicate, not an invoice', () => {
  const li = { id: 'l1', planned_budget: 1000, currency_code: 'USD' };
  const prod = { brand_id: 'blurr' };
  const f = flagsFor({ data: { is_invoice: true, document_type: 'tax_invoice', billed_to_name: 'Particle Aesthetic Science Ltd', currency: 'USD', amount_before_vat: 1300, invoice_number: '77' }, li, prod, others: [{ id: 'l2', production_id: 'PRD26-09', item: 'Gaffer', invoice_data: { invoice_number: '77' } }] });
  assert.deepEqual(f.map(x => x.code).sort(), ['duplicate', 'over_budget', 'wrong_company']);
  assert.deepEqual(flagsFor({ data: { is_invoice: false }, li, prod, others: [] }).map(x => x.code), ['not_invoice']);
  assert.deepEqual(flagsFor({ data: { is_invoice: true, document_type: 'tax_invoice', billed_to_name: 'Blurr Beauty LTD', currency: 'USD', amount_before_vat: 1010 }, li, prod, others: [] }), []);
  // Biomella is a Blurr brand: billed to Blurr Beauty is right, billed to Particle is not
  assert.deepEqual(flagsFor({ data: { is_invoice: true, document_type: 'tax_invoice', billed_to_name: 'Blurr Beauty LTD', billed_to_tax_id: '517208203', currency: 'USD', amount_before_vat: 1000 }, li, prod: { brand_id: 'biomella' }, others: [] }), []);
  assert.deepEqual(flagsFor({ data: { is_invoice: true, document_type: 'tax_invoice', billed_to_name: 'Particle Aesthetic Science', currency: 'USD', amount_before_vat: 1000 }, li, prod: { brand_id: 'biomella' }, others: [] }).map(x => x.code), ['wrong_company']);
});

test('every email opens with the company, Blurr says it is not paid by Particle', () => {
  const prod = { id: 'PRD26-52', brand_id: 'blurr', project_name: 'Q4 TV', stage: 'Post', planned_start: '2026-08-12', planned_end: '2026-09-30', planned_budget_2026: 3895 };
  const m = tpl.changes({ prod, events: [{ kind: 'completed', note: 'Delivered', meta: { work_this_month: true }, created_at: new Date() }], state: { planned: 3895, approved: false } });
  assert.match(m.subject, /^\[Blurr\] 2652 Q4 TV — marked Completed/);
  assert.match(m.html, /BLURR/);
  assert.match(m.html, /not paid by Particle/);
});
