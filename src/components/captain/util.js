export function relTime(iso) {
  if (!iso) return '';
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  if (s < 7 * 86400) return `${Math.round(s / 86400)}d ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export const dateTime = (iso) => (iso ? new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');

/** 67.4 → "1:07" */
export function mmss(sec) {
  const s = Math.max(0, Math.floor(Number(sec) || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function statusMeta(c) {
  switch (c.status) {
    case 'passed': return { label: 'Passed', tone: 'green', icon: '✅' };
    case 'issues': return { label: `${c.issue_count} issue${c.issue_count === 1 ? '' : 's'}`, tone: 'red', icon: '🔴' };
    case 'error': return { label: 'Error', tone: 'red', icon: '⚠️' };
    case 'skipped': return { label: 'Skipped', tone: 'gray', icon: '⏭' };
    case 'running': return { label: 'Checking…', tone: 'amber', icon: '⏳' };
    default: return { label: 'Queued', tone: 'amber', icon: '⏳' };
  }
}

export const TRIGGERS = { review: 'Review', for_approval: 'For Approval', new_version: 'New version', manual: 'Manual' };

export const ISSUE_TYPES = {
  spelling: 'Spelling', wrong_word: 'Wrong word', inconsistent: 'Inconsistent', brand_name: 'Brand name', cut_off: 'Cut off',
  caption_vs_voiceover: 'Caption ≠ voice', vo_unclear: 'Voice unclear', vo_wrong_word: 'Voice: wrong word', vo_script_mismatch: 'Voice ≠ script',
  vo_order: 'Sentence order', script_mismatch: 'Differs from brief', size_mismatch: 'Differs from master', placeholder: 'Placeholder', overflow: 'Overflow',
};

export const money = (n) => (n == null ? '' : n < 0.01 ? '<1¢' : n < 1 ? `${Math.round(n * 100)}¢` : `$${Number(n).toFixed(2)}`);
