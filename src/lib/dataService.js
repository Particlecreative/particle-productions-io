// =============================================
// DATA SERVICE — dual mode
//   DEV  (import.meta.env.DEV) → localStorage + mock data (no backend required)
//   PROD (Docker/nginx)        → REST API via apiClient.js
// =============================================
import { api, apiGet, apiPost, apiPatch, apiPut, apiDelete } from './apiClient';
import {
  PARTICLE_PRODUCTIONS,
  SAMPLE_LINE_ITEMS,
  SAMPLE_COMMENTS,
  SAMPLE_LINKS,
  SAMPLE_USERS,
  SAMPLE_CC_PURCHASES,
  SAMPLE_CASTING,
} from './mockData';
import {
  getGanttPhases as _getGanttPhases,
  saveGanttPhases as _saveGanttPhases,
  resetGanttPhases as _resetGanttPhases,
  getGanttEvents as _getGanttEvents,
  getAllGanttEvents as _getAllGanttEvents,
  createGanttEvent as _createGanttEvent,
  updateGanttEvent as _updateGanttEvent,
  deleteGanttEvent as _deleteGanttEvent,
} from './ganttService';
import { getList, saveList, resetList } from './listService';

const IS_DEV = import.meta.env.DEV;

// ── Default brands (used as localStorage fallback) ──────────────────────────
const DEFAULT_BRANDS = [
  { id: 'particle', name: 'Particle', tagline: 'For Men', bg: '#b7b7b7', primary: '#030b2e', secondary: '#0808f8', accent: '#0808f8' },
  { id: 'blurr',    name: 'Blurr',   tagline: '',         bg: '#F5F5F5', primary: '#B842A9', secondary: '#862F7B', accent: '#B842A9' },
];

// ── localStorage helpers ─────────────────────────────────────────────────────
function read(key, fallback) {
  try {
    const val = localStorage.getItem(key);
    return val ? JSON.parse(val) : fallback;
  } catch { return fallback; }
}

function write(key, data) {
  localStorage.setItem(key, JSON.stringify(data));
}

export const DEFAULT_LINK_CATEGORIES = [
  { id: 'Concepts',     label: '💡 Concepts',     order: 0 },
  { id: 'Scripts',      label: '📄 Scripts',      order: 1 },
  { id: 'Shooting',     label: '🎬 Shooting',     order: 2 },
  { id: 'References',   label: '📌 References',   order: 3 },
  { id: 'Deliverables', label: '📦 Deliverables', order: 4 },
  { id: 'Other',        label: '🔗 Other',        order: 5 },
];

// ── Initialize from seed data (dev only) ────────────────────────────────────
const DATA_VERSION = '5'; // bump when new seed tables are added
export function initializeData() {
  if (!IS_DEV) return;
  if (localStorage.getItem('cp_initialized') === DATA_VERSION) return;
  // Reset so new tables get seeded
  localStorage.removeItem('cp_initialized');
  write('cp_productions',    PARTICLE_PRODUCTIONS);
  write('cp_line_items',     Object.values(SAMPLE_LINE_ITEMS).flat());
  write('cp_comments',       Object.values(SAMPLE_COMMENTS).flat());
  write('cp_links',          Object.values(SAMPLE_LINKS).flat());
  write('cp_notifications',  []);
  write('cp_change_history', []);
  write('cp_contracts',      []);
  write('cp_invoices',       []);
  write('cp_receipts',       []);
  write('cp_cc_purchases',   SAMPLE_CC_PURCHASES);
  write('cp_casting',        SAMPLE_CASTING);
  write('cp_call_sheets',    []);
  write('cp_settings',       { particle: { colors: {}, fonts: {}, logo_url: null }, blurr: { colors: {}, fonts: {}, logo_url: null } });
  localStorage.setItem('cp_initialized', DATA_VERSION);
}

// ========== PRODUCTIONS ==========
export function getProductions(brandId, year = null) {
  if (IS_DEV) {
    const all = read('cp_productions', PARTICLE_PRODUCTIONS);
    let result = all.filter(p => p.brand_id === brandId);
    if (year) result = result.filter(p => (p.production_year || 2026) === year);
    return result;
  }
  const q = year ? `&year=${year}` : '';
  return apiGet(`/productions?brand_id=${encodeURIComponent(brandId)}${q}`);
}

export function getProduction(id) {
  if (IS_DEV) {
    const all = read('cp_productions', PARTICLE_PRODUCTIONS);
    return all.find(p => p.id === id) ?? null;
  }
  return apiGet(`/productions/${encodeURIComponent(id)}`);
}

export function createProduction(prod) {
  if (IS_DEV) {
    const all = read('cp_productions', PARTICLE_PRODUCTIONS);
    all.push(prod);
    write('cp_productions', all);
    return prod;
  }
  return apiPost('/productions', prod);
}

