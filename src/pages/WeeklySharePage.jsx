import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { ExternalLink, FileText, Link2, X, ChevronDown, ChevronUp, ArrowUpDown } from 'lucide-react';
import { getDriveThumbnail } from '../components/shared/FileUploadButton';
import StageBadge from '../components/ui/StageBadge';
import clsx from 'clsx';

const API = import.meta.env.VITE_API_URL || '';

function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

export default function WeeklySharePage() {
  const { token } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [lightbox, setLightbox] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API}/api/weekly-reports/share/${token}`);
        if (!res.ok) { setError('Report not found or link has expired.'); setLoading(false); return; }
        const json = await res.json();
        setData(json);
      } catch { setError('Failed to load report.'); }
      setLoading(false);
    })();
  }, [token]);

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-gray-400 text-sm">Loading report...</div>
    </div>
  );

  if (error || !data) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <div className="text-5xl mb-4">🔗</div>
        <h1 className="text-xl font-black text-gray-700 mb-2">Link Not Found</h1>
        <p className="text-sm text-gray-400">{error || 'This share link is invalid or expired.'}</p>
      </div>
    </div>
  );

  const { report, productions } = data;

  const STAGE_SORT = { 'Production': 0, 'Pre Production': 1, 'Post': 2, 'Pending': 3, 'Paused': 4, 'Completed': 5 };
  const sorted = [...(report.entries || [])].sort((a, b) => {
    const pa = productions.find(p => p.id === a.production_id);
    const pb = productions.find(p => p.id === b.production_id);
    return (STAGE_SORT[pa?.stage] ?? 9) - (STAGE_SORT[pb?.stage] ?? 9);
  });

  const weekDate = (() => {
    try {
      const [y, m, d] = report.week_start.split('-').map(Number);
      const start = new Date(y, m - 1, d);
      const end = addDays(start, 6);
      return `${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
    } catch { return report.week_start; }
  })();

  const generalUpdates = report.general_updates || [];
  const creativeLink = report.creative_link;
  const hasOverview = generalUpdates.length > 0 || creativeLink?.url;

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-white">
      {/* Header */}
      <div className="sticky top-0 z-10 border-b border-gray-200/80 bg-white/90 backdrop-blur-md shadow-sm">
        <div className="max-w-6xl mx-auto px-6 sm:px-8 py-4 flex items-center justify-between">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-gray-400">Weekly Report</div>
            <h1 className="text-lg font-black text-gray-900 leading-tight">{report.title}</h1>
          </div>
          <div className="text-right">
            <div className="text-xs font-semibold text-gray-500">{weekDate}</div>
            <div className="text-[10px] text-gray-400">
              {sorted.length} production{sorted.length !== 1 ? 's' : ''}
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 sm:px-8 py-8 space-y-8">

        {/* Overview: General Updates + Creative Link */}
        {hasOverview && (
          <div className={`grid gap-5 ${generalUpdates.length > 0 && creativeLink?.url ? 'grid-cols-1 lg:grid-cols-3' : 'grid-cols-1'}`}>
            {generalUpdates.length > 0 && (
              <div className={`bg-white rounded-2xl border border-gray-200 p-7 shadow-sm ${creativeLink?.url ? 'lg:col-span-2' : ''}`}>
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'rgba(99,102,241,0.1)' }}>
                    <FileText size={15} className="text-indigo-500" />
                  </div>
                  <h2 className="text-base font-black text-gray-800">General Updates</h2>
                </div>
                <div className="space-y-3">
                  {generalUpdates.map(dot => (
                    <div key={dot.id} className="flex items-start gap-3">
                      <div className="w-2 h-2 rounded-full mt-[7px] flex-shrink-0 bg-indigo-400 opacity-50" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-gray-700 leading-relaxed">{dot.text}</p>
                        <div className="flex items-center gap-3 mt-1 flex-wrap">
                          {dot.link && (
                            <a href={dot.link} target="_blank" rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-xs text-indigo-500 hover:underline">
                              <ExternalLink size={11} />
                              {(() => { try { return new URL(dot.link).hostname; } catch { return 'Link'; } })()}
                            </a>
                          )}
                          {dot.file && (
                            dot.file.mime_type?.startsWith('image/')
                              ? <img src={getDriveThumbnail(dot.file.view_url, 120)} alt={dot.file.name}
                                  className="h-12 rounded-md border border-gray-200 cursor-pointer mt-1"
                                  onClick={() => setLightbox(dot.file)} />
                              : <a href={dot.file.view_url} target="_blank" rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-xs text-blue-500 hover:underline">
                                  <FileText size={11} /> {dot.file.name}
                                </a>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {creativeLink?.url && (
              <div className="bg-white rounded-2xl border border-purple-100 p-7 shadow-sm flex flex-col justify-center">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-8 h-8 rounded-lg bg-purple-50 flex items-center justify-center">
                    <Link2 size={15} className="text-purple-500" />
                  </div>
                  <h2 className="text-base font-black text-gray-800">Creative Link</h2>
                </div>
                <a href={creativeLink.url} target="_blank" rel="noopener noreferrer"
                  className="group flex items-center gap-3 p-4 rounded-xl bg-purple-50/60 hover:bg-purple-50 border border-purple-100 transition-all">
                  <ExternalLink size={16} className="text-purple-500 flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-purple-700 group-hover:underline truncate">
                      {creativeLink.label || 'View Link'}
                    </p>
                    <p className="text-[11px] text-purple-400 truncate">
                      {(() => { try { return new URL(creativeLink.url).hostname; } catch { return creativeLink.url; } })()}
                    </p>
                  </div>
                </a>
              </div>
            )}
          </div>
        )}

        {/* Divider */}
        {hasOverview && sorted.length > 0 && (
          <div className="flex items-center gap-4">
            <div className="flex-1 h-px bg-gray-200" />
            <span className="text-xs font-bold uppercase tracking-widest text-gray-300">Productions</span>
            <div className="flex-1 h-px bg-gray-200" />
          </div>
        )}

        {/* Production table list */}
        {sorted.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            {/* Table header */}
            <div className="hidden md:grid grid-cols-[100px_1fr_1.5fr_auto] gap-4 px-5 py-3 bg-gray-50/80 border-b border-gray-200">
              <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Stage</div>
              <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Production</div>
              <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">This Week</div>
              <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest w-24 text-right">Links</div>
            </div>

            {/* Rows */}
            {sorted.map((entry, idx) => {
              const prod = productions.find(p => p.id === entry.production_id);
              if (!prod) return null;
              const bullets = entry.bullets || [];
              const notes = entry.long_text || entry.note || '';
              const links = entry.weekly_links || [];
              const hasContent = bullets.length > 0 || notes;

              return (
                <div
                  key={entry.production_id}
                  className={clsx(
                    'group transition-colors border-b border-gray-100 last:border-b-0',
                    idx % 2 === 1 && 'bg-gray-50/40',
                    'hover:bg-indigo-50/30'
                  )}
                >
                  {/* Desktop: table row */}
                  <div className="hidden md:grid grid-cols-[100px_1fr_1.5fr_auto] gap-4 px-5 py-4 items-start">
                    {/* Stage */}
                    <div className="pt-0.5">
                      <StageBadge stage={prod.stage} size="xs" />
                    </div>

                    {/* Production info */}
                    <div className="min-w-0">
                      <h3 className="text-sm font-bold text-gray-900 leading-tight">{prod.project_name}</h3>
                      <span className="font-mono text-[10px] text-gray-400">{prod.id}</span>
                      {notes && (
                        <p className="text-xs text-gray-500 mt-1 leading-relaxed line-clamp-2 whitespace-pre-line">{notes}</p>
                      )}
                    </div>

                    {/* Key points */}
                    <div className="min-w-0">
                      {bullets.length > 0 ? (
                        <div className="space-y-1">
                          {bullets.map(b => (
                            <div key={b.id} className="flex items-start gap-2">
                              <div className="w-1.5 h-1.5 rounded-full mt-[6px] flex-shrink-0 bg-indigo-400/60" />
                              <div className="flex-1 min-w-0">
                                <p className="text-xs text-gray-700 leading-relaxed">{b.text}</p>
                                {b.link && (
                                  <a href={b.link} target="_blank" rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 text-[10px] text-indigo-500 hover:underline mt-0.5">
                                    <ExternalLink size={8} /> {(() => { try { return new URL(b.link).hostname; } catch { return 'Link'; } })()}
                                  </a>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <span className="text-xs text-gray-300 italic">No updates</span>
                      )}
                    </div>

                    {/* Links */}
                    <div className="w-24 flex flex-wrap gap-1 justify-end">
                      {links.map(wl => (
                        <a key={wl.id} href={wl.url} target="_blank" rel="noopener noreferrer"
                          title={wl.title || wl.url}
                          className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-lg border border-gray-200 text-gray-500 hover:border-blue-300 hover:text-blue-600 hover:bg-blue-50 transition-all">
                          <ExternalLink size={9} />
                          <span className="max-w-[60px] truncate">{wl.title || 'Link'}</span>
                        </a>
                      ))}
                    </div>
                  </div>

                  {/* Mobile: stacked card */}
                  <div className="md:hidden px-5 py-4 space-y-2">
                    <div className="flex items-center gap-2">
                      <StageBadge stage={prod.stage} size="xs" />
                      <div className="flex-1 min-w-0">
                        <h3 className="text-sm font-bold text-gray-900 truncate">{prod.project_name}</h3>
                        <span className="font-mono text-[10px] text-gray-400">{prod.id}</span>
                      </div>
                    </div>
                    {notes && <p className="text-xs text-gray-500 leading-relaxed whitespace-pre-line">{notes}</p>}
                    {bullets.length > 0 && (
                      <div className="space-y-1 pl-1">
                        {bullets.map(b => (
                          <div key={b.id} className="flex items-start gap-2">
                            <div className="w-1.5 h-1.5 rounded-full mt-[5px] flex-shrink-0 bg-indigo-400/60" />
                            <p className="text-xs text-gray-700">{b.text}</p>
                          </div>
                        ))}
                      </div>
                    )}
                    {links.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {links.map(wl => (
                          <a key={wl.id} href={wl.url} target="_blank" rel="noopener noreferrer"
                            className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-lg border border-gray-200 text-gray-500 hover:text-blue-600">
                            <ExternalLink size={8} /> {wl.title || 'Link'}
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {sorted.length === 0 && !hasOverview && (
          <div className="text-center py-20 text-gray-400">No content in this report</div>
        )}
      </div>

      {/* Image Lightbox */}
      {lightbox && (
        <div className="fixed inset-0 z-[60] bg-black/85 flex items-center justify-center p-4" onClick={() => setLightbox(null)}>
          <button onClick={() => setLightbox(null)} className="absolute top-4 right-4 p-2 rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"><X size={20} /></button>
          <img src={getDriveThumbnail(lightbox.view_url, 1200)} alt={lightbox.name} className="max-w-full max-h-[90vh] rounded-lg shadow-2xl object-contain" onClick={e => e.stopPropagation()} />
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white/70 text-xs bg-black/40 px-3 py-1 rounded-full">{lightbox.name}</div>
        </div>
      )}
    </div>
  );
}
