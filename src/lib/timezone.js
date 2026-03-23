// All timestamps displayed in Israel timezone (Asia/Jerusalem)
const TZ = 'Asia/Jerusalem';

export function formatIST(dateString, options = {}) {
  if (!dateString) return '—';
  try {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('en-IL', {
      timeZone: TZ,
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      ...options,
    }).format(date);
  } catch { return dateString; }
}

export function formatDateIST(dateString) {
  if (!dateString) return '—';
  try {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('en-IL', {
      timeZone: TZ,
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    }).format(date);
  } catch { return dateString; }
}

export function nowIST() {
  return new Date().toLocaleString('sv-SE', { timeZone: TZ }).replace(' ', 'T') + '+02:00';
}

export function nowISOString() {
  return new Date().toISOString();
}