export function updateProduction(id, updates, userId, userName) {
  if (IS_DEV) {
    const all = read('cp_productions', PARTICLE_PRODUCTIONS);
    const idx = all.findIndex(p => p.id === id);
    if (idx === -1) return null;
    const old = { ...all[idx] };
    all[idx] = { ...all[idx], ...updates };
    write('cp_productions', all);
    Object.keys(updates).forEach(field => {
      if (old[field] !== updates[field]) {
        logChange(id, field, old[field], updates[field], userId, userName);
      }
    });
    return all[idx];
  }
  return apiPatch(`/productions/${encodeURIComponent(id)}`, updates);
}

// ========== LINE ITEMS ==========
export function getLineItems(productionId) {
  if (IS_DEV) {
    const all = read('cp_line_items', []);
    return all.filter(li => li.production_id === productionId);
  }
  return apiGet(`/line-items?production_id=${encodeURIComponent(productionId)}`);
}

export function getLineItem(id) {
  if (IS_DEV) return read('cp_line_items', []).find(li => li.id === id) || null;
  return apiGet(`/line-items/${encodeURIComponent(id)}`);
}

export function createLineItem(item) {
  if (IS_DEV) {
    const all = read('cp_line_items', []);
    all.push(item);
    write('cp_line_items', all);
    return item;
  }
  return apiPost('/line-items', item);
}

export function updateLineItem(id, updates) {
  if (IS_DEV) {
    const all = read('cp_line_items', []);
    const idx = all.findIndex(li => li.id === id);
    if (idx === -1) return null;
    all[idx] = { ...all[idx], ...updates };
    write('cp_line_items', all);
    return all[idx];
  }
  return apiPatch(`/line-items/${encodeURIComponent(id)}`, updates);
}

export function deleteLineItem(id) {
  if (IS_DEV) {
    write('cp_line_items', read('cp_line_items', []).filter(li => li.id !== id));
    return null;
  }
  return apiDelete(`/line-items/${encodeURIComponent(id)}`);
}

export function getAllLineItems() {
  if (IS_DEV) return read('cp_line_items', []);
  return apiGet('/line-items');
}

// ========== COMMENTS ==========
export function getComments(productionId) {
  if (IS_DEV) {
    const all = read('cp_comments', []);
    return all.filter(c => c.production_id === productionId).sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  }
  return apiGet(`/comments?production_id=${encodeURIComponent(productionId)}`);
}

export function createComment(comment) {
  if (IS_DEV) {
    const all = read('cp_comments', []);
    all.push(comment);
    write('cp_comments', all);
    return comment;
  }
  return apiPost('/comments', comment);
}

export function updateComment(id, body) {
  if (IS_DEV) {
    const all = read('cp_comments', []);
    const idx = all.findIndex(c => c.id === id);
    if (idx === -1) return null;
    all[idx].body = body;
    write('cp_comments', all);
    return all[idx];
  }
  return apiPatch(`/comments/${encodeURIComponent(id)}`, { body });
}

export function deleteComment(id) {
  if (IS_DEV) {
    write('cp_comments', read('cp_comments', []).filter(c => c.id !== id));
    return null;
  }
  return apiDelete(`/comments/${encodeURIComponent(id)}`);
}

// ========== LINKS ==========
export function getLinks(productionId) {
  if (IS_DEV) {
    const all = read('cp_links', []);
    return all.filter(l => l.production_id === productionId);
  }
  return apiGet(`/links?production_id=${encodeURIComponent(productionId)}`);
}

export function createLink(link) {
  if (IS_DEV) {
    const all = read('cp_links', []);
    all.push(link);
    write('cp_links', all);
    return link;
  }
  return apiPost('/links', link);
}

export function getAllLinks() {
  if (IS_DEV) return read('cp_links', []);
  return apiGet('/links');
}

export function updateLink(id, updates) {
  if (IS_DEV) {
    const all = read('cp_links', []);
    const idx = all.findIndex(l => l.id === id);
    if (idx === -1) return null;
    all[idx] = { ...all[idx], ...updates };
    write('cp_links', all);
    return all[idx];
  }
  return apiPatch(`/links/${encodeURIComponent(id)}`, updates);
}

export function deleteLink(id) {
  if (IS_DEV) {
    write('cp_links', read('cp_links', []).filter(l => l.id !== id));
    return null;
  }
  return apiDelete(`/links/${encodeURIComponent(id)}`);
}

// ========== NOTIFICATIONS ==========
export function getNotifications(userId) {
  if (IS_DEV) {
    const all = read('cp_notifications', []);
    return all.filter(n => n.user_id === userId).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }
  return apiGet('/notifications');
}

export function createNotification(notif) {
  if (IS_DEV) {
    const all = read('cp_notifications', []);
    all.unshift(notif);
    write('cp_notifications', all);
    return notif;
  }
  return apiPost('/notifications', notif);
}

