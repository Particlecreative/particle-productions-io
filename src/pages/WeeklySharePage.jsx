import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { ExternalLink, FileText, Link2 } from 'lucide-react';
import StageBadge from '../components/ui/StageBadge';

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

  const { report, productions, comments } = data;
  const commentLookup = {};
  (comments || []).forEach(c => { commentLookup[c.id] = c.body; });

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
        <div className="max-w-7xl mx-auto px-6 sm:px-8 py-4 flex items-center justify-between">
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

      <div className="max-w-7xl mx-auto px-6 sm:px-8 py-8 space-y-8">

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
                        {dot.link && (
                          <a href={dot.link} target="_blank" rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs mt-1 text-indigo-500 hover:underline">
                            <ExternalLink size={11} />
                            {(() => { try { return new URL(dot.link).hostname; } catch { return 'Link'; } })()}
                          </a>
                        )}
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

        {/* Production cards */}
        {sorted.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-5">
            {sorted.map(entry => {
              const prod = productions.find(p => p.id === entry.production_id);
              if (!prod) return null;
              return (
                <div key={entry.production_id} className="rounded-2xl border border-gray-200 bg-white shadow-md flex flex-col min-h-[220px]">
                  <div className="rounded-t-2xl px-5 py-4 bg-gray-50 border-b border-gray-100">
                    <StageBadge stage={prod.stage} />
                    <h3 className="font-black text-gray-900 text-base leading-tight mt-2">{prod.project_name}</h3>
                    <span className="font-mono text-[10px] text-gray-400">{prod.id}</span>
                  </div>
                  <div className="flex-1 px-5 py-4 space-y-3">
                    {entry.note && <p className="text-sm text-gray-700 leading-relaxed">{entry.note}</p>}
                    {(entry.selected_comment_ids || []).length > 0 && (
                      <div className="space-y-1.5">
                        {entry.selected_comment_ids.map(cid => {
                          const approved = (entry.approved_comment_ids || []).includes(cid);
                          return (
                            <div key={cid} className="flex items-start gap-2 text-xs text-gray-700">
                              <span className={`flex-shrink-0 w-4 h-4 rounded-full flex items-center justify-center text-[9px] mt-0.5 ${approved ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-500'}`}>
                                {approved ? '✓' : '•'}
                              </span>
                              <span className={approved ? 'font-medium text-gray-800 text-[11px]' : 'text-[11px]'}>
                                {commentLookup[cid] || '…'}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                    {(entry.weekly_links || []).length > 0 && (
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {entry.weekly_links.map(wl => (
                          <a key={wl.id} href={wl.url} target="_blank" rel="noopener noreferrer"
                            className={`flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-full border transition-all font-medium ${
                              wl.approved
                                ? 'bg-green-50 border-green-300 text-green-700 hover:bg-green-100'
                                : 'bg-gray-50 border-gray-200 text-gray-600 hover:border-blue-300 hover:text-blue-600'
                            }`}>
                            {wl.approved ? '✅' : '🔗'} {wl.title || wl.url}
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
    </div>
  );
}
