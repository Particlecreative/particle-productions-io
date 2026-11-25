// Readable page names for Team activity ("Opened My Studio") — every page anyone opens (25 Nov 2026).
const NAMES = [
  [/^\/$/, 'Productions'], [/^\/production\//, 'a production'], [/^\/home$/, 'Home'], [/^\/my-studio$/, 'My Studio'], [/^\/new-ticket$/, 'New ticket'],
  [/^\/medium/, 'Briefs Creator'], [/^\/productions-view$/, 'Productions'], [/^\/tv-library$/, 'TV Library'], [/^\/ads-library$/, 'Ads Library'],
  [/^\/on-air$/, 'On Air'], [/^\/my-afterlife$/, 'My AfterLife'], [/^\/team-weekly$/, 'Team Weekly'], [/^\/passwords$/, 'Studio passwords'],
  [/^\/my-hr$/, 'My HR'], [/^\/hr$/, 'HR panel'], [/^\/time-tracking$/, 'Time tracking'], [/^\/studio/, 'Studio'], [/^\/creative-reports/, 'Creative Weekly'],
  [/^\/captain/, 'Captain Caption'], [/^\/tracker/, 'Tracker'], [/^\/tasks/, 'Tasks'], [/^\/library/, 'Library'], [/^\/contracts/, 'Contracts'],
  [/^\/suppliers/, 'Suppliers'], [/^\/gantts/, 'Gantts'], [/^\/call-sheets/, 'Call Sheets'], [/^\/financial/, 'Budget Overview'], [/^\/accounting/, 'Payments'],
  [/^\/invoices/, 'Invoices'], [/^\/history/, 'History'], [/^\/casting/, 'Casting'], [/^\/scripts/, 'Scripts'], [/^\/manual/, 'Manual'],
  [/^\/creative-studio/, 'Creative Studio'], [/^\/campaigns/, 'Campaign Tracker'], [/^\/tv-productions/, 'TV Productions'], [/^\/welcome/, 'My Monday'],
  [/^\/finance/, 'Finance'], [/^\/users/, 'Users'], [/^\/settings/, 'Settings'],
];
export function pageName(path) {
  const hit = NAMES.find(([re]) => re.test(path));
  if (hit) return hit[1];
  const seg = String(path || '').split('/').filter(Boolean)[0] || 'Home';
  return seg.replace(/-/g, ' ').replace(/^./, c => c.toUpperCase());
}
