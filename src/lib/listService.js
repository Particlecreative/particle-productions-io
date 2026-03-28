/**
 * listService — admin-editable dropdown lists
 * Stores each list in localStorage; falls back to DEFAULTS if never edited.
 */

const PREFIX = 'cp_list_';

export const LIST_META = {
  stages:           { label: 'Production Stages',    description: 'Stage options on every production board' },
  lineItemTypes:    { label: 'Line Item Types',       description: 'Budget table item categories (Crew, Equipment…)' },
  lineItemStatuses: { label: 'Line Item Statuses',    description: 'Status options for budget items' },
  crewRoles:        { label: 'Crew Roles',            description: 'Role suggestions when adding crew to a production' },
  productTypes:     { label: 'Product Types',         description: 'Product categories in the new-production form' },
  productionTypes:  { label: 'Production Types',      description: 'Type of production (Shoot, AI, etc.)' },
  paymentMethods:   { label: 'Payment Methods',       description: 'How payments can be made in the accounting tab' },
  businessTypes:    { label: 'Business / Entity Types', description: 'Supplier business type options' },
};

export const LIST_DEFAULTS = {
  stages:           ['Pre Production', 'Production', 'Post', 'Paused', 'Pending', 'Completed'],
  lineItemTypes:    ['Crew', 'Equipment', 'Catering & Transport', 'Post', 'Office', 'Cast'],
  lineItemStatuses: ['Working on it', 'Done', 'Stuck', 'Not Started'],
  crewRoles: [
    'Director', 'Technical Photographer', 'Photographer', 'DOP',
    'Director of Photography', 'Offline Editor', 'Online Editor',
    'Sound Designer', 'Stylist', 'Makeup', 'Talent', 'Actor',
    'Actress', 'Gaffer', 'Grip', 'Art Director',
  ],
  productTypes: [
    'Face Cream', 'Sunscreen', 'Gravité', 'Neoroot', 'Hand Cream',
    'Anti-Gray Serum', 'Shaving Gel', 'Brandformance', 'Eye Cream',
    'Body Wash', 'Other',
  ],
  productionTypes:  ['Remote Shoot', 'Shoot', 'AI'],
  paymentMethods:   ['Bank Transfer', 'Credit Card', 'PayPal', 'Remote', 'Office Card'],
  businessTypes:    ['עוסק פטור', 'עוסק מורשה', 'חברה בע״מ', 'שכר אומנים', 'Company LTD', 'Self Employed'],
};

export function getList(key) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (raw) return JSON.parse(raw);
  } catch { /* fall through */ }
  return [...(LIST_DEFAULTS[key] ?? [])];
}

export function saveList(key, items) {
  localStorage.setItem(PREFIX + key, JSON.stringify(items));
}

export function resetList(key) {
  localStorage.removeItem(PREFIX + key);
  return [...LIST_DEFAULTS[key]];
}

export function getAllLists() {
  return Object.fromEntries(
    Object.keys(LIST_DEFAULTS).map(k => [k, getList(k)])
  );
}

const DEFAULT_COLORS = {
  // Status-like (progress: gray → orange → red → green)
  'Not Started': '#9ca3af',
  'Working on it': '#f59e0b',
  'Stuck': '#ef4444',
  'Done': '#22c55e',
  // Stages
  'Pre Production': '#6366f1',
  'Production': '#f59e0b',
  'Post': '#8b5cf6',
  'Paused': '#9ca3af',
  'Pending': '#d1d5db',
  'Completed': '#22c55e',
  // Types (brand palette)
  'Crew': '#1e3a5f',
  'Equipment': '#3b82f6',
  'Cast': '#8b5cf6',
  'Office': '#64748b',
  'Catering & Transport': '#f97316',
};

export function getListItemColor(listKey, label) {
  const list = getList(listKey);
  // If list stores objects with color, use that
  if (Array.isArray(list)) {
    const item = list.find(i => (typeof i === 'object' ? i.label : i) === label);
    if (typeof item === 'object' && item?.color) return item.color;
  }
  // Fallback to defaults
  return DEFAULT_COLORS[label] || null;
}
