/**
 * API integration test suite
 * Run:  node tests/api.test.js
 * Requires the full Docker stack to be running (npm run docker:dev or docker compose up -d)
 */

const BASE = process.env.API_URL || 'http://localhost';

// ─── tiny http client ─────────────────────────────────────────────────────────
let TOKEN = '';

async function req(method, path, body) {
  const headers = { 'Content-Type': 'application/json' };
  if (TOKEN) headers['Authorization'] = `Bearer ${TOKEN}`;
  const res = await fetch(`${BASE}/api${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  let json;
  try { json = await res.json(); } catch { json = null; }
  return { status: res.status, body: json };
}

const get    = (p)    => req('GET',    p);
const post   = (p, b) => req('POST',   p, b);
const patch  = (p, b) => req('PATCH',  p, b);
const put    = (p, b) => req('PUT',    p, b);
const del    = (p)    => req('DELETE', p);

// ─── test runner ─────────────────────────────────────────────────────────────
const results = [];

async function test(name, fn) {
  try {
    const msg = await fn();
    results.push({ ok: true, name, msg: msg || 'ok' });
    process.stdout.write(`  \x1b[32m✓\x1b[0m  ${name}\n`);
  } catch (err) {
    results.push({ ok: false, name, msg: err.message });
    process.stdout.write(`  \x1b[31m✗\x1b[0m  ${name}\n     \x1b[2m${err.message}\x1b[0m\n`);
  }
}

function expect(val, label) {
  return {
    toBe(expected) {
      if (val !== expected) throw new Error(`${label}: expected ${expected}, got ${val}`);
    },
    toBeArray() {
      if (!Array.isArray(val)) throw new Error(`${label}: expected array, got ${typeof val} — ${JSON.stringify(val)?.slice(0,120)}`);
    },
    toBeObject() {
      if (!val || typeof val !== 'object' || Array.isArray(val))
        throw new Error(`${label}: expected object, got ${typeof val}`);
    },
    toHaveField(field) {
      if (val == null || !(field in val)) throw new Error(`${label}: missing field "${field}"`);
    },
    toBeOk() {
      if (val < 200 || val >= 300) throw new Error(`${label}: HTTP ${val}`);
    },
    toBe2xx() {
      if (val < 200 || val >= 300) throw new Error(`${label}: HTTP ${val}`);
    },
  };
}

// ─── IDs tracked across tests ────────────────────────────────────────────────
let PROD_ID   = 'PRD26-01';  // seeded production
let BRAND_ID  = 'particle';
let userId, lineItemId, commentId, linkId, castId, callSheetId,
    ccPurchaseId, weeklyReportId, supplierId, groupId, ticketId,
    notifId, ganttEventId;

// ─── TESTS ───────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n\x1b[1mParticle Productions — API Test Suite\x1b[0m');
  console.log(`Target: ${BASE}/api\n`);

  // ── 1. Health ──────────────────────────────────────────────────────────────
  console.log('\x1b[1m[ Health ]\x1b[0m');
  await test('GET /health → 200', async () => {
    const r = await get('/health');
    expect(r.status, 'status').toBe(200);
    expect(r.body?.status, 'body.status').toBe('ok');
  });

  // ── 2. Auth ────────────────────────────────────────────────────────────────
  console.log('\n\x1b[1m[ Auth ]\x1b[0m');
  await test('POST /auth/login with wrong password → 401', async () => {
    const r = await post('/auth/login', { email: 'admin@demo.com', password: 'wrongpassword' });
    expect(r.status, 'status').toBe(401);
  });

  await test('POST /auth/login with valid credentials → 200 + token', async () => {
    const r = await post('/auth/login', { email: 'admin@demo.com', password: 'demo1234' });
    expect(r.status, 'status').toBe(200);
    expect(r.body, 'body').toHaveField('token');
    TOKEN = r.body.token;
  });

  await test('GET /auth/me → 200 + user object', async () => {
    const r = await get('/auth/me');
    expect(r.status, 'status').toBe(200);
    expect(r.body, 'body').toHaveField('id');
    expect(r.body, 'body').toHaveField('email');
    userId = r.body.id;
  });

  await test('POST /auth/change-password with wrong current → 400/401', async () => {
    const r = await post('/auth/change-password', { current: 'notright', next: 'newpass' });
    if (r.status !== 400 && r.status !== 401) throw new Error(`Expected 400/401, got ${r.status}`);
  });

  // ── 3. Productions ────────────────────────────────────────────────────────
  console.log('\n\x1b[1m[ Productions ]\x1b[0m');
  await test('GET /productions?brand_id=particle → array', async () => {
    const r = await get(`/productions?brand_id=${BRAND_ID}`);
    expect(r.status, 'status').toBe(200);
    expect(r.body, 'body').toBeArray();
    if (r.body.length) PROD_ID = r.body[0].id;
  });

  await test('GET /productions?brand_id=particle&year=2026 → array', async () => {
    const r = await get(`/productions?brand_id=${BRAND_ID}&year=2026`);
    expect(r.status, 'status').toBe(200);
    expect(r.body, 'body').toBeArray();
  });

  await test(`GET /productions/${PROD_ID} → single object`, async () => {
    const r = await get(`/productions/${PROD_ID}`);
    expect(r.status, 'status').toBe(200);
    expect(r.body, 'body').toHaveField('id');
  });

  await test(`PATCH /productions/${PROD_ID} → 200`, async () => {
    const r = await patch(`/productions/${PROD_ID}`, { stage: 'Production' });
    expect(r.status, 'status').toBe(200);
    expect(r.body, 'body').toHaveField('id');
  });

  // ── 4. Line Items ─────────────────────────────────────────────────────────
  console.log('\n\x1b[1m[ Line Items ]\x1b[0m');
  await test('POST /line-items → 201', async () => {
    const r = await post('/line-items', { production_id: PROD_ID, item: 'Test Item', type: 'Crew' });
    expect(r.status, 'status').toBe(201);
    expect(r.body, 'body').toHaveField('id');
    lineItemId = r.body.id;
  });

  await test('GET /line-items?production_id → array', async () => {
    const r = await get(`/line-items?production_id=${PROD_ID}`);
    expect(r.status, 'status').toBe(200);
    expect(r.body, 'body').toBeArray();
  });

  await test('GET /line-items?cc_purchase_id filter → array', async () => {
    const r = await get('/line-items?cc_purchase_id=nonexistent');
    expect(r.status, 'status').toBe(200);
    expect(r.body, 'body').toBeArray();
  });

  await test(`PATCH /line-items/${lineItemId} → 200`, async () => {
    const r = await patch(`/line-items/${lineItemId}`, { status: 'In Progress' });
    expect(r.status, 'status').toBe(200);
    expect(r.body, 'body').toHaveField('id');
  });

  await test(`DELETE /line-items/${lineItemId} → 200`, async () => {
    const r = await del(`/line-items/${lineItemId}`);
    expect(r.status, 'status').toBe(200);
  });

  // ── 5. CC Purchases ───────────────────────────────────────────────────────
  console.log('\n\x1b[1m[ CC Purchases ]\x1b[0m');
  await test('POST /cc-purchases → 201', async () => {
    const r = await post('/cc-purchases', {
      id: `cc-test-${Date.now()}`,
      production_id: PROD_ID,
      store_name: 'Test Store',
      description: 'Test purchase',
      total_amount: 150,
      purchaser_name: 'Test User',
    });
    expect(r.status, 'status').toBe(201);
    expect(r.body, 'body').toHaveField('id');
    ccPurchaseId = r.body.id;
  });

  await test('GET /cc-purchases?production_id → array', async () => {
    const r = await get(`/cc-purchases?production_id=${PROD_ID}`);
    expect(r.status, 'status').toBe(200);
    expect(r.body, 'body').toBeArray();
  });

  await test(`PATCH /cc-purchases/${ccPurchaseId} → 200`, async () => {
    const r = await patch(`/cc-purchases/${ccPurchaseId}`, { approval_status: 'Approved' });
    expect(r.status, 'status').toBe(200);
    expect(r.body?.approval_status, 'approval_status').toBe('Approved');
  });

  await test(`DELETE /cc-purchases/${ccPurchaseId} → 200`, async () => {
    const r = await del(`/cc-purchases/${ccPurchaseId}`);
    expect(r.status, 'status').toBe(200);
  });

  // ── 6. Casting ────────────────────────────────────────────────────────────
  console.log('\n\x1b[1m[ Casting ]\x1b[0m');
  await test('POST /casting → 201', async () => {
    const r = await post('/casting', { production_id: PROD_ID, name: 'Test Actor', role: 'Model' });
    expect(r.status, 'status').toBe(201);
    expect(r.body, 'body').toHaveField('id');
    castId = r.body.id;
  });

  await test('GET /casting?production_id → array', async () => {
    const r = await get(`/casting?production_id=${PROD_ID}`);
    expect(r.status, 'status').toBe(200);
    expect(r.body, 'body').toBeArray();
  });

  await test(`PATCH /casting/${castId} → 200`, async () => {
    const r = await patch(`/casting/${castId}`, { contract_status: 'Signed' });
    expect(r.status, 'status').toBe(200);
  });

  await test(`DELETE /casting/${castId} → 200`, async () => {
    const r = await del(`/casting/${castId}`);
    expect(r.status, 'status').toBe(200);
  });

  // ── 7. Call Sheets ────────────────────────────────────────────────────────
  console.log('\n\x1b[1m[ Call Sheets ]\x1b[0m');
  await test('POST /call-sheets → 201', async () => {
    const r = await post('/call-sheets', {
      id: `cs-test-${Date.now()}`,
      production_id: PROD_ID,
      title: 'Test Call Sheet',
      shoot_date: '2026-04-01',
    });
    expect(r.status, 'status').toBe(201);
    expect(r.body, 'body').toHaveField('id');
    callSheetId = r.body.id;
  });

  await test('GET /call-sheets?production_id → array', async () => {
    const r = await get(`/call-sheets?production_id=${PROD_ID}`);
    expect(r.status, 'status').toBe(200);
    expect(r.body, 'body').toBeArray();
  });

  await test(`PATCH /call-sheets/${callSheetId} → 200`, async () => {
    const r = await patch(`/call-sheets/${callSheetId}`, { title: 'Updated Call Sheet' });
    expect(r.status, 'status').toBe(200);
  });

  await test(`DELETE /call-sheets/${callSheetId} → 200`, async () => {
    const r = await del(`/call-sheets/${callSheetId}`);
    expect(r.status, 'status').toBe(200);
  });

  // ── 8. Weekly Reports ─────────────────────────────────────────────────────
  console.log('\n\x1b[1m[ Weekly Reports ]\x1b[0m');
  await test('PUT /weekly-reports (upsert) → 200', async () => {
    const r = await put('/weekly-reports', {
      id: `wr-test-${Date.now()}`,
      brand_id: BRAND_ID,
      week_start: '2026-03-23',
      entries: [],
    });
    expect(r.status, 'status').toBe(200);
    expect(r.body, 'body').toHaveField('id');
    weeklyReportId = r.body.id;
  });

  await test('GET /weekly-reports?brand_id → array', async () => {
    const r = await get(`/weekly-reports?brand_id=${BRAND_ID}`);
    expect(r.status, 'status').toBe(200);
    expect(r.body, 'body').toBeArray();
  });

  await test(`GET /weekly-reports/${weeklyReportId} → object`, async () => {
    const r = await get(`/weekly-reports/${weeklyReportId}`);
    expect(r.status, 'status').toBe(200);
    expect(r.body, 'body').toHaveField('id');
  });

  await test(`DELETE /weekly-reports/${weeklyReportId} → 200`, async () => {
    const r = await del(`/weekly-reports/${weeklyReportId}`);
    expect(r.status, 'status').toBe(200);
  });

  // ── 9. Comments ───────────────────────────────────────────────────────────
  console.log('\n\x1b[1m[ Comments ]\x1b[0m');
  await test('POST /comments → 201', async () => {
    const r = await post('/comments', { production_id: PROD_ID, body: 'Test comment' });
    expect(r.status, 'status').toBe(201);
    commentId = r.body.id;
  });

  await test('GET /comments?production_id → array', async () => {
    const r = await get(`/comments?production_id=${PROD_ID}`);
    expect(r.status, 'status').toBe(200);
    expect(r.body, 'body').toBeArray();
  });

  await test(`PATCH /comments/${commentId} → 200`, async () => {
    const r = await patch(`/comments/${commentId}`, { body: 'Updated comment' });
    expect(r.status, 'status').toBe(200);
  });

  await test(`DELETE /comments/${commentId} → 200`, async () => {
    const r = await del(`/comments/${commentId}`);
    expect(r.status, 'status').toBe(200);
  });

  // ── 10. Links ─────────────────────────────────────────────────────────────
  console.log('\n\x1b[1m[ Links ]\x1b[0m');
  await test('POST /links → 201', async () => {
    const r = await post('/links', {
      production_id: PROD_ID,
      url: 'https://example.com',
      title: 'Test Link',
      category: 'General',
    });
    expect(r.status, 'status').toBe(201);
    linkId = r.body.id;
  });

  await test('GET /links?production_id → array', async () => {
    const r = await get(`/links?production_id=${PROD_ID}`);
    expect(r.status, 'status').toBe(200);
    expect(r.body, 'body').toBeArray();
  });

  await test(`PATCH /links/${linkId} → 200`, async () => {
    const r = await patch(`/links/${linkId}`, { title: 'Updated Link' });
    expect(r.status, 'status').toBe(200);
  });

  await test(`GET /links/categories/${PROD_ID} → object/array`, async () => {
    const r = await get(`/links/categories/${PROD_ID}`);
    expect(r.status, 'status').toBe(200);
  });

  await test(`DELETE /links/${linkId} → 200`, async () => {
    const r = await del(`/links/${linkId}`);
    expect(r.status, 'status').toBe(200);
  });

  // ── 11. Contracts ─────────────────────────────────────────────────────────
  console.log('\n\x1b[1m[ Contracts ]\x1b[0m');
  await test('GET /contracts → array', async () => {
    const r = await get('/contracts');
    expect(r.status, 'status').toBe(200);
    expect(r.body, 'body').toBeArray();
  });

  await test(`PUT /contracts/${PROD_ID} (upsert) → 200/201`, async () => {
    const r = await put(`/contracts/${PROD_ID}`, { provider_name: 'Test Provider', status: 'none' });
    if (r.status !== 200 && r.status !== 201) throw new Error(`Expected 200/201, got ${r.status}`);
  });

  await test(`GET /contracts/${PROD_ID} → object`, async () => {
    const r = await get(`/contracts/${PROD_ID}`);
    expect(r.status, 'status').toBe(200);
  });

  // ── 12. Invoices ──────────────────────────────────────────────────────────
  console.log('\n\x1b[1m[ Invoices ]\x1b[0m');
  await test('GET /invoices?production_id → array', async () => {
    const r = await get(`/invoices?production_id=${PROD_ID}`);
    expect(r.status, 'status').toBe(200);
    expect(r.body, 'body').toBeArray();
  });

  await test('POST /invoices → 201', async () => {
    const r = await post('/invoices', { production_id: PROD_ID, amount: 500, supplier_name: 'Test Vendor' });
    expect(r.status, 'status').toBe(201);
  });

  // ── 13. Receipts ──────────────────────────────────────────────────────────
  console.log('\n\x1b[1m[ Receipts ]\x1b[0m');
  await test('GET /receipts?production_id → array', async () => {
    const r = await get(`/receipts?production_id=${PROD_ID}`);
    expect(r.status, 'status').toBe(200);
    expect(r.body, 'body').toBeArray();
  });

  // ── 14. Suppliers ─────────────────────────────────────────────────────────
  console.log('\n\x1b[1m[ Suppliers ]\x1b[0m');
  await test('GET /suppliers → array', async () => {
    const r = await get('/suppliers');
    expect(r.status, 'status').toBe(200);
    expect(r.body, 'body').toBeArray();
  });

  await test('POST /suppliers → 201', async () => {
    const r = await post('/suppliers', { full_name: 'Test Supplier', category: 'Equipment' });
    expect(r.status, 'status').toBe(201);
    supplierId = r.body.id;
  });

  await test(`PATCH /suppliers/${supplierId} → 200`, async () => {
    const r = await patch(`/suppliers/${supplierId}`, { full_name: 'Updated Supplier' });
    expect(r.status, 'status').toBe(200);
  });

  await test('GET /suppliers/submissions → array', async () => {
    const r = await get('/suppliers/submissions');
    expect(r.status, 'status').toBe(200);
    expect(r.body, 'body').toBeArray();
  });

  await test(`DELETE /suppliers/${supplierId} → 200`, async () => {
    const r = await del(`/suppliers/${supplierId}`);
    expect(r.status, 'status').toBe(200);
  });

  // ── 15. People on Set ─────────────────────────────────────────────────────
  console.log('\n\x1b[1m[ People on Set ]\x1b[0m');
  await test('GET /people-on-set?production_id → array', async () => {
    const r = await get(`/people-on-set?production_id=${PROD_ID}`);
    expect(r.status, 'status').toBe(200);
    expect(r.body, 'body').toBeArray();
  });

  await test('POST /people-on-set → 201', async () => {
    const r = await post('/people-on-set', { production_id: PROD_ID, name: 'Test Person', role: 'Director' });
    expect(r.status, 'status').toBe(201);
    const personId = r.body.id;
    await del(`/people-on-set/${personId}`);
  });

  // ── 16. Gantt ─────────────────────────────────────────────────────────────
  console.log('\n\x1b[1m[ Gantt ]\x1b[0m');
  await test(`GET /gantt/phases?production_id → object/array`, async () => {
    const r = await get(`/gantt/phases?production_id=${PROD_ID}`);
    expect(r.status, 'status').toBe(200);
  });

  await test(`GET /gantt/events?production_id → array`, async () => {
    const r = await get(`/gantt/events?production_id=${PROD_ID}`);
    expect(r.status, 'status').toBe(200);
    expect(r.body, 'body').toBeArray();
  });

  await test('POST /gantt/events → 201', async () => {
    const r = await post('/gantt/events', {
      production_id: PROD_ID,
      title: 'Test Event',
      start_date: '2026-04-01',
      end_date: '2026-04-02',
    });
    expect(r.status, 'status').toBe(201);
    ganttEventId = r.body.id;
  });

  if (ganttEventId) {
    await test(`PATCH /gantt/events/${ganttEventId} → 200`, async () => {
      const r = await patch(`/gantt/events/${ganttEventId}`, { title: 'Updated Event' });
      expect(r.status, 'status').toBe(200);
    });

    await test(`DELETE /gantt/events/${ganttEventId} → 200`, async () => {
      const r = await del(`/gantt/events/${ganttEventId}`);
      expect(r.status, 'status').toBe(200);
    });
  }

  // ── 17. Change History ────────────────────────────────────────────────────
  console.log('\n\x1b[1m[ Change History ]\x1b[0m');
  await test('GET /change-history?production_id → array', async () => {
    const r = await get(`/change-history?production_id=${PROD_ID}`);
    expect(r.status, 'status').toBe(200);
    expect(r.body, 'body').toBeArray();
  });

  // ── 18. Notifications ─────────────────────────────────────────────────────
  console.log('\n\x1b[1m[ Notifications ]\x1b[0m');
  await test('GET /notifications → array', async () => {
    const r = await get('/notifications');
    expect(r.status, 'status').toBe(200);
    expect(r.body, 'body').toBeArray();
  });

  await test('POST /notifications → 201', async () => {
    const r = await post('/notifications', { message: 'Test notification', type: 'info' });
    expect(r.status, 'status').toBe(201);
    notifId = r.body.id;
  });

  if (notifId) {
    await test(`PATCH /notifications/${notifId}/read → 200`, async () => {
      const r = await patch(`/notifications/${notifId}/read`, {});
      expect(r.status, 'status').toBe(200);
    });
  }

  await test('POST /notifications/read-all → 200', async () => {
    const r = await post('/notifications/read-all', {});
    expect(r.status, 'status').toBe(200);
  });

  await test('DELETE /notifications → 200 (clear all)', async () => {
    const r = await del('/notifications');
    expect(r.status, 'status').toBe(200);
  });

  // ── 19. Groups ────────────────────────────────────────────────────────────
  console.log('\n\x1b[1m[ Groups ]\x1b[0m');
  await test('GET /groups → array', async () => {
    const r = await get('/groups');
    expect(r.status, 'status').toBe(200);
    expect(r.body, 'body').toBeArray();
  });

  await test('POST /groups → 201', async () => {
    const r = await post('/groups', { name: 'Test Group', role: 'Editor', members: [] });
    expect(r.status, 'status').toBe(201);
    groupId = r.body.id;
  });

  await test(`PATCH /groups/${groupId} → 200`, async () => {
    const r = await patch(`/groups/${groupId}`, { name: 'Updated Group' });
    expect(r.status, 'status').toBe(200);
  });

  await test(`DELETE /groups/${groupId} → 200`, async () => {
    const r = await del(`/groups/${groupId}`);
    expect(r.status, 'status').toBe(200);
  });

  // ── 20. Users ─────────────────────────────────────────────────────────────
  console.log('\n\x1b[1m[ Users ]\x1b[0m');
  await test('GET /users → array with brand_ids', async () => {
    const r = await get('/users');
    expect(r.status, 'status').toBe(200);
    expect(r.body, 'body').toBeArray();
    if (r.body.length && !('brand_ids' in r.body[0]))
      throw new Error('Missing brand_ids field on user');
  });

  let testUserId;
  await test('POST /users → 201', async () => {
    const r = await post('/users', {
      email: `test_${Date.now()}@example.com`,
      name: 'Test User',
      role: 'Viewer',
      password: 'testpass123',
      must_change_password: true,
    });
    expect(r.status, 'status').toBe(201);
    testUserId = r.body.id;
  });

  if (testUserId) {
    await test(`PATCH /users/${testUserId} → 200`, async () => {
      const r = await patch(`/users/${testUserId}`, { role: 'Editor' });
      expect(r.status, 'status').toBe(200);
    });

    await test(`DELETE /users/${testUserId} → 200`, async () => {
      const r = await del(`/users/${testUserId}`);
      expect(r.status, 'status').toBe(200);
    });
  }

  // ── 21. Brands ────────────────────────────────────────────────────────────
  console.log('\n\x1b[1m[ Brands ]\x1b[0m');
  await test('GET /brands → array', async () => {
    const r = await get('/brands');
    expect(r.status, 'status').toBe(200);
    expect(r.body, 'body').toBeArray();
  });

  // ── 22. Settings ──────────────────────────────────────────────────────────
  console.log('\n\x1b[1m[ Settings ]\x1b[0m');
  await test(`GET /settings/${BRAND_ID} → object`, async () => {
    const r = await get(`/settings/${BRAND_ID}`);
    expect(r.status, 'status').toBe(200);
  });

  await test(`GET /settings/view-order/dashboard → object`, async () => {
    const r = await get('/settings/view-order/dashboard');
    expect(r.status, 'status').toBe(200);
  });

  // ── 23. Lists ─────────────────────────────────────────────────────────────
  console.log('\n\x1b[1m[ Lists ]\x1b[0m');
  await test('GET /lists → object with list keys', async () => {
    const r = await get('/lists');
    expect(r.status, 'status').toBe(200);
    expect(r.body, 'body').toBeObject();
  });

  await test('GET /lists/budget-cols/global → object', async () => {
    const r = await get('/lists/budget-cols/global');
    expect(r.status, 'status').toBe(200);
  });

  // ── 24. Improvement Tickets ───────────────────────────────────────────────
  console.log('\n\x1b[1m[ Improvement Tickets ]\x1b[0m');
  await test('GET /tickets → array', async () => {
    const r = await get('/tickets');
    expect(r.status, 'status').toBe(200);
    expect(r.body, 'body').toBeArray();
  });

  await test('POST /tickets → 201', async () => {
    const r = await post('/tickets', { title: 'Test Ticket', description: 'Test', priority: 'Low' });
    expect(r.status, 'status').toBe(201);
    ticketId = r.body.id;
  });

  if (ticketId) {
    await test(`PATCH /tickets/${ticketId} → 200`, async () => {
      const r = await patch(`/tickets/${ticketId}`, { status: 'In Progress' });
      expect(r.status, 'status').toBe(200);
    });

    await test(`DELETE /tickets/${ticketId} → 200`, async () => {
      const r = await del(`/tickets/${ticketId}`);
      expect(r.status, 'status').toBe(200);
    });
  }

  // ── 25. Form Configs ──────────────────────────────────────────────────────
  console.log('\n\x1b[1m[ Form Configs ]\x1b[0m');
  await test(`GET /form-configs/${PROD_ID} → 200`, async () => {
    const r = await get(`/form-configs/${PROD_ID}`);
    expect(r.status, 'status').toBe(200);
  });

  // ── 26. Admin ─────────────────────────────────────────────────────────────
  console.log('\n\x1b[1m[ Admin ]\x1b[0m');
  await test('GET /admin/version → 200', async () => {
    const r = await get('/admin/version');
    expect(r.status, 'status').toBe(200);
  });

  // ── 27. Auth guard: unauthenticated request ───────────────────────────────
  console.log('\n\x1b[1m[ Auth Guard ]\x1b[0m');
  await test('GET /productions without token → 401', async () => {
    const savedToken = TOKEN;
    TOKEN = '';
    const r = await get('/productions');
    TOKEN = savedToken;
    expect(r.status, 'status').toBe(401);
  });

  // ── Summary ───────────────────────────────────────────────────────────────
  const passed = results.filter(r => r.ok).length;
  const failed = results.filter(r => !r.ok).length;
  console.log(`\n${'─'.repeat(50)}`);
  console.log(`\x1b[1mResults: \x1b[32m${passed} passed\x1b[0m\x1b[1m, \x1b[31m${failed} failed\x1b[0m\x1b[1m / ${results.length} total\x1b[0m`);

  if (failed > 0) {
    console.log('\n\x1b[1mFailed tests:\x1b[0m');
    results.filter(r => !r.ok).forEach(r => {
      console.log(`  \x1b[31m✗\x1b[0m ${r.name}\n    \x1b[2m${r.msg}\x1b[0m`);
    });
    process.exit(1);
  } else {
    console.log('\n\x1b[32mAll tests passed!\x1b[0m\n');
  }
}

main().catch(err => {
  console.error('\x1b[31mFatal error:\x1b[0m', err.message);
  process.exit(1);
});
