import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { MessageSquare, Clock, ChevronRight, Loader2, RefreshCw, Filter, Paperclip } from 'lucide-react';
import DOMPurify from 'dompurify';
import StageBadge from '../ui/StageBadge';

const API = import.meta.env.VITE_API_URL || '';
function jwt() { return localStorage.getItem('cp_auth_token'); }

function timeAgo(dateStr) {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

// Generate consistent color from string
function stringColor(str) {
  let hash = 0;
  for (let i = 0; i < (str || '').length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
  const colors = ['#6366f1', '#8b5cf6', '#ec4899', '#f97316', '#14b8a6', '#3b82f6', '#10b981', '#f43f5e'];
  return colors[Math.abs(hash) % colors.length];
}

export default function GlobalUpdatesTab({ brandId, productions = [] }) {
  const [updates, setUpdates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterProd, setFilterProd] = useState('');
  const navigate = useNavigate();

  useEffect(() => { loadUpdates(); }, [brandId]);

  async function loadUpdates() {
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/comments/all?brand_id=${brandId || ''}&limit=100`, {
        headers: { Authorization: `Bearer ${jwt()}` },
      });
      const data = await res.json();
      setUpdates(Array.isArray(data) ? data : []);
    } catch {}
    setLoading(false);
  }

  const filtered = filterProd
    ? updates.filter(u => u.production_id === filterProd)
    : updates;

  // Group by date
  function groupByDate(items) {
    const groups = {};
    items.forEach(item => {
      const date = new Date(item.created_at);
      const today = new Date();
      const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
      let label;
      if (date.toDateString() === today.toDateString()) label = 'Today';
      else if (date.toDateString() === yesterday.toDateString()) label = 'Yesterday';
      else label = date.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' });
      if (!groups[label]) groups[label] = [];
      groups[label].push(item);
    });
    return groups;
  }

  // Get unique productions for filter
  const prodOptions = [...new Map(updates.map(u => [u.production_id, { id: u.production_id, name: u.project_name }])).values()];

  const grouped = groupByDate(filtered);

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto py-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="rounded-2xl border border-gray-100 p-5">
              <div className="flex items-start gap-3">
                <div className="skeleton-block w-10 h-10 rounded-full shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="skeleton-block h-3 w-2/3 rounded" />
                  <div className="skeleton-block h-4 w-full rounded" />
                  <div className="skeleton-block h-3 w-1/3 rounded" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-5 gap-4 flex-wrap">
        <div>
          <h2 className="text-lg font-black" style={{ color: 'var(--brand-primary)' }}>Updates Feed</h2>
          <p className="text-xs text-gray-400 mt-0.5">{filtered.length} update{filtered.length !== 1 ? 's' : ''} across {prodOptions.length} production{prodOptions.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Production filter */}
          {prodOptions.length > 1 && (
            <select
              value={filterProd}
              onChange={e => setFilterProd(e.target.value)}
              className="text-xs border border-gray-200 rounded-lg px-3 py-1.5 outline-none focus:border-gray-400 bg-white"
            >
              <option value="">All Productions</option>
              {prodOptions.map(p => (
                <option key={p.id} value={p.id}>{p.id} — {p.name}</option>
              ))}
            </select>
          )}
          <button onClick={loadUpdates} className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 px-2.5 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors">
            <RefreshCw size={11} /> Refresh
          </button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-20">
          <div className="w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center" style={{ background: 'var(--brand-glow)' }}>
            <MessageSquare size={28} style={{ color: 'var(--brand-accent)', opacity: 0.5 }} />
          </div>
          <p className="text-sm font-semibold text-gray-500">No updates yet</p>
          <p className="text-xs text-gray-400 mt-1">Comments and updates from productions will appear here</p>
        </div>
      ) : (
        <div className="space-y-8">
          {Object.entries(grouped).map(([dateLabel, items]) => (
            <div key={dateLabel}>
              {/* Date divider */}
              <div className="flex items-center gap-3 mb-4">
                <div className="w-2 h-2 rounded-full" style={{ background: 'var(--brand-accent)' }} />
                <span className="text-xs font-black uppercase tracking-widest text-gray-400">{dateLabel}</span>
                <div className="flex-1 h-px bg-gray-100" />
                <span className="text-[10px] text-gray-400">{items.length} update{items.length !== 1 ? 's' : ''}</span>
              </div>

              {/* Cards grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {items.map(update => {
                  const avatarColor = stringColor(update.author);
                  const hasLinks = (update.body || '').includes('href=');
                  return (
                    <div
                      key={update.id}
                      onClick={() => navigate(`/production/${update.production_id}`)}
                      className="group bg-white rounded-2xl border border-gray-100 p-5 hover:border-gray-200 hover:shadow-lg cursor-pointer transition-all relative overflow-hidden"
                    >
                      {/* Accent line */}
                      <div className="absolute top-0 left-0 right-0 h-0.5 opacity-0 group-hover:opacity-100 transition-opacity" style={{ background: avatarColor }} />

                      {/* Header: avatar + author + time */}
                      <div className="flex items-center gap-3 mb-3">
                        <div className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold shrink-0 text-white"
                          style={{ background: avatarColor }}>
                          {(update.author || '?').charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-gray-800 truncate">{update.author}</span>
                            <span className="text-[10px] text-gray-400 shrink-0">{timeAgo(update.created_at)}</span>
                          </div>
                        </div>
                        {hasLinks && <Paperclip size={11} className="text-gray-300 shrink-0" />}
                      </div>

                      {/* Body */}
                      <div
                        className="text-[13px] text-gray-600 leading-relaxed line-clamp-3 mb-3 [&_a]:text-indigo-600 [&_a]:underline [&_b]:font-bold [&_i]:italic"
                        dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(update.body || '', { ALLOWED_TAGS: ['b', 'i', 'u', 'a', 'br', 'p', 'span', 'strong', 'em'], ALLOWED_ATTR: ['href', 'target', 'rel', 'class'] }) }}
                      />

                      {/* Footer: production info */}
                      <div className="flex items-center gap-2 pt-2 border-t border-gray-50">
                        <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-md bg-gray-100 text-gray-600">
                          {update.production_id}
                        </span>
                        <span className="text-[10px] text-gray-500 truncate flex-1">
                          {update.project_name}
                        </span>
                        {update.production_stage && (
                          <StageBadge stage={update.production_stage} size="xs" />
                        )}
                        <ChevronRight size={12} className="text-gray-300 group-hover:text-gray-500 shrink-0 transition-colors" />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
