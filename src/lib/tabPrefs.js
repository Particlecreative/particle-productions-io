// Tab order preferences — stored in localStorage
// Scopes: user_global, user_production_{id}, all_global, all_production_{id}

const PREFIX = 'cp_tab_order_';

export function getTabOrder(userId, productionId, defaultTabs) {
  // Priority: production-specific > global, user > all
  const keys = [
    `${PREFIX}user_production_${userId}_${productionId}`,
    `${PREFIX}all_production_${productionId}`,
    `${PREFIX}user_global_${userId}`,
    `${PREFIX}all_global`,
  ];
  for (const key of keys) {
    const stored = localStorage.getItem(key);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        // Filter to only include tabs that exist in defaults (handles removed tabs)
        const valid = parsed.filter(t => defaultTabs.includes(t.id || t));
        // Add any new tabs not in stored prefs
        const storedIds = valid.map(t => t.id || t);
        const missing = defaultTabs.filter(t => !storedIds.includes(t));
        return [...valid.map(t => ({ id: t.id || t, visible: t.visible !== false })), ...missing.map(t => ({ id: t, visible: true }))];
      } catch {}
    }
  }
  return defaultTabs.map(t => ({ id: t, visible: true }));
}

export function saveTabOrder(scope, tabs) {
  localStorage.setItem(`${PREFIX}${scope}`, JSON.stringify(tabs));
}

export function resetTabOrder(scope) {
  localStorage.removeItem(`${PREFIX}${scope}`);
}
