/** DEV-only Library data (the shape of GET /api/library), kept across reloads of the page in this session. */
const ago = (n) => new Date(Date.now() - n * 86400000).toISOString();
let seq = 1;
const id = () => `00000000-0000-4000-8000-${String(seq++).padStart(12, '0')}`;
const item = (over) => ({
  id: id(), brand_id: 'particle', production_id: null, production_locked: false, category: 'tv_master', title: '', product: null,
  url: 'https://www.dropbox.com/scl/fi/demo/file.mov?rlkey=x', entry_key: null, file_name: null, ext: 'mov', file_kind: 'video',
  size_bytes: 1.8e9, file_modified: ago(30), specs: {}, market: null, on_air: null, code: null, vanity: null, landing_url: null,
  notes: null, sort: 0, source: 'cp', added_by: 'Tomer Wilf Lezmy', created_at: ago(5), updated_at: ago(5), thumb_url: null, ...over,
});
const sheetRow = (product, title, group, markets, extra = {}) => markets.map(([market, on_air, code, vanity]) => item({
  source: 'sheet', product, title, market, on_air, code, vanity, landing_url: 'https://www.particleformen.com/lpage/x/',
  specs: { duration: Number((title.match(/(\d+)s/) || [])[1]) || undefined, group }, file_name: `${title.replace(/\s+/g, '_')}_${market}.mov`, ...extra,
}));