export function markNotificationRead(id) {
  if (IS_DEV) {
    const all = read('cp_notifications', []);
    const idx = all.findIndex(n => n.id === id);
    if (idx !== -1) { all[idx].read = true; write('cp_notifications', all); }
    return null;
  }
  return api(`/notifications/${encodeURIComponent(id)}/read`, { method: 'PATCH' });
}

export function markAllNotificationsRead(userId) {
  if (IS_DEV) {
    const all = read('cp_notifications', []);
    all.forEach(n => { if (n.user_id === userId) n.read = true; });
    write('cp_notifications', all);
    return null;
  }
  return apiPost('/notifications/read-all', {});
}

export function clearAllNotifications(userId) {
  if (IS_DEV) {
    const all = read('cp_notifications', []);
    write('cp_notifications', all.filter(n => n.user_id !== userId));
    return null;
  }
  return apiDelete('/notifications');
}

// ========== CHANGE HISTORY ==========
export function getChangeHistory(productionId) {
  if (IS_DEV) {
    const all = read('cp_change_history', []);
    return all.filter(h => h.production_id === productionId).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }
  return apiGet(`/change-history?production_id=${encodeURIComponent(productionId)}`);
}

export function logChange(productionId, field, oldValue, newValue, userId, userName) {
  if (IS_DEV) {
    const all = read('cp_change_history', []);
    all.unshift({ id: `ch-${Date.now()}`, production_id: productionId, field, old_value: oldValue, new_value: newValue, user_id: userId, user_name: userName, created_at: new Date().toISOString() });
    write('cp_change_history', all);
    return null;
  }
  return apiPost('/change-history', { production_id: productionId, field, old_value: oldValue, new_value: newValue, user_name: userName });
}

export function getAllChangeHistory() {
  if (IS_DEV) return read('cp_change_history', []);
  return apiGet('/change-history');
}

// ========== VIEW ORDER ==========
export function saveViewOrder(viewKey, userId, order, forAll) {
  if (IS_DEV) {
    const all = read('cp_view_orders', []);
    const idx = all.findIndex(v => v.view_key === viewKey && v.user_id === userId);
    const entry = { view_key: viewKey, user_id: userId, order, for_all: forAll };
    if (idx === -1) all.push(entry); else all[idx] = entry;
    write('cp_view_orders', all);
    return entry;
  }
  return apiPut(`/settings/view-order/${encodeURIComponent(viewKey)}`, { order, for_all: forAll });
}

export function getViewOrder(viewKey, userId) {
  if (IS_DEV) {
    const all = read('cp_view_orders', []);
    const entry = all.find(v => v.view_key === viewKey && (v.for_all || v.user_id === userId));
    return entry?.order ?? null;
  }
  return apiGet(`/settings/view-order/${encodeURIComponent(viewKey)}`);
}

// ========== CONTRACTS ==========
export function getContract(productionId) {
  if (IS_DEV) {
    return read('cp_contracts', []).find(c => c.production_id === productionId) ?? null;
  }
  return apiGet(`/contracts/${encodeURIComponent(productionId)}`);
}

export function upsertContract(contract) {
  if (IS_DEV) {
    const all = read('cp_contracts', []);
    const idx = all.findIndex(c => c.production_id === contract.production_id);
    if (idx === -1) all.push(contract); else all[idx] = { ...all[idx], ...contract };
    write('cp_contracts', all);
    return contract;
  }
  return apiPut(`/contracts/${encodeURIComponent(contract.production_id)}`, contract);
}

export function getContracts() {
  if (IS_DEV) return read('cp_contracts', []);
  return apiGet('/contracts');
}

export function generateContractSignatures(productionId, data) {
  if (IS_DEV) {
    // In dev mode, simulate generating signing links
    const token1 = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
    const token2 = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
    const fakeId = 'dev-' + Date.now();
    const baseUrl = window.location.origin;
    const contract = upsertContract({
      production_id: productionId,
      provider_name: data.provider_name,
      provider_email: data.provider_email,
      status: 'pending',
      events: [{ type: 'created', at: new Date().toISOString() }],
    });
    return {
      contract,
      signing_links: {
        provider: { url: `${baseUrl}/sign/${fakeId}/${token1}`, name: data.provider_name, email: data.provider_email },
        hocp:     { url: `${baseUrl}/sign/${fakeId}/${token2}`, name: data.hocp_name || 'Omer Barak', email: data.hocp_email || 'omer@particleformen.com' },
      },
    };
  }
  return apiPost(`/contracts/${encodeURIComponent(productionId)}/generate`, data);
}

export function getContractSignatures(productionId) {
  if (IS_DEV) {
    return { signatures: [], contract: getContract(productionId) };
  }
  return apiGet(`/contracts/${encodeURIComponent(productionId)}/signatures`);
}

// ========== GOOGLE DRIVE ==========
export function getDriveAuthUrl() {
  return apiGet('/drive/auth');
}

export function getDriveStatus() {
  return apiGet('/drive/status');
}

