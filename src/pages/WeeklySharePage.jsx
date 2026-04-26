import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { ExternalLink, FileText, Link2, X, ChevronDown, ChevronUp, ArrowUpDown, Calendar as CalendarIcon } from 'lucide-react';
import { getDriveThumbnail } from '../components/shared/FileUploadButton';
import StageBadge from '../components/ui/StageBadge';
import clsx from 'clsx';

function fmtDateShort(d) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function daysLeft(endDate) {
  if (!endDate) return null;
  const now = new Date();
  const end = new Date(endDate);
  return Math.ceil((end - now) / (1000 * 60 * 60 * 24));
}

function typeIcon(type) {
  if (type === 'Remote Shoot') return '📦';
  if (type === 'Shoot') return '🎬';
  if (type === 'AI') return '✨';
  return '🎯';
}

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

  const { report, productions, brand } = data;

  // Brand colors — default to Particle's indigo/blue if not provided
  const brandPrimary = brand?.primary_color || '#030b2e';
  const brandAccent = brand?.accent_color || '#0808f8';
  const brandName = brand?.name || 'Productions';
  const brandLogo = brand?.logo_url || null;

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
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-white"
      style={{ '--brand-primary': brandPrimary, '--brand-accent': brandAccent }}>
      {/* Hero — large centered logo on gradient */}
      <div className="relative overflow-hidden" style={{ background: `linear-gradient(135deg, ${brandPrimary} 0%, ${brandAccent} 100%)` }}>
        <div className="absolute inset-0 opacity-10" style={{ background: 'radial-gradient(circle at 20% 50%, white 0%, transparent 50%), radial-gradient(circle at 80% 30%, white 0%, transparent 40%)' }} />
        <div className="relative max-w-5xl mx-auto px-6 sm:px-8 py-10 text-center">
          {/* Logo — no background tile, just the logo on the gradient */}
          {brandLogo ? (
            <div className="inline-flex items-center justify-center mb-4">
              <img src={brandLogo} alt={brandName} className="max-w-[300px] max-h-16 w-auto h-auto object-contain drop-shadow-lg"
                style={{ filter: 'brightness(0) invert(1)' }} />
            </div>
          ) : (
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-white/10 backdrop-blur-sm border border-white/20 shadow-xl mb-4">
              <span className="text-3xl font-black text-white">
                {brandName.charAt(0).toUpperCase()}
              </span>
            </div>
          )}
          <div className="text-white/80 text-[11px] font-bold uppercase tracking-[0.2em] mb-1">
            Creative Weekly Report
          </div>
          <h1 className="text-white text-2xl sm:text-3xl font-black leading-tight">{report.title}</h1>
          <div className="flex items-center justify-center gap-3 mt-3 text-white/80 text-xs">
            <span className="font-semibold">{weekDate}</span>
            <span className="w-1 h-1 rounded-full bg-white/50" />
            <span>{sorted.length} production{sorted.length !== 1 ? 's' : ''}</span>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 sm:px-8 py-8 space-y-8 -mt-4">

        {/* Overview: General Updates + Creative Link */}
        {hasOverview && (
          <div className={`grid gap-5 ${generalUpdates.length > 0 && creativeLink?.url ? 'grid-cols-1 lg:grid-cols-3' : 'grid-cols-1'}`}>
            {generalUpdates.length > 0 && (
              <div className={`bg-white rounded-2xl border border-gray-200 p-7 shadow-sm ${creativeLink?.url ? 'lg:col-span-2' : ''}`}>
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `${brandAccent}1A` }}>
                    <FileText size={15} style={{ color: brandAccent }} />
                  </div>
                  <h2 className="text-base font-black text-gray-800">General Updates</h2>
                </div>
                <div className="space-y-3">
                  {generalUpdates.map(dot => (
                    <div key={dot.id} className="flex items-start gap-3">
                      <div className="w-2 h-2 rounded-full mt-[7px] flex-shrink-0 opacity-60" style={{ background: brandAccent }} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-gray-700 leading-relaxed">{dot.text}</p>
                        <div className="flex items-center gap-3 mt-1 flex-wrap">
                          {dot.link && (
                            <a href={dot.link} target="_blank" rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-xs hover:underline" style={{ color: brandAccent }}>
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
        {sorted.length > 0 && (
          <div className="flex items-center gap-3">
            {hasOverview && <div className="flex-1 h-px bg-gray-200" />}
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-widest text-gray-300">Productions</span>
              <span className="text-[10px] text-gray-300">·</span>
              <span className="text-[10px] text-gray-400 font-medium">{sorted.length}</span>
            </div>
            <div className="flex-1 h-px bg-gray-200" />
          </div>
        )}

        {/* Production cards — clean, spacious */}
        {sorted.length > 0 && (
          <div className="space-y-3">
            {sorted.map(entry => {
              const prod = productions.find(p => p.id === entry.production_id);
              if (!prod) return null;
              const bullets = entry.bullets || [];
              const notes = entry.long_text || entry.note || '';
              const links = entry.weekly_links || [];
              const days = daysLeft(prod.planned_end);

              return (
                <div key={entry.production_id}
                  className="bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden">
                  {/* Header — stage + name + ID + meta line */}
                  <div className="px-6 pt-5 pb-3">
                    <div className="flex items-start gap-3 flex-wrap mb-2">
                      <StageBadge stage={prod.stage} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="text-base font-black text-gray-900 leading-tight">{prod.project_name}</h3>
                          <span className="font-mono text-[10px] text-gray-400 bg-gray-50 px-1.5 py-0.5 rounded shrink-0">{prod.id}</span>
                        </div>
                      </div>
                    </div>

                    {/* Meta line: type + timeline + days left */}
                    {(prod.production_type || prod.planned_start || prod.planned_end) && (
                      <div className="flex items-center gap-2 flex-wrap text-[10px]">
                        {prod.production_type && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-semibold"
                            style={{ background: `${brandAccent}14`, color: brandAccent }}>
                            {typeIcon(prod.production_type)} {prod.production_type}
                          </span>
                        )}
                        {(prod.planned_start || prod.planned_end) && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-gray-50 text-gray-500">
                            <CalendarIcon size={9} />
                            {(() => {
                              const s = fmtDateShort(prod.planned_start);
                              const e = fmtDateShort(prod.planned_end);
                              if (s && e) return `${s} → ${e}`;
                              return s || e;
                            })()}
                          </span>
                        )}
                        {days !== null && (
                          <span className={clsx(
                            'inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-semibold',
                            days < 0 && 'bg-red-50 text-red-600',
                            days === 0 && 'bg-amber-50 text-amber-700',
                            days > 0 && days <= 7 && 'bg-amber-50 text-amber-600',
                            days > 7 && 'bg-gray-50 text-gray-400'
                          )}>
                            {days < 0 && `⚠️ ${Math.abs(days)}d overdue`}
                            {days === 0 && '🔥 Due today'}
                            {days > 0 && days <= 7 && `${days}d left`}
                            {days > 7 && `${days}d left`}
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Content — description + updates, only if there's something */}
                  {(notes || bullets.length > 0 || links.length > 0) && (
                    <div className="px-6 pb-5 pt-2 border-t border-gray-100 space-y-3">
                      {/* Description (notes) */}
                      {notes && (
                        <div>
                          <div className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Description</div>
                          <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-line">{notes}</p>
                        </div>
                      )}

                      {/* Updates / Key points */}
                      {bullets.length > 0 && (
                        <div>
                          <div className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">This Week</div>
                          <div className="space-y-1.5">
                            {bullets.map(b => (
                              <div key={b.id} className="flex items-start gap-2.5">
                                <div className="w-1.5 h-1.5 rounded-full mt-[7px] flex-shrink-0 opacity-70" style={{ background: brandAccent }} />
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm text-gray-800 leading-relaxed">{b.text}</p>
                                  {b.link && (
                                    <a href={b.link} target="_blank" rel="noopener noreferrer"
                                      className="inline-flex items-center gap-1 text-[10px] hover:underline mt-0.5" style={{ color: brandAccent }}>
                                      <ExternalLink size={8} /> {(() => { try { return new URL(b.link).hostname; } catch { return 'Link'; } })()}
                                    </a>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Links */}
                      {links.length > 0 && (
                        <div className="flex flex-wrap gap-2 pt-1">
                          {links.map(wl => (
                            <a key={wl.id} href={wl.url} target="_blank" rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full bg-gray-50 border border-gray-200 text-gray-600 hover:border-blue-300 hover:text-blue-600 hover:bg-blue-50 transition-all font-medium">
                              <ExternalLink size={10} />
                              {wl.title || (() => { try { return new URL(wl.url).hostname; } catch { return 'Link'; } })()}
                            </a>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Empty state — subtle */}
                  {!notes && bullets.length === 0 && links.length === 0 && (
                    <div className="px-6 pb-4 pt-2 border-t border-gray-100">
                      <p className="text-xs text-gray-300 italic">No updates this week</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {sorted.length === 0 && !hasOverview && (
          <div className="text-center py-20 text-gray-400">No content in this report</div>
        )}

        {/* Brand footer */}
        <div className="pt-8 pb-4 flex items-center justify-center gap-2 text-[10px] text-gray-300">
          <div className="w-1 h-1 rounded-full" style={{ background: brandAccent }} />
          <span className="font-semibold uppercase tracking-widest">{brandName}</span>
          <div className="w-1 h-1 rounded-full" style={{ background: brandAccent }} />
        </div>
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
