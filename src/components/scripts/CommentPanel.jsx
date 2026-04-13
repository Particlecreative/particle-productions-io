import { useState, useEffect, useRef, useMemo } from 'react';
import { X, Send, Check, CheckCircle, MessageSquare, ChevronDown, ChevronRight, Reply, Pencil } from 'lucide-react';
import clsx from 'clsx';

// ── Name Modal ─────────────────────────────────────────────────────────────────
export function NameModal({ isOpen, onSave, initialName = '' }) {
  const [name, setName] = useState(initialName);
  const inputRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      setName(initialName || '');
      // Use timeout to avoid focus race conditions
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen, initialName]);

  if (!isOpen) return null;

  function handleSave() {
    const trimmed = name.trim();
    if (!trimmed) return;
    localStorage.setItem('cp_commenter_name', trimmed);
    onSave(trimmed);
  }

  return (
    <div className="fixed inset-0 z-[70] bg-black/30 flex items-center justify-center p-4 animate-fade-in" onClick={e => e.stopPropagation()}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
        <div className="px-6 pt-6 pb-2">
          <h3 className="text-base font-black text-gray-900 mb-1">What's your name?</h3>
          <p className="text-xs text-gray-400">This will be shown next to your comments</p>
        </div>
        <div className="px-6 py-4">
          <input
            ref={inputRef}
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleSave(); }}
            placeholder="Enter your full name"
            className="w-full text-sm font-medium border border-gray-200 rounded-xl px-4 py-3 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100 transition-all"
          />
        </div>
        <div className="px-6 pb-6 flex gap-2">
          <button
            onClick={handleSave}
            disabled={!name.trim()}
            className="flex-1 py-2.5 bg-amber-500 text-white rounded-xl font-bold text-sm hover:bg-amber-600 transition-colors disabled:opacity-40"
          >
            Save & Continue
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Single Comment ─────────────────────────────────────────────────────────────
function Comment({ comment, replies = [], onReply, onResolve, currentUserName, isReply = false }) {
  const [showReply, setShowReply] = useState(false);
  const [replyText, setReplyText] = useState('');
  const replyRef = useRef(null);
  const isResolved = comment.status === 'resolved';

  function handleReply() {
    if (!replyText.trim()) return;
    onReply(comment.id, replyText.trim());
    setReplyText('');
    setShowReply(false);
  }

  const timeAgo = (dateStr) => {
    const d = new Date(dateStr);
    const now = new Date();
    const diff = Math.floor((now - d) / 1000);
    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  return (
    <div className={clsx(
      'group/comment',
      isReply && 'ml-8 pl-3 border-l-2 border-gray-200',
      isResolved && !isReply && 'opacity-50'
    )}>
      <div className={clsx(
        'rounded-xl px-3 py-2.5 transition-colors',
        isResolved ? 'bg-green-50/50' : 'hover:bg-gray-50'
      )}>
        {/* Header */}
        <div className="flex items-center gap-2 mb-1">
          <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0"
            style={{ background: `hsl(${(comment.author_name || 'A').charCodeAt(0) * 37 % 360}, 50%, 55%)` }}>
            {(comment.author_name || 'A')[0].toUpperCase()}
          </div>
          <span className="text-xs font-semibold text-gray-800">{comment.author_name || 'Anonymous'}</span>
          <span className="text-[10px] text-gray-400 ml-auto">{timeAgo(comment.created_at)}</span>
        </div>

        {/* Quoted text */}
        {comment.selected_text && !isReply && (
          <div className="mb-1.5 px-2 py-1 bg-amber-50 border-l-2 border-amber-400 rounded-r text-[11px] text-amber-700 italic line-clamp-2">
            "{comment.selected_text}"
          </div>
        )}

        {/* Comment text */}
        <p className={clsx('text-sm text-gray-700 leading-relaxed', isResolved && 'line-through text-gray-400')}>
          {comment.text}
        </p>

        {/* Actions */}
        {!isReply && (
          <div className="flex items-center gap-2 mt-1.5 opacity-0 group-hover/comment:opacity-100 transition-opacity">
            <button onClick={() => { setShowReply(true); setTimeout(() => replyRef.current?.focus(), 50); }}
              className="flex items-center gap-1 text-[10px] text-gray-400 hover:text-blue-500 transition-colors">
              <Reply size={10} /> Reply
            </button>
            {onResolve && !isResolved && (
              <button onClick={() => onResolve(comment.id, 'resolved')}
                className="flex items-center gap-1 text-[10px] text-gray-400 hover:text-green-500 transition-colors">
                <CheckCircle size={10} /> Resolve
              </button>
            )}
            {onResolve && isResolved && (
              <button onClick={() => onResolve(comment.id, 'open')}
                className="flex items-center gap-1 text-[10px] text-green-500 hover:text-gray-500 transition-colors">
                <CheckCircle size={10} /> Reopen
              </button>
            )}
          </div>
        )}
      </div>

      {/* Replies */}
      {replies.map(r => (
        <Comment key={r.id} comment={r} isReply onReply={onReply} onResolve={null} currentUserName={currentUserName} />
      ))}

      {/* Reply input */}
      {showReply && (
        <div className="ml-8 pl-3 border-l-2 border-blue-200 mt-1">
          <div className="flex items-start gap-1.5">
            <textarea
              ref={replyRef}
              value={replyText}
              onChange={e => setReplyText(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleReply(); } if (e.key === 'Escape') setShowReply(false); }}
              placeholder="Reply…"
              rows={1}
              className="flex-1 text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 outline-none focus:border-blue-300 resize-none"
            />
            <button onClick={handleReply} disabled={!replyText.trim()}
              className="p-1.5 rounded-lg bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-30 transition-colors shrink-0">
              <Send size={10} />
            </button>
            <button onClick={() => setShowReply(false)} className="p-1.5 text-gray-400 hover:text-gray-600 shrink-0">
              <X size={10} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Comment Sidebar ────────────────────────────────────────────────────────────
export function CommentSidebar({
  isOpen, comments = [], scenes = [], pendingComment, commenterName,
  onSubmitComment, onResolve, onReply, onClose, onChangeName,
}) {
  const [newText, setNewText] = useState('');
  const [showResolved, setShowResolved] = useState(false);
  const inputRef = useRef(null);
  const bottomRef = useRef(null);

  // Focus input when pending comment changes
  useEffect(() => {
    if (pendingComment && commenterName) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [pendingComment, commenterName]);

  // Group comments: top-level + their replies
  const { openThreads, resolvedThreads } = useMemo(() => {
    const topLevel = comments.filter(c => !c.parent_comment_id);
    const repliesMap = {};
    comments.filter(c => c.parent_comment_id).forEach(r => {
      if (!repliesMap[r.parent_comment_id]) repliesMap[r.parent_comment_id] = [];
      repliesMap[r.parent_comment_id].push(r);
    });
    // Sort replies by created_at
    Object.values(repliesMap).forEach(arr => arr.sort((a, b) => new Date(a.created_at) - new Date(b.created_at)));

    const open = topLevel.filter(c => c.status !== 'resolved');
    const resolved = topLevel.filter(c => c.status === 'resolved');
    return {
      openThreads: open.map(c => ({ ...c, replies: repliesMap[c.id] || [] })),
      resolvedThreads: resolved.map(c => ({ ...c, replies: repliesMap[c.id] || [] })),
    };
  }, [comments]);

  // Group open threads by scene
  const groupedByScene = useMemo(() => {
    const groups = {};
    openThreads.forEach(t => {
      const key = t.scene_id || '_general';
      if (!groups[key]) groups[key] = [];
      groups[key].push(t);
    });
    return groups;
  }, [openThreads]);

  function getSceneLabel(sceneId) {
    const idx = scenes.findIndex(s => s.id === sceneId);
    if (idx === -1) return 'General';
    return `Scene ${idx + 1}${scenes[idx].location ? ' · ' + scenes[idx].location : ''}`;
  }

  function handleSubmit() {
    if (!newText.trim()) return;
    onSubmitComment({ ...pendingComment, text: newText.trim() });
    setNewText('');
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-y-0 right-0 z-40 w-[380px] bg-white border-l border-gray-100 shadow-2xl flex flex-col transition-transform duration-300 ease-out scripts-no-print">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
        <div className="flex items-center gap-2">
          <MessageSquare size={15} className="text-amber-500" />
          <h3 className="font-bold text-gray-900 text-sm">Comments</h3>
          <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full font-medium">{openThreads.length} open</span>
        </div>
        <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100 text-gray-400 transition-colors">
          <X size={16} />
        </button>
      </div>

      {/* Commenter name bar */}
      <div className="px-5 py-2 border-b border-gray-50 flex items-center gap-2 text-xs text-gray-500 shrink-0">
        <div className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white shrink-0"
          style={{ background: commenterName ? `hsl(${commenterName.charCodeAt(0) * 37 % 360}, 50%, 55%)` : '#9ca3af' }}>
          {(commenterName || '?')[0].toUpperCase()}
        </div>
        <span className="font-medium text-gray-700">{commenterName || 'Anonymous'}</span>
        <button onClick={onChangeName} className="text-[10px] text-blue-500 hover:underline ml-auto">
          <Pencil size={9} className="inline mr-0.5" /> Change
        </button>
      </div>

      {/* New comment input (when pending) */}
      {pendingComment && (
        <div className="px-5 py-3 border-b border-amber-100 bg-amber-50/50 shrink-0">
          {pendingComment.selected_text && (
            <div className="mb-2 px-2.5 py-1.5 bg-amber-100/60 border-l-2 border-amber-400 rounded-r text-[11px] text-amber-700 italic line-clamp-2">
              "{pendingComment.selected_text}"
            </div>
          )}
          {pendingComment.scene_id && (
            <p className="text-[10px] text-amber-600 font-medium mb-1.5">{getSceneLabel(pendingComment.scene_id)}</p>
          )}
          <textarea
            ref={inputRef}
            value={newText}
            onChange={e => setNewText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSubmit(); if (e.key === 'Escape') onClose(); }}
            placeholder="Write your feedback…"
            rows={3}
            className="w-full text-sm border border-amber-200 rounded-xl px-3 py-2.5 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100 resize-none bg-white transition-all"
          />
          <div className="flex items-center justify-between mt-2">
            <span className="text-[9px] text-gray-400">⌘+Enter to send</span>
            <div className="flex gap-1.5">
              <button onClick={() => { setNewText(''); onClose(); }}
                className="px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-100 rounded-lg transition-colors">Cancel</button>
              <button onClick={handleSubmit} disabled={!newText.trim()}
                className="flex items-center gap-1 px-3 py-1.5 bg-amber-500 text-white text-xs font-bold rounded-lg hover:bg-amber-600 disabled:opacity-40 transition-colors">
                <Send size={10} /> Send
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Comments list */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-1">
        {openThreads.length === 0 && resolvedThreads.length === 0 && !pendingComment && (
          <div className="text-center py-12">
            <MessageSquare size={28} className="mx-auto mb-3 text-gray-200" />
            <p className="text-sm text-gray-400 font-medium">No comments yet</p>
            <p className="text-xs text-gray-300 mt-1">Select text in the script to leave feedback</p>
          </div>
        )}

        {/* Open comments grouped by scene */}
        {Object.entries(groupedByScene).map(([sceneId, threads]) => (
          <div key={sceneId} className="mb-3">
            <div className="text-[9px] font-bold text-gray-400 uppercase tracking-wider px-3 py-1.5 sticky top-0 bg-white/90 backdrop-blur-sm z-10">
              {getSceneLabel(sceneId)}
            </div>
            <div className="space-y-0.5">
              {threads.map(t => (
                <Comment
                  key={t.id}
                  comment={t}
                  replies={t.replies}
                  onReply={onReply}
                  onResolve={onResolve}
                  currentUserName={commenterName}
                />
              ))}
            </div>
          </div>
        ))}

        {/* Resolved section */}
        {resolvedThreads.length > 0 && (
          <div className="mt-4 pt-3 border-t border-gray-100">
            <button onClick={() => setShowResolved(p => !p)}
              className="flex items-center gap-1.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider hover:text-gray-600 transition-colors w-full px-3 py-1">
              {showResolved ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
              Resolved ({resolvedThreads.length})
            </button>
            {showResolved && (
              <div className="space-y-0.5 mt-1">
                {resolvedThreads.map(t => (
                  <Comment key={t.id} comment={t} replies={t.replies} onReply={onReply} onResolve={onResolve} currentUserName={commenterName} />
                ))}
              </div>
            )}
          </div>
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}

// ── Comment Badge (for scene rows) ─────────────────────────────────────────────
export function CommentBadge({ count, onClick }) {
  if (!count || count <= 0) return null;
  return (
    <button onClick={onClick}
      className="flex items-center gap-0.5 text-[10px] text-amber-600 font-bold bg-amber-50 border border-amber-200 rounded-full px-1.5 py-0.5 hover:bg-amber-100 transition-colors">
      <MessageSquare size={9} /> {count}
    </button>
  );
}