export function uploadToDrive({ fileName, fileContent, mimeType, subfolder }) {
  return apiPost('/drive/upload', { fileName, fileContent, mimeType, subfolder });
}

// ========== INVOICES ==========
export function getInvoices(lineItemId) {
  if (IS_DEV) {
    return read('cp_invoices', []).filter(inv => inv.line_item_id === lineItemId);
  }
  return apiGet(`/invoices?line_item_id=${encodeURIComponent(lineItemId)}`);
}

export function createInvoice(invoice) {
  if (IS_DEV) {
    const all = read('cp_invoices', []);
    all.push(invoice);
    write('cp_invoices', all);
    return invoice;
  }
  return apiPost('/invoices', invoice);
}

export function updateInvoice(id, updates) {
  if (IS_DEV) {
    const all = read('cp_invoices', []);
    const idx = all.findIndex(inv => inv.id === id);
    if (idx !== -1) { all[idx] = { ...all[idx], ...updates }; write('cp_invoices', all); }
    return null;
  }
  return apiPatch(`/invoices/${encodeURIComponent(id)}`, updates);
}

export function getAllInvoices() {
  if (IS_DEV) return read('cp_invoices', []);
  return apiGet('/invoices');
}

// ========== RECEIPTS ==========
export function getReceipts() {
  if (IS_DEV) return read('cp_receipts', []);
  return apiGet('/receipts');
}

export function createReceipt(receipt) {
  if (IS_DEV) {
    const all = read('cp_receipts', []);
    all.push(receipt);
    write('cp_receipts', all);
    return receipt;
  }
  return apiPost('/receipts', receipt);
}

export function updateReceipt(id, patch) {
  if (IS_DEV) {
    const all = read('cp_receipts', []);
    const idx = all.findIndex(r => r.id === id);
    if (idx !== -1) { all[idx] = { ...all[idx], ...patch }; write('cp_receipts', all); }
    return null;
  }
  return apiPatch(`/receipts/${encodeURIComponent(id)}`, patch);
}

export function getPendingReceipts() {
  if (IS_DEV) {
    return read('cp_receipts', []).filter(r => !r.receipt_url);
  }
  return apiGet('/receipts?pending=true');
}

// ========== SETTINGS ==========
export function getSettings(brandId) {
  if (IS_DEV) {
    const all = read('cp_settings', { particle: { colors: {}, fonts: {}, logo_url: null }, blurr: { colors: {}, fonts: {}, logo_url: null } });
    return all[brandId] ?? {};
  }
  return apiGet(`/settings/${encodeURIComponent(brandId)}`);
}

export function updateSettings(brandId, updates) {
  if (IS_DEV) {
    const all = read('cp_settings', { particle: { colors: {}, fonts: {}, logo_url: null }, blurr: { colors: {}, fonts: {}, logo_url: null } });
    all[brandId] = { ...all[brandId], ...updates };
    write('cp_settings', all);
    return all[brandId];
  }
  return api(`/settings/${encodeURIComponent(brandId)}`, { method: 'PATCH', body: updates });
}

// ========== STANDARD CREW ==========
export async function addStandardCrew(productionId) {
  const crewItems = [
    { item: 'Technical Photographer', type: 'Crew' },
    { item: 'Director',               type: 'Crew' },
    { item: 'Offline Editor',         type: 'Post' },
    { item: 'Online Editor',          type: 'Post' },
    { item: 'Sound Designer',         type: 'Post' },
  ];
  for (const crew of crewItems) {
    await createLineItem({
      id: generateId('li'),
      production_id: productionId,
      item: crew.item,
      type: crew.type,
      status: 'Not Started',
      planned_budget: 0,
      actual_spent: 0,
      payment_status: 'Not Paid',
    });
  }
}

// ========== IMPROVEMENT TICKETS ==========
export function getImprovementTickets() {
  if (IS_DEV) return read('cp_improvement_tickets', []);
  return apiGet('/tickets');
}

export function createImprovementTicket(ticket) {
  if (IS_DEV) {
    const all = read('cp_improvement_tickets', []);
    const full = { id: generateId('ticket'), created_at: new Date().toISOString(), updated_at: new Date().toISOString(), ...ticket };
    all.push(full);
    write('cp_improvement_tickets', all);
    return full;
  }
  return apiPost('/tickets', ticket);
}

export function updateImprovementTicket(id, patch) {
  if (IS_DEV) {
    const all = read('cp_improvement_tickets', []);
    const idx = all.findIndex(t => t.id === id);
    if (idx !== -1) { all[idx] = { ...all[idx], ...patch, updated_at: new Date().toISOString() }; write('cp_improvement_tickets', all); }
    return null;
  }
  return apiPatch(`/tickets/${encodeURIComponent(id)}`, patch);
}

export function deleteImprovementTicket(id) {
  if (IS_DEV) {
    write('cp_improvement_tickets', read('cp_improvement_tickets', []).filter(t => t.id !== id));
    return null;
  }
  return apiDelete(`/tickets/${encodeURIComponent(id)}`);
}

