import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { MessageSquare, Clock, User, ChevronRight, Loader2, RefreshCw } from 'lucide-react';
import DOMPurify from 'dompurify';

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

export default function GlobalUpdatesTab({ brandId }) {
  const [updates, setUpdates] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => { loadUpdates(); }, [brandId]);

  async function loadUpdates() {
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/comments/all?brand_id=${brandId || ''}&limit=50`, {
        headers: { Authorization: `Bearer ${jwt()}` },
      });
      const data = await res.json();
      setUpdates(Array.isArray(data) ? data : []);
    } catch {}
    setLoading(false);
  }

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

  const grouped = groupByDate(updates);

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto py-8 space-y-3">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="flex gap-4 p-4">
            <div className="skeleton-block w-10 h-10 rounded-full shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="skeleton-block h-3 w-1/3 rounded" />
              <div className="skeleton-block h-4 w-full rounded" />
              <div className="skeleton-block h-3 w-1/4 rounded" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-sm font-black uppercase tracking-widest text-gray-400">All Updates</h2>
          <p className="text-xs text-gray-400 mt-0.5">{updates.length} updates across all productions</p>
        </div>
        <button onClick={loadUpdates} className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 transition-colors">
          <RefreshCw size={12} /> Refresh
        </button>
      </div>

      {updates.length === 0 ? (
        <div className="text-center py-16">
          <MessageSquare size={32} className="mx-auto mb-3 text-gray-200" />
          <p className="text-sm text-gray-400 font-medium">No updates yet</p>
          <p className="text-xs text-gray-400 mt-1">Updates from all productions will appear here</p>
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).map(([dateLabel, items]) => (
            <div key={dateLabel}>
              {/* Date header */}
              <div className="flex items-center gap-3 mb-3">
                <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">{dateLabel}</span>
                <div className="flex-1 h-px bg-gray-200" />
              </div>

              {/* Update cards */}
              <div className="space-y-2">
                {items.map(update => (
                  <div
                    key={update.id}
                    onClick={() => navigate(`/production/${update.production_id}`)}
                    className="group bg-white border border-gray-100 rounded-xl p-4 hover:border-gray-300 hover:shadow-md cursor-pointer transition-all"
                  >
                    <div className="flex items-start gap-3">
                      {/* Avatar */}
                      <div className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                        style={{ background: 'var(--brand-glow, #eef2ff)', color: 'var(--brand-accent, #6366f1)' }}>
                        {(update.author || '?').charAt(0).toUpperCase()}
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-bold text-gray-800">{update.author}</span>
                          <span className="text-[9px] text-gray-400">{timeAgo(update.created_at)}</span>
                          <span className="ml-auto text-[9px] px-2 py-0.5 rounded-full font-semibold shrink-0"
                            style={{ background: 'var(--brand-glow, #eef2ff)', color: 'var(--brand-accent, #6366f1)' }}>
                            {update.project_name || update.production_id}
                          </span>
                        </div>

                        {/* Comment body — sanitized HTML */}
                        <div
                          className="text-sm text-gray-700 leading-relaxed line-clamp-3 [&_a]:text-indigo-600 [&_a]:underline [&_b]:font-bold [&_i]:italic"
                          dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(update.body || '', { ALLOWED_TAGS: ['b', 'i', 'u', 'a', 'br', 'p', 'span', 'strong', 'em'], ALLOWED_ATTR: ['href', 'target', 'rel', 'class'] }) }}
                        />

                        {/* Footer */}
                        <div className="flex items-center gap-3 mt-2 text-[10px] text-gray-400">
                          <span className="flex items-center gap-1"><Clock size={9} /> {new Date(update.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                          {update.production_stage && (
                            <span className="flex items-center gap-1">{update.production_stage}</span>
                          )}
                        </div>
                      </div>

                      <ChevronRight size={14} className="text-gray-300 group-hover:text-gray-500 shrink-0 mt-2 transition-colors" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
