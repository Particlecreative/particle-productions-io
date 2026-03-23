// =============================================
// GANTT SERVICE — events + phase template management
// =============================================

const KEYS = {
  events: 'cp_gantt_events',
  phases: 'cp_gantt_phases',
};

export const DEFAULT_PHASES = [
  { id: 'concepts',        name: 'Concepts',        color: '#7c3aed', order: 0 },
  { id: 'scripting',       name: 'Scripting',        color: '#2563eb', order: 1 },
  { id: 'pre_production',  name: 'Pre Production',   color: '#0891b2', order: 2 },
  { id: 'production',      name: 'Production',       color: '#16a34a', order: 3 },
  { id: 'post_production', name: 'Post Production',  color: '#d97706', order: 4 },
];

function read(key, fallback) {
  try {
    const val = localStorage.getItem(key);
    return val ? JSON.parse(val) : fallback;
  } catch { return fallback; }
}

function write(key, data) {
  localStorage.setItem(key, JSON.stringify(data));
}

function genId(prefix = 'ge') {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
}

// ========== PHASES ==========
export function getGanttPhases() {
  return read(KEYS.phases, DEFAULT_PHASES);
}

export function saveGanttPhases(phases) {
  write(KEYS.phases, phases);
}

export function resetGanttPhases() {
  localStorage.removeItem(KEYS.phases);
}

// ========== EVENTS ==========
export function getGanttEvents(productionId) {
  const all = read(KEYS.events, []);
  return all.filter(e => e.production_id === productionId);
}

export function getAllGanttEvents() {
  return read(KEYS.events, []);
}

export function createGanttEvent(event) {
  const all = read(KEYS.events, []);
  const newEvent = {
    id: genId('ge'),
    created_at: new Date().toISOString(),
    ...event,
  };
  all.push(newEvent);
  write(KEYS.events, all);
  return newEvent;
}

export function updateGanttEvent(id, patch) {
  const all = read(KEYS.events, []);
  const idx = all.findIndex(e => e.id === id);
  if (idx === -1) return null;
  all[idx] = { ...all[idx], ...patch, updated_at: new Date().toISOString() };
  write(KEYS.events, all);
  return all[idx];
}

export function deleteGanttEvent(id) {
  const all = read(KEYS.events, []);
  write(KEYS.events, all.filter(e => e.id !== id));
}