// ========== BUDGET CUSTOM COLUMNS ==========
export function getGlobalBudgetCustomCols() {
  if (IS_DEV) return read('cp_budget_custom_cols', []);
  return apiGet('/lists/budget-cols/global');
}

export function saveGlobalBudgetCustomCols(cols) {
  if (IS_DEV) {
    write('cp_budget_custom_cols', cols);
    return cols;
  }
  return apiPut('/lists/budget-cols/global', { cols });
}

export function getProductionCustomCols(production) {
  function merge(global) {
    const g = global || [];
    const perBoard = Array.isArray(production?.custom_columns) ? production.custom_columns : [];
    const seen = new Set(g.map(c => c.key));
    const extra = perBoard.filter(c => !seen.has(c.key));
    return [...g, ...extra];
  }
  const globalResult = getGlobalBudgetCustomCols(); // sync array in DEV, Promise in PROD
  if (globalResult && typeof globalResult.then === 'function') {
    return globalResult.then(merge);
  }
  return merge(globalResult);
}

// ========== LINK CATEGORIES ==========
export function getLinkCategories(productionId) {
  if (IS_DEV) {
    const all = read('cp_link_categories', {});
    const cats = all[productionId];
    return (cats && cats.length > 0) ? cats : DEFAULT_LINK_CATEGORIES;
  }
  return apiGet(`/links/categories/${encodeURIComponent(productionId)}`).then(cats => {
    return (cats && cats.length > 0) ? cats : DEFAULT_LINK_CATEGORIES;
  }).catch(() => DEFAULT_LINK_CATEGORIES);
}

export function saveLinkCategories(productionId, categories) {
  if (IS_DEV) {
    const all = read('cp_link_categories', {});
    all[productionId] = categories;
    write('cp_link_categories', all);
    return categories;
  }
  return apiPut(`/links/categories/${encodeURIComponent(productionId)}`, { categories });
}

// ========== PEOPLE ON SET ==========
export function getPeopleOnSet(productionId) {
  if (IS_DEV) {
    return read('cp_people_on_set', []).filter(p => p.production_id === productionId);
  }
  return apiGet(`/people-on-set?production_id=${encodeURIComponent(productionId)}`);
}

export function addPersonOnSet(person) {
  if (IS_DEV) {
    const all = read('cp_people_on_set', []);
    const full = { id: generateId('pos'), ...person };
    all.push(full);
    write('cp_people_on_set', all);
    return full;
  }
  return apiPost('/people-on-set', person);
}

export function updatePersonOnSet(id, updates) {
  if (IS_DEV) {
    const all = read('cp_people_on_set', []);
    const idx = all.findIndex(p => p.id === id);
    if (idx !== -1) { all[idx] = { ...all[idx], ...updates }; write('cp_people_on_set', all); }
    return null;
  }
  return apiPatch(`/people-on-set/${encodeURIComponent(id)}`, updates);
}

export function removePersonOnSet(id) {
  if (IS_DEV) {
    write('cp_people_on_set', read('cp_people_on_set', []).filter(p => p.id !== id));
    return null;
  }
  return apiDelete(`/people-on-set/${encodeURIComponent(id)}`);
}

// ========== SUPPLIERS ==========
export function getSuppliers(brandId) {
  if (IS_DEV) {
    const all = read('cp_suppliers', []);
    if (brandId) return all.filter(s => !s.brand_id || s.brand_id === brandId);
    return all;
  }
  return apiGet('/suppliers');
}

export function upsertSupplier(supplier) {
  if (IS_DEV) {
    const all = read('cp_suppliers', []);
    const idx = supplier.id ? all.findIndex(s => s.id === supplier.id) : -1;
    if (idx === -1) {
      const full = { id: generateId('sup'), ...supplier };
      all.push(full);
      write('cp_suppliers', all);
      return full;
    }
    all[idx] = { ...all[idx], ...supplier };
    write('cp_suppliers', all);
    return all[idx];
  }
  return apiPost('/suppliers', supplier);
}

export function updateSupplier(id, updates) {
  if (IS_DEV) {
    const all = read('cp_suppliers', []);
    const idx = all.findIndex(s => s.id === id);
    if (idx !== -1) { all[idx] = { ...all[idx], ...updates }; write('cp_suppliers', all); }
    return null;
  }
  return apiPatch(`/suppliers/${encodeURIComponent(id)}`, updates);
}

export function deleteSupplier(id) {
  if (IS_DEV) {
    write('cp_suppliers', read('cp_suppliers', []).filter(s => s.id !== id));
    return null;
  }
  return apiDelete(`/suppliers/${encodeURIComponent(id)}`);
}

// ========== SUPPLIER FORM SUBMISSIONS ==========
export function getSupplierSubmissions(productionId) {
  if (IS_DEV) {
    const all = read('cp_supplier_submissions', []);
    return productionId ? all.filter(s => s.production_id === productionId) : all;
  }
  const q = productionId ? `?production_id=${encodeURIComponent(productionId)}` : '';
  return apiGet(`/suppliers/submissions${q}`);
}

