/**
 * tablePrefs.js
 * Persists column visibility and sort preferences per table
 * in localStorage under the key 'cp_table_prefs'.
 *
 * Shape:
 * {
 *   dashboard: { hidden: ['payment_date'], sort: { col: 'planned_start', dir: 'asc' } },
 *   budget:    { hidden: ['difference'],   sort: { col: 'item', dir: 'asc' } },
 * }
 */

const STORAGE_KEY = 'cp_table_prefs';

const DEFAULTS = {
  hidden: [],
  sort: { col: null, dir: 'asc' },
};

// Columns hidden by default per table (applied only if the user has never
// explicitly saved prefs for that table — stored under a separate key).
const DEFAULT_HIDDEN = {
  budget:    ['timeline'],
  dashboard: ['shoot_date', 'delivery_date', 'air_date'],
};

const INIT_KEY = 'cp_table_prefs_init';

/**
 * Get preferences for a given table ID.
 * Returns a fresh object with defaults merged.
 */
export function getTablePrefs(tableId) {
  try {
    const all = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    const inited = JSON.parse(localStorage.getItem(INIT_KEY) || '{}');
    const saved = all[tableId];

    // If this table has never been initialized with defaults, apply them
    if (!inited[tableId] && DEFAULT_HIDDEN[tableId]) {
      // Seed the prefs with defaults and mark as initialized
      const defaultHidden = DEFAULT_HIDDEN[tableId];
      all[tableId] = { hidden: defaultHidden, sort: { col: null, dir: 'asc' } };
      inited[tableId] = true;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
      localStorage.setItem(INIT_KEY, JSON.stringify(inited));
      return { hidden: defaultHidden, sort: { col: null, dir: 'asc' } };
    }

    const s = saved ?? {};
    return {
      hidden: Array.isArray(s.hidden) ? s.hidden : [],
      sort: {
        col: s.sort?.col ?? null,
        dir: s.sort?.dir ?? 'asc',
      },
    };
  } catch {
    return { ...DEFAULTS, hidden: [], sort: { col: null, dir: 'asc' } };
  }
}

/**
 * Merge `patch` into the preferences for the given table ID and persist.
 * `patch` may contain any subset of { hidden, sort }.
 */
export function setTablePrefs(tableId, patch) {
  try {
    const all = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    all[tableId] = {
      ...(all[tableId] ?? {}),
      ...patch,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch {
    /* silent — non-critical */
  }
}

/**
 * Toggle a column's visibility for a given table.
 * If the column is currently hidden, shows it; otherwise hides it.
 * Returns the new hidden array.
 */
export function toggleColumnVisibility(tableId, colKey) {
  const prefs = getTablePrefs(tableId);
  const hidden = prefs.hidden.includes(colKey)
    ? prefs.hidden.filter((c) => c !== colKey)
    : [...prefs.hidden, colKey];
  setTablePrefs(tableId, { hidden });
  return hidden;
}

/**
 * Get the user-defined column display order for a given table.
 * Returns an array of column keys, or null if the user has not customised the order.
 */
export function getColOrder(tableId) {
  try {
    const all = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    const colOrder = all[tableId]?.colOrder;
    return Array.isArray(colOrder) ? colOrder : null;
  } catch {
    return null;
  }
}

/**
 * Persist a column order array for a given table.
 * Pass null to reset to default order.
 */
export function saveColOrder(tableId, order) {
  try {
    const all = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    all[tableId] = { ...(all[tableId] ?? {}), colOrder: order };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch {
    /* silent */
  }
}

/**
 * Update sort preference for a given table.
 * If clicking the same column, toggles direction; otherwise sets new col with 'asc'.
 * Returns the new sort object { col, dir }.
 */
export function updateSort(tableId, colKey) {
  const prefs = getTablePrefs(tableId);
  const isSameCol = prefs.sort.col === colKey;
  const sort = {
    col: colKey,
    dir: isSameCol && prefs.sort.dir === 'asc' ? 'desc' : 'asc',
  };
  setTablePrefs(tableId, { sort });
  return sort;
}