let state = null;
function build() {
  return {
    brand_id: 'particle',
    can_edit: true,
    all_productions: [{ id: 'PRD26-74', name: 'Black Friday 2026', stage: 'Production' }, { id: 'PRD26-20', name: 'The Hunt', stage: 'Completed' }, { id: 'PRD26-18', name: 'The Math', stage: 'Completed' }, { id: 'PRD26-11', name: 'Face Cream July Campaign', stage: 'Completed' }, { id: 'PRD26-01', name: 'Particle BrandFormance AI Campaign', stage: 'Completed' }],
    sources: [{ id: 'src-1', sheet_id: '1OBtG4TVAGNY5j5oaKDDZDBhxL3Nkqia0jYaSAAI26BM', title: 'TV Commercials', last_synced_at: ago(0.004), last_result: { ok: true, files: 118, commercials: 86, added: 0, updated: 2, removed: 0, linked: 3 } }],
    productions: [
      {
        id: 'PRD26-20', name: 'The Hunt', stage: 'Completed', product_type: ['Face Cream'], production_type: 'Shoot', producer: 'Tomer Wilf Lezmy',
        planned_start: '2026-09-01', planned_end: '2026-10-20', delivery_date: '2026-10-22', air_date: '2026-11-02', completed_at: ago(3),
        items: [
          ...sheetRow('Face Cream', 'The Hunt 60s', 'g-hunt60', [['US', true, 'PM1HUNTH', 'particlemen.com'], ['CA', false, 'PM1HUNTCAH', 'particlemen.ca']], { production_id: 'PRD26-20' }),
          item({ production_id: 'PRD26-20', title: 'The Hunt 30s — TV master', file_name: 'TheHunt_30s_TV_Master_16x9.mov', specs: { duration: 30, aspect: '16:9' } }),
          item({ production_id: 'PRD26-20', category: 'digital', title: 'TheHunt_15s_9x16_EN.mp4', file_name: 'TheHunt_15s_9x16_EN.mp4', ext: 'mp4', size_bytes: 9.2e7, specs: { duration: 15, aspect: '9:16', language: 'EN' } }),
          item({ production_id: 'PRD26-20', category: 'digital', title: 'TheHunt_15s_1x1.mp4', file_name: 'TheHunt_15s_1x1.mp4', ext: 'mp4', size_bytes: 8.1e7, specs: { duration: 15, aspect: '1:1' } }),
          item({ production_id: 'PRD26-20', category: 'digital', title: 'TheHunt_6s_4x5.mp4', file_name: 'TheHunt_6s_4x5.mp4', ext: 'mp4', size_bytes: 3.1e7, specs: { duration: 6, aspect: '4:5' } }),
          item({ production_id: 'PRD26-20', category: 'sound', title: 'Hunt_30_Music_Stem.wav', file_name: 'Hunt_30_Music_Stem.wav', ext: 'wav', file_kind: 'audio', size_bytes: 5.3e7 }),
          item({ production_id: 'PRD26-20', category: 'sound', title: 'Hunt_30_Dialog_Stem.wav', file_name: 'Hunt_30_Dialog_Stem.wav', ext: 'wav', file_kind: 'audio', size_bytes: 5.1e7 }),
          item({ production_id: 'PRD26-20', category: 'sound', title: 'Hunt_30_M&E.wav', file_name: 'Hunt_30_M&E.wav', ext: 'wav', file_kind: 'audio', size_bytes: 5.0e7 }),
        ],
        other_links: [{ id: 'l1', category: 'drive', title: 'Treatment', url: 'https://drive.google.com/' }],
      },
      { id: 'PRD26-18', name: 'The Math', stage: 'Completed', product_type: ['Face Cream'], production_type: 'AI', planned_start: '2026-09-10', planned_end: '2026-10-15', delivery_date: null, air_date: null, completed_at: ago(1), items: [], other_links: [] },
      { id: 'PRD26-11', name: 'Face Cream July Campaign', stage: 'Completed', product_type: ['Face Cream'], production_type: 'Shoot', planned_start: '2026-07-01', planned_end: '2026-07-31', delivery_date: '2026-08-02', air_date: '2026-08-10', completed_at: ago(70),
        items: [item({ production_id: 'PRD26-11', title: 'July Campaign 60s', file_name: 'July_60s_TV.mov', specs: { duration: 60, aspect: '16:9' } }), item({ production_id: 'PRD26-11', category: 'digital', title: 'July_30s_9x16.mp4', ext: 'mp4', file_name: 'July_30s_9x16.mp4', specs: { duration: 30, aspect: '9:16' } })], other_links: [] },
    ],
    before: [
      ...sheetRow('Face Cream', 'Most Men 60s', 'g1', [['US', true, 'PM1MMH', 'particlemen.com'], ['CA', false, 'PM1MMCAH', 'particlemen.ca'], ['AUS', false, 'AUSSIE25', 'particlecream.com']]),
      ...sheetRow('Face Cream', 'Most Men 60s', 'g2', [['US', false, 'PM1MMDH', 'particlemen.com'], ['AUS', false, 'AUSSIE25', 'particleformen.au']], { notes: 'Results may vary disclaimer' }),
      ...sheetRow('Face Cream', 'Most Men 60s v2', 'g3', [['US', true, 'PM1MM13H', 'particlemen.com']], { notes: 'Ubiquitous bottom 1/3', url: 'https://drive.google.com/file/d/1r86/view' }),
      ...sheetRow('Face Cream', 'Most Men Texting 60s', 'g4', [['US', false, 'PM1TEXTH', null]]),
      ...sheetRow('Gravité', 'Blindfolded 60s', 'g5', [['US', false, 'GC1BLINDH', 'trygravite.com'], ['CA', true, 'GC1BL13H', 'trygravite.ca'], ['AUS', true, 'AUSSIE10', 'gravitemen.com'], ['UK', false, 'UK25', 'trygravite.co.uk']]),
      ...sheetRow('Gravité', 'Blindfolded 30s', 'g6', [['US', false, 'GC3BLINDH', 'trygravite.com'], ['CA', false, 'GC3BLCAH', 'trygravite.ca']]),
      ...sheetRow('Anti-Gray Serum', 'Beetjuice 60s', 'g7', [['US', false, 'AG1V2H', 'antigray.com']]),
      ...sheetRow('Anti-Gray Serum', 'Beetjuice 30s', 'g8', [['US', false, 'AG3V1H', 'antigray.com']], { notes: 'Rev-share' }),
      ...sheetRow('Sunscreen', 'Afterthought 60s', 'g9', [['US', false, 'PS1AFTERH', 'www.trysunscreen.com']]),
      ...sheetRow('Hand Cream', 'Hand Cream AI 60s', 'g10', [['US', true, 'PFM1HCH', 'particlehand.com']]),
      ...sheetRow(null, 'Black Friday Sale 30s (BEST)', 'g11', [['US', false, 'PS3BFSALEH', 'particlesale.com']]),
    ],
  };
}
const cur = () => (state = state || build());
const clone = (v) => JSON.parse(JSON.stringify(v));