export function submitSupplierForm(data) {
  if (IS_DEV) {
    const all = read('cp_supplier_submissions', []);
    const full = { id: generateId('sub'), submitted_at: new Date().toISOString(), ...data };
    all.push(full);
    write('cp_supplier_submissions', all);
    return full;
  }
  return apiPost('/suppliers/submit', data);
}

// ========== CC PURCHASES ==========
export function getCCPurchases(productionId) {
  if (IS_DEV) {
    const all = read('cp_cc_purchases', []);
    return productionId ? all.filter(p => p.production_id === productionId) : all;
  }
  const q = productionId ? `?production_id=${encodeURIComponent(productionId)}` : '';
  return apiGet(`/cc-purchases${q}`);
}

export function getAllCCPurchases() {
  if (IS_DEV) return read('cp_cc_purchases', []);
  return apiGet('/cc-purchases');
}

export function createCCPurchase(purchase) {
  if (IS_DEV) {
    const all = read('cp_cc_purchases', []);
    const full = { id: generateId('cc'), submitted_at: new Date().toISOString(), ...purchase };
    all.push(full);
    write('cp_cc_purchases', all);
    return full;
  }
  return apiPost('/cc-purchases', purchase);
}

export function updateCCPurchase(id, updates) {
  if (IS_DEV) {
    const all = read('cp_cc_purchases', []);
    const idx = all.findIndex(p => p.id === id);
    if (idx !== -1) { all[idx] = { ...all[idx], ...updates }; write('cp_cc_purchases', all); }
    return null;
  }
  return apiPatch(`/cc-purchases/${encodeURIComponent(id)}`, updates);
}

export function deleteCCPurchase(id) {
  if (IS_DEV) {
    write('cp_cc_purchases', read('cp_cc_purchases', []).filter(p => p.id !== id));
    return null;
  }
  return apiDelete(`/cc-purchases/${encodeURIComponent(id)}`);
}

// ========== CASTING ==========
export function getCasting(productionId) {
  if (IS_DEV) {
    const all = read('cp_casting', []);
    return productionId ? all.filter(c => c.production_id === productionId) : all;
  }
  const q = productionId ? `?production_id=${encodeURIComponent(productionId)}` : '';
  return apiGet(`/casting${q}`);
}

export function getAllCasting() {
  if (IS_DEV) return read('cp_casting', []);
  return apiGet('/casting');
}

export function createCastMember(member) {
  if (IS_DEV) {
    const all = read('cp_casting', []);
    const full = { id: generateId('cast'), created_at: new Date().toISOString(), ...member };
    all.push(full);
    write('cp_casting', all);
    return full;
  }
  return apiPost('/casting', member);
}

export function updateCastMember(id, updates) {
  if (IS_DEV) {
    const all = read('cp_casting', []);
    const idx = all.findIndex(c => c.id === id);
    if (idx !== -1) { all[idx] = { ...all[idx], ...updates }; write('cp_casting', all); }
    return null;
  }
  return apiPatch(`/casting/${encodeURIComponent(id)}`, updates);
}

export function deleteCastMember(id) {
  if (IS_DEV) {
    write('cp_casting', read('cp_casting', []).filter(c => c.id !== id));
    return null;
  }
  return apiDelete(`/casting/${encodeURIComponent(id)}`);
}

// ========== USER GROUPS ==========
export function getGroups(brandId) {
  if (IS_DEV) {
    const all = read('cp_groups', []);
    if (brandId) return all.filter(g => !g.brand_id || g.brand_id === brandId);
    return all;
  }
  return apiGet('/groups').catch(() => []);
}

export function createGroup(group) {
  if (IS_DEV) {
    const all = read('cp_groups', []);
    const full = { id: generateId('grp'), ...group };
    all.push(full);
    write('cp_groups', all);
    return full;
  }
  return apiPost('/groups', group);
}

export function updateGroup(id, patch) {
  if (IS_DEV) {
    const all = read('cp_groups', []);
    const idx = all.findIndex(g => g.id === id);
    if (idx !== -1) { all[idx] = { ...all[idx], ...patch }; write('cp_groups', all); }
    return null;
  }
  return apiPatch(`/groups/${encodeURIComponent(id)}`, patch);
}

export function deleteGroup(id) {
  if (IS_DEV) {
    write('cp_groups', read('cp_groups', []).filter(g => g.id !== id));
    return null;
  }
  return apiDelete(`/groups/${encodeURIComponent(id)}`);
}

export async function addUserToGroup(groupId, userId) {
  const groups = await Promise.resolve(getGroups());
  const group  = (groups || []).find(g => g.id === groupId);
  if (!group) return;
  const members = [...new Set([...(group.members || []), userId])];
  return updateGroup(groupId, { members });
}

