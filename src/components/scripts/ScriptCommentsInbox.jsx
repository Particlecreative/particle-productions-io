import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  X, MessageSquare, CheckCircle, ExternalLink, RefreshCw, Loader2, Inbox,
} from 'lucide-react';
import clsx from 'clsx';

const API = import.meta.env.VITE_API_URL || '';
function jwt() { return localStorage.getItem('cp_auth_token'); }

const CELL_LABEL = { what_we_see: 'What We See', what_we_hear: 'What We Hear', location: 'Location', scene: 'Scene' };

function timeAgo(dateStr) {
  const d = new Date(dateStr);
  const diff = Math.floor((Date.now() - d) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function avatarColor(name = 'A') {
  return `hsl(${(name || 'A').charCodeAt(0) * 37 % 360}, 50%, 55%)`;
}

/**
 * Cross-script comments triage drawer. Lists every OPEN comment across the brand's
 * scripts, grouped by script, so feedback can be read and resolved in one place —
 * without opening each script. "Open" jumps to the script and opens its sidebar.
 */
export default function ScriptCommentsInbox({ isOpen, onClose, brandId, onOpenScript }) {
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [resolving, setResolving] = useState(null); // comment id being resolved

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/scripts/comments/inbox?brand_id=${encodeURIComponent(brandId || '')}`, {
        headers: { Authorization: `Bearer ${jwt()}` },
      });
      const data = await res.json();
      setComments(Array.isArray(data) ? data : []);
    } catch { setComments([]); }
    setLoading(false);
  }, [brandId]);

  useEffect(() => { if (isOpen) load(); }, [isOpen, load]);

  async function resolve(c) {
    setResolving(c.id);
    try {
      await fetch(`${API}/api/scripts/${c.script_id}/comments/${c.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt()}` },
        body: JSON.stringify({ status: 'resolved' }),
      });
      // Optimistically drop it from the list
      setComments(prev => prev.filter(x => x.id !== c.id));
    } catch { /* leave in place on failure */ }
    setResolving(null);
  }

  // Group open comments by script, preserving newest-first order
  const groups = useMemo(() => {
    const map = new Map();
    for (const c of comments) {
      if (!map.has(c.script_id)) {
        map.set(c.script_id, {
          scriptId: c.script_id,
          title: c.script_title || 'Untitled script',
          project: c.project_name || null,
          items: [],
        });
      }
      map.get(c.script_id).items.push(c);
    }
    return [...map.values()];
  }, [comments]);

  if (!isOpen) return null;

  let rowIdx = 0;

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/20 animate-fade-in" onClick={onClose} />
      <div className="fixed inset-y-0 right-0 z-50 w-full sm:w-[420px] bg-white border-l border-gray-100 shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center">
              <Inbox size={16} className="text-amber-600" />
            </div>
            <div>
              <h3 className="font-black text-gray-900 text-sm leading-tight">Comments Inbox</h3>
              <p className="text-[10px] text-gray-400 leading-tight">
                {comments.length} open across {groups.length} script{groups.length === 1 ? '' : 's'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={load} disabled={loading}
              className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 transition-colors disabled:opacity-50" title="Refresh">
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            </button>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 transition-colors">
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-3 py-3">
          {loading && comments.length === 0 ? (
            <div className="py-16 text-center text-gray-400">
              <Loader2 size={22} className="mx-auto animate-spin" />
            </div>
          ) : groups.length === 0 ? (
            <div className="py-16 text-center px-6">
              <div className="w-14 h-14 mx-auto mb-3 rounded-2xl bg-green-50 flex items-center justify-center">
                <CheckCircle size={26} className="text-green-400" />
              </div>
              <p className="text-sm font-semibold text-gray-600">All caught up</p>
              <p className="text-xs text-gray-400 mt-0.5">No open comments on any script right now.</p>
            </div>
          ) : (
            groups.map(group => (
              <div key={group.scriptId} className="mb-4">
                {/* Script header */}
                <div className="sticky top-0 z-10 flex items-center gap-2 px-2 py-1.5 bg-white/95 backdrop-blur-sm">
                  <button
                    onClick={() => onOpenScript?.(group.scriptId)}
                    className="flex items-center gap-1.5 min-w-0 group/hdr text-left"
                    title="Open this script"
                  >
                    <span className="text-xs font-bold text-gray-800 truncate group-hover/hdr:text-amber-600 transition-colors">
                      {group.title}
                    </span>
                    <ExternalLink size={11} className="text-gray-300 group-hover/hdr:text-amber-500 shrink-0" />
                  </button>
                  <span className="ml-auto shrink-0 text-[10px] font-bold text-amber-700 bg-amber-100 rounded-full px-1.5 py-0.5">
                    {group.items.length}
                  </span>
                </div>
                {group.project && (
                  <div className="px-2 -mt-0.5 mb-1 text-[10px] text-gray-400 truncate">{group.project}</div>
                )}

                {/* Threads */}
                <div className="space-y-1.5">
                  {group.items.map(c => (
                    <div
                      key={c.id}
                      className="fs-card-in rounded-xl border border-gray-100 hover:border-amber-200 hover:shadow-sm bg-white px-3 py-2.5 transition-all"
                      style={{ animationDelay: `${Math.min(rowIdx++, 14) * 25}ms` }}
                    >
                      {/* author + time */}
                      <div className="flex items-center gap-2 mb-1.5">
                        <div className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white shrink-0"
                          style={{ background: avatarColor(c.author_name) }}>
                          {(c.author_name || 'A')[0].toUpperCase()}
                        </div>
                        <span className="text-[11px] font-semibold text-gray-700 truncate">{c.author_name || 'Anonymous'}</span>
                        {c.cell && CELL_LABEL[c.cell] && (
                          <span className="text-[9px] text-gray-400 bg-gray-100 rounded px-1.5 py-0.5 shrink-0">{CELL_LABEL[c.cell]}</span>
                        )}
                        <span className="text-[10px] text-gray-300 ml-auto shrink-0">{timeAgo(c.created_at)}</span>
                      </div>

                      {/* quoted text */}
                      {c.selected_text && (
                        <div className="mb-1.5 px-2 py-1 bg-amber-50 border-l-2 border-amber-400 rounded-r text-[11px] text-amber-700 italic line-clamp-2">
                          "{c.selected_text}"
                        </div>
                      )}

                      {/* comment */}
                      <p className="text-[13px] text-gray-700 leading-relaxed">{c.text}</p>

                      {/* footer actions */}
                      <div className="flex items-center gap-3 mt-2">
                        {c.reply_count > 0 && (
                          <span className="flex items-center gap-1 text-[10px] text-gray-400">
                            <MessageSquare size={10} /> {c.reply_count} repl{c.reply_count === 1 ? 'y' : 'ies'}
                          </span>
                        )}
                        <button
                          onClick={() => onOpenScript?.(group.scriptId)}
                          className="flex items-center gap-1 text-[10px] font-semibold text-gray-400 hover:text-amber-600 transition-colors ml-auto"
                        >
                          <ExternalLink size={10} /> Open
                        </button>
                        <button
                          onClick={() => resolve(c)}
                          disabled={resolving === c.id}
                          className="flex items-center gap-1 text-[10px] font-semibold text-green-600 hover:text-green-700 transition-colors disabled:opacity-50"
                        >
                          {resolving === c.id ? <Loader2 size={10} className="animate-spin" /> : <CheckCircle size={10} />} Resolve
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
}