export const fxList = () => clone(cur());
export const fxProduction = (pid) => ({ production: clone(cur().productions.find(p => p.id === pid) || { id: pid, name: pid, stage: 'Completed', product_type: [], items: [], other_links: [] }), can_edit: true });
export function fxResolve(url) {
  if (/\/fo\//.test(url)) {
    return {
      url, link_kind: 'dropbox_folder', error: null, entries: [
        { key: 'a', name: 'Final_30s_TV_Master_16x9.mov', path: '/Final_30s_TV_Master_16x9.mov', size: 2.1e9, kind: 'video', ext: 'mov', category: 'tv_master', specs: { duration: 30, aspect: '16:9' } },
        { key: 'b', name: 'Final_15s_9x16_EN.mp4', path: '/Final_15s_9x16_EN.mp4', size: 9e7, kind: 'video', ext: 'mp4', category: 'digital', specs: { duration: 15, aspect: '9:16', language: 'EN' } },
        { key: 'c', name: 'Final_15s_1x1.mp4', path: '/Final_15s_1x1.mp4', size: 8e7, kind: 'video', ext: 'mp4', category: 'digital', specs: { duration: 15, aspect: '1:1' } },
        { key: 'd', name: 'Mix_Music_Stem.wav', path: '/Stems/Mix_Music_Stem.wav', size: 5e7, kind: 'audio', ext: 'wav', category: 'sound', specs: {} },
        { key: 'e', name: 'Subtitles_HE.srt', path: '/Subtitles_HE.srt', size: 4e3, kind: 'other', ext: 'srt', category: 'other', specs: { language: 'HE' } },
      ],
    };
  }
  const name = decodeURIComponent((url.split('?')[0].split('/').pop() || 'file.mov'));
  return { url, link_kind: 'dropbox_file', error: null, entries: [{ key: null, name, path: '', size: 1e9, kind: 'video', ext: name.split('.').pop(), category: /\.mov$/i.test(name) ? 'tv_master' : 'digital', specs: {} }] };
}
export function fxAdd(pid, items) {
  const s = cur();
  let p = s.productions.find(x => x.id === pid);
  if (!p) { p = { id: pid, name: pid, stage: 'Completed', product_type: [], items: [], other_links: [] }; s.productions.unshift(p); }
  p.items.push(...items.map(it => item({ ...it, production_id: pid, file_kind: it.file_kind || (/\.(wav|aif|aiff|mp3)$/i.test(it.file_name || '') ? 'audio' : 'video') })));
  return { ok: true, production: clone(p) };
}
export function fxUpdate(itemId, patch) {
  const s = cur();
  const all = [...s.before, ...s.productions.flatMap(p => p.items)];
  const it = all.find(x => x.id === itemId);
  if (!it) return { ok: false };
  if ('production_id' in patch) {
    s.before = s.before.filter(x => x.id !== itemId);
    for (const p of s.productions) p.items = p.items.filter(x => x.id !== itemId);
    it.production_id = patch.production_id || null;
    it.production_locked = true;
    if (it.production_id) s.productions.find(p => p.id === it.production_id)?.items.push(it); else s.before.push(it);
  }
  Object.assign(it, Object.fromEntries(Object.entries(patch).filter(([k]) => k !== 'production_id')));
  return { ok: true, item: clone(it) };
}
export function fxRemove(itemId) {
  const s = cur();
  for (const p of s.productions) p.items = p.items.filter(x => x.id !== itemId);
  s.before = s.before.filter(x => x.id !== itemId);
  return { ok: true };
}
export const fxConnect = () => ({ ok: true, result: { ok: true, files: 118 }, sources: cur().sources });