export async function removeUserFromGroup(groupId, userId) {
  const groups = await Promise.resolve(getGroups());
  const group  = (groups || []).find(g => g.id === groupId);
  if (!group) return;
  const members = (group.members || []).filter(id => id !== userId);
  return updateGroup(groupId, { members });
}

// ========== FORM CONFIGS ==========
export function getFormConfig(productionId) {
  if (IS_DEV) {
    const all = read('cp_form_configs', {});
    return all[productionId] ?? { logoUrl: '', bgColor: '', bgImageUrl: '' };
  }
  return apiGet(`/form-configs/${encodeURIComponent(productionId)}`).catch(() => ({ logoUrl: '', bgColor: '', bgImageUrl: '' }));
}

export function setFormConfig(productionId, patch) {
  if (IS_DEV) {
    const all = read('cp_form_configs', {});
    all[productionId] = { ...(all[productionId] ?? {}), ...patch };
    write('cp_form_configs', all);
    return all[productionId];
  }
  return apiPut(`/form-configs/${encodeURIComponent(productionId)}`, patch);
}

// ========== BRANDS ==========
export function getBrands() {
  if (IS_DEV) return read('cp_brands', DEFAULT_BRANDS);
  return apiGet('/brands');
}

export function createBrand(brand) {
  if (IS_DEV) {
    const all = read('cp_brands', DEFAULT_BRANDS);
    all.push(brand);
    write('cp_brands', all);
    return brand;
  }
  return apiPost('/brands', brand);
}

export function updateBrand(id, patch) {
  if (IS_DEV) {
    const all = read('cp_brands', DEFAULT_BRANDS);
    const idx = all.findIndex(b => b.id === id);
    if (idx !== -1) { all[idx] = { ...all[idx], ...patch }; write('cp_brands', all); }
    return null;
  }
  return apiPatch(`/brands/${encodeURIComponent(id)}`, patch);
}

export function deleteBrand(id) {
  if (IS_DEV) {
    write('cp_brands', read('cp_brands', DEFAULT_BRANDS).filter(b => b.id !== id));
    return null;
  }
  return apiDelete(`/brands/${encodeURIComponent(id)}`);
}

// ========== USER BRAND ACCESS ==========
export function getUserBrandAccess(userId) {
  if (IS_DEV) {
    const u = SAMPLE_USERS.find(u => u.id === userId);
    return u?.brand_ids ?? (u?.brand ? [u.brand] : ['particle']);
  }
  return apiGet('/users').then(users => {
    const u = (users || []).find(u => u.id === userId);
    return u?.brand_ids ?? ['particle'];
  }).catch(() => ['particle']);
}

export function setUserBrandAccess(userId, brandIds) {
  if (IS_DEV) {
    // In dev mode, persist locally per user (not cross-session)
    const key = `cp_brand_access_${userId}`;
    localStorage.setItem(key, JSON.stringify(brandIds));
    return brandIds;
  }
  return apiPatch(`/users/${encodeURIComponent(userId)}`, { brand_ids: brandIds });
}

// ========== GANTT (delegate to ganttService which handles its own localStorage) ==========
export function getGanttPhases() {
  if (IS_DEV) return _getGanttPhases();
  return apiGet('/gantt/phases');
}

export function saveGanttPhases(phases) {
  if (IS_DEV) { _saveGanttPhases(phases); return phases; }
  return apiPut('/gantt/phases', { phases });
}

export function resetGanttPhases() {
  if (IS_DEV) { _resetGanttPhases(); return null; }
  return null; // no API equivalent
}

export function getGanttEvents(productionId) {
  if (IS_DEV) return _getGanttEvents(productionId);
  return apiGet(`/gantt/events?production_id=${encodeURIComponent(productionId)}`);
}

export function getAllGanttEvents() {
  if (IS_DEV) return _getAllGanttEvents();
  return apiGet('/gantt/events');
}

export function createGanttEvent(event) {
  if (IS_DEV) return _createGanttEvent(event);
  return apiPost('/gantt/events', event);
}

export function updateGanttEvent(id, updates) {
  if (IS_DEV) return _updateGanttEvent(id, updates);
  return apiPatch(`/gantt/events/${encodeURIComponent(id)}`, updates);
}

export function deleteGanttEvent(id) {
  if (IS_DEV) { _deleteGanttEvent(id); return null; }
  return apiDelete(`/gantt/events/${encodeURIComponent(id)}`);
}

// ========== LISTS (delegate to listService) ==========
export function getListItems(key) {
  if (IS_DEV) return getList(key);
  return apiGet(`/lists/${encodeURIComponent(key)}`);
}

export function saveListItems(key, items) {
  if (IS_DEV) { saveList(key, items); return items; }
  return apiPut(`/lists/${encodeURIComponent(key)}`, { items });
}

export function resetListItems(key) {
  if (IS_DEV) { resetList(key); return null; }
  return null;
}

