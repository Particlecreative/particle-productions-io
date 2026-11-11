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
    case 'passed': return { label: c.issue_count ? `Passed · ${c.issue_count} to look at` : 'Passed', tone: 'green', icon: '✅' };
    case 'issues': return { label: `${c.issue_count} issue${c.issue_count === 1 ? '' : 's'}`, tone: 'red', icon: '🔴' };
    case 'error': return { label: 'Error', tone: 'red', icon: '⚠️' };
    case 'skipped': return { label: 'Skipped', tone: 'gray', icon: '⏭' };
    case 'running': return { label: 'Checking…', tone: 'amber', icon: '⏳' };
    default: return { label: 'Queued', tone: 'amber', icon: '⏳' };
  }
}

export const TRIGGERS = { review: 'Review', for_approval: 'For Approval', new_version: 'New version', manual: 'Manual', medium: 'From Medium', batch: 'Holiday batch' };

export const DISCIPLINES = { video: ['🎬', 'Video'], design: ['🎨', 'Design'], brief: ['📝', 'Brief'] };
export const discIcon = (d) => (DISCIPLINES[d] || DISCIPLINES.video)[0];

export const ISSUE_TYPES = {
  spelling: 'Spelling', wrong_word: 'Wrong word', inconsistent: 'Inconsistent', brand_name: 'Brand name', cut_off: 'Cut off',
  caption_vs_voiceover: 'Caption ≠ voice', vo_unclear: 'Voice unclear', vo_wrong_word: 'Voice: wrong word', vo_script_mismatch: 'Voice ≠ script',
  vo_order: 'Sentence order', script_mismatch: 'Differs from brief', size_mismatch: 'Differs from master', placeholder: 'Placeholder', overflow: 'Overflow',
  vo_pronunciation: 'Pronunciation', label_mismatch: 'Label', claim: 'Claim not in the sheet', baked_text: 'Text in image', grammar: 'Grammar', rule: 'House rule', lane: 'Lane rule', translation: 'Translation',
  // brief pre-flight
  reading_speed: 'Reading speed', vo_speed: 'VO pace', timing: 'Timing', fit: 'Too long for the layout', offer_code: 'Offer code', offer_date: 'End date', offer_tier: 'Discount %',
  price: 'Price math', leftover_code: 'Old code', leftover_date: 'Old date', translation_currency: 'Currency in translation', inconsistent_code: 'Code differs',
  inconsistent_date: 'Date differs', inconsistent_guarantee: 'Guarantee differs', missing_cta: 'No CTA', missing_disclaimer: 'No B&A disclaimer', missing_code: 'Code missing',
  missing_end_date: 'End date missing', claim_unverified: 'Claim to verify', claim_article: 'Not in the article', campaign_code: 'Campaign code', campaign_date: 'Campaign date',
  campaign_price: 'Campaign price', brief_mismatch: 'Changed from approved brief', brief_missing: 'Missing from approved brief',
};

export const SEVERITY = { must_fix: ['Must fix', 'red'], check: ['Please check', 'amber'], info: ['Note', 'gray'] };

export const money = (n) => (n == null ? '' : n < 0.01 ? '<1¢' : n < 1 ? `${Math.round(n * 100)}¢` : `$${Number(n).toFixed(2)}`);