// ========== HELPERS ==========
export function generateId(prefix = 'id') {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
}

export function syncProductionTotals(productionId) {
  if (!IS_DEV) return; // server-side in prod
  const lineItems = getLineItems(productionId);
  const estimatedBudget = (lineItems || []).reduce((s, li) => s + (parseFloat(li.planned_budget) || 0), 0);
  const actualSpent     = (lineItems || []).reduce((s, li) => s + (parseFloat(li.actual_spent)  || 0), 0);
  const all = read('cp_productions', PARTICLE_PRODUCTIONS);
  const idx = all.findIndex(p => p.id === productionId);
  if (idx !== -1) {
    all[idx].estimated_budget = estimatedBudget;
    all[idx].actual_spent     = actualSpent;
    write('cp_productions', all);
  }
}

// ========== CC PURCHASE → LINE ITEM LOOKUP ==========
export function getLineItemByCcPurchaseId(ccPurchaseId) {
  if (IS_DEV) return read('cp_line_items', []).find(li => li.cc_purchase_id === ccPurchaseId) || null;
  return apiGet(`/line-items?cc_purchase_id=${encodeURIComponent(ccPurchaseId)}`).then(r => r?.[0] || null);
}

// ========== CALL SHEETS ==========
export function getCallSheets(productionId) {
  if (IS_DEV) {
    const all = read('cp_call_sheets', []);
    return productionId ? all.filter(cs => cs.production_id === productionId) : all;
  }
  const q = productionId ? `?production_id=${encodeURIComponent(productionId)}` : '';
  return apiGet(`/call-sheets${q}`);
}

export function getAllCallSheets() {
  if (IS_DEV) return read('cp_call_sheets', []);
  return apiGet('/call-sheets');
}

export function createCallSheet(cs) {
  if (IS_DEV) {
    const all = read('cp_call_sheets', []);
    const full = { id: generateId('cs'), created_at: new Date().toISOString(), ...cs };
    all.push(full);
    write('cp_call_sheets', all);
    return full;
  }
  return apiPost('/call-sheets', cs);
}

export function updateCallSheet(id, updates) {
  if (IS_DEV) {
    const all = read('cp_call_sheets', []);
    const idx = all.findIndex(cs => cs.id === id);
    if (idx !== -1) { all[idx] = { ...all[idx], ...updates }; write('cp_call_sheets', all); }
    return null;
  }
  return apiPatch(`/call-sheets/${encodeURIComponent(id)}`, updates);
}

export function deleteCallSheet(id) {
  if (IS_DEV) {
    write('cp_call_sheets', read('cp_call_sheets', []).filter(cs => cs.id !== id));
    return null;
  }
  return apiDelete(`/call-sheets/${encodeURIComponent(id)}`);
}

// ========== BULK IMPORT HELPERS ==========
export function bulkCreateLineItems(items) { items.forEach(createLineItem); }
export function bulkCreateCastMembers(members) { members.forEach(createCastMember); }

// ========== WEEKLY REPORTS ==========
export function getWeeklyReports(brandId) {
  if (IS_DEV) {
    const all = read('cp_weekly_reports', []);
    return all
      .filter(r => r.brand_id === brandId)
      .sort((a, b) => b.week_start.localeCompare(a.week_start));
  }
  return apiGet(`/weekly-reports?brand_id=${encodeURIComponent(brandId)}`);
}

export function getWeeklyReport(brandId, weekStart) {
  if (IS_DEV) {
    const all = read('cp_weekly_reports', []);
    return all.find(r => r.brand_id === brandId && r.week_start === weekStart) || null;
  }
  return apiGet(
    `/weekly-reports?brand_id=${encodeURIComponent(brandId)}&week_start=${encodeURIComponent(weekStart)}`
  ).then(r => (Array.isArray(r) ? r[0] : r) || null);
}

export function saveWeeklyReport(report) {
  if (IS_DEV) {
    const all = read('cp_weekly_reports', []);
    const idx = all.findIndex(r => r.id === report.id);
    const updated = { ...report, updated_at: new Date().toISOString() };
    if (idx === -1) all.push(updated);
    else all[idx] = updated;
    write('cp_weekly_reports', all);
    return updated;
  }
  return apiPut('/weekly-reports', report);
}

export function deleteWeeklyReport(id) {
  if (IS_DEV) {
    write('cp_weekly_reports', read('cp_weekly_reports', []).filter(r => r.id !== id));
    return;
  }
  return apiDelete(`/weekly-reports/${encodeURIComponent(id)}`);
}

// ========== GOOGLE CALENDAR ==========
export function setupGoogleCalendar() {
  return apiPost('/gcal/setup');
}
export function syncToGoogleCalendar() {
  return apiPost('/gcal/sync-to-google');
}
export function syncFromGoogleCalendar() {
  return apiPost('/gcal/sync-from-google');
}
export function getGCalStatus() {
  return apiGet('/gcal/status');
}
