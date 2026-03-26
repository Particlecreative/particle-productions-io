import { useState, useEffect, useRef } from 'react';
import { ExternalLink, Pencil, Check, X, Maximize2, Minimize2, RefreshCw, LayoutGrid, Loader2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import clsx from 'clsx';

const STORAGE_KEY = 'cp_studio_tickets';

const SIZE_PRESETS = [
  { id: 'compact',  label: 'Compact',  height: '55vh' },
  { id: 'standard', label: 'Standard', height: '72vh' },
  { id: 'full',     label: 'Full',     height: 'calc(100vh - 220px)' },
];

const DEFAULTS = {
  videoFormUrl:  'https://forms.monday.com/forms/3338cd016ac8f73b819a90f49f0dabfe?r=use1',
  designFormUrl: 'https://forms.monday.com/forms/c5c62bf4ebeb9af33f52be5ba9216ebc?r=use1',
  embedUrl:      '', // Paste Monday.com embed URL via the edit button below
};

const BOARD_COLORS = [
  'linear-gradient(135deg, #6366f1, #8b5cf6)',
  'linear-gradient(135deg, #ec4899, #f43f5e)',
  'linear-gradient(135deg, #14b8a6, #06b6d4)',
  'linear-gradient(135deg, #f59e0b, #f97316)',
  'linear-gradient(135deg, #3b82f6, #6366f1)',
  'linear-gradient(135deg, #10b981, #14b8a6)',
  'linear-gradient(135deg, #f43f5e, #fb923c)',
  'linear-gradient(135deg, #8b5cf6, #a855f7)',
];

function loadSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : { ...DEFAULTS };
  } catch { return { ...DEFAULTS }; }
}

function saveSettings(patch) {
  const current = loadSettings();
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...current, ...patch }));
}

async function fetchMondayBoards(token) {
  const res = await fetch('/api/monday/query', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      query: `{ boards(limit: 30) { id name state board_kind items_count description } }`,
    }),
  });
  if (!res.ok) throw new Error(`API error ${res.status}`);
  const json = await res.json();
  if (json.errors) throw new Error(json.errors[0]?.message || 'Monday.com query failed');
  return json.data?.boards || [];
}

export default function StudioTickets() {
  const { isEditor, token } = useAuth();
  const [settings, setSettings] = useState(loadSettings);
  const [sizeId, setSizeId] = useState('standard');
  const [editingEmbed, setEditingEmbed] = useState(false);
  const [embedDraft, setEmbedDraft] = useState('');
  const iframeKey = useRef(0);

  // Monday.com boards state
  const [boards, setBoards] = useState([]);
  const [boardsLoading, setBoardsLoading] = useState(false);
  const [boardsError, setBoardsError] = useState(null);

  const iframeHeight = SIZE_PRESETS.find(p => p.id === sizeId)?.height || '72vh';

  function patchSettings(patch) {
    const next = { ...settings, ...patch };
    setSettings(next);
    saveSettings(patch);
  }

  function handleEmbedSave() {
    patchSettings({ embedUrl: embedDraft });
    setEditingEmbed(false);
    iframeKey.current += 1;
  }

  // Fetch boards on mount (only when no embed URL is set, or always as supplementary)
  useEffect(() => {
    loadBoards();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadBoards() {
    setBoardsLoading(true);
    setBoardsError(null);
    try {
      const data = await fetchMondayBoards(token);
      setBoards(data);
    } catch (err) {
      setBoardsError(err.message);
    } finally {
      setBoardsLoading(false);
    }
  }

  const activeBoards = boards.filter(b => b.state === 'active');
  const totalItems = activeBoards.reduce((sum, b) => sum + (b.items_count || 0), 0);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-black brand-title" style={{ color: 'var(--brand-primary)' }}>
          Studio Tickets
        </h1>
      </div>

      {/* Request cards (2-col) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mb-8">
        <RequestCard
          icon="🎬"
          title="Video Request"
          subtitle="Submit a new video production request to the studio"
          url={settings.videoFormUrl}
          isEditor={isEditor}
          onSaveUrl={url => patchSettings({ videoFormUrl: url })}
        />
        <RequestCard
          icon="🎨"
          title="Design Request"
          subtitle="Submit a new design or creative brief to the studio"
          url={settings.designFormUrl}
          isEditor={isEditor}
          onSaveUrl={url => patchSettings({ designFormUrl: url })}
        />
      </div>

      {/* Studio Overview */}
      <div className="brand-card">
        {/* Toolbar */}
        <div className="flex items-center gap-3 mb-4 flex-wrap">
          <div className="text-sm font-bold" style={{ color: 'var(--brand-primary)' }}>
            Studio Overview
          </div>

          {/* Size presets (shown when iframe embed is active) */}
          {settings.embedUrl && (
            <div className="flex gap-1 bg-gray-100 rounded-xl p-1 ml-2">
              {SIZE_PRESETS.map(p => (
                <button
                  key={p.id}
                  onClick={() => setSizeId(p.id)}
                  className={clsx(
                    'px-2.5 py-1 rounded-lg text-xs font-semibold transition-all',
                    sizeId === p.id ? 'bg-white shadow text-gray-800' : 'text-gray-500 hover:text-gray-700'
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>
          )}

          {/* Action buttons */}
          <div className="ml-auto flex items-center gap-2">
            {!settings.embedUrl && (
              <button
                onClick={loadBoards}
                disabled={boardsLoading}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-gray-200 bg-white text-gray-600 hover:border-gray-300 transition-all"
              >
                <RefreshCw size={12} className={boardsLoading ? 'animate-spin' : ''} /> Refresh
              </button>
            )}
            {settings.embedUrl && (
              <a
                href={settings.embedUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-gray-200 bg-white text-gray-600 hover:border-gray-300 transition-all"
              >
                <ExternalLink size={12} /> Open
              </a>
            )}
            {isEditor && !editingEmbed && (
              <button
                onClick={() => { setEmbedDraft(settings.embedUrl); setEditingEmbed(true); }}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs border border-gray-200 bg-white text-gray-400 hover:text-gray-600 transition-all"
                title="Edit embed URL"
              >
                <Pencil size={12} />
              </button>
            )}
          </div>
        </div>

        {/* Embed URL editor */}
        {editingEmbed && (
          <div className="flex items-center gap-2 mb-4">
            <input
              className="brand-input flex-1 text-sm"
              value={embedDraft}
              onChange={e => setEmbedDraft(e.target.value)}
              placeholder="Paste embed URL (Monday, Notion, Airtable, Google Sheets...) or leave empty for API dashboard"
              autoFocus
              onKeyDown={e => {
                if (e.key === 'Enter') handleEmbedSave();
                if (e.key === 'Escape') setEditingEmbed(false);
              }}
            />
            <button onClick={() => setEditingEmbed(false)} className="p-2 rounded hover:bg-gray-100 text-gray-400">
              <X size={14} />
            </button>
            <button onClick={handleEmbedSave} className="btn-cta text-xs px-3 py-2">Save</button>
          </div>
        )}

        {/* Iframe fallback — show if admin has set a valid embed URL */}
        {settings.embedUrl ? (
          <>
            <div className="flex items-center gap-2 mb-3">
              <a
                href={settings.embedUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[11px] text-gray-400 hover:text-blue-500 underline"
              >
                Test embed URL in new tab
              </a>
              <span className="text-[10px] text-gray-300">If iframe is blank, the URL may need refreshing from Monday.com</span>
            </div>
            <div style={{ position: 'relative' }}>
              <iframe
                key={iframeKey.current}
                src={settings.embedUrl}
                title="Studio Overview"
                style={{ width: '100%', height: iframeHeight, border: 'none', borderRadius: 8 }}
                allowFullScreen
                onError={() => console.warn('Studio embed iframe failed to load')}
              />
            </div>
          </>
        ) : (
          /* Native API-powered Monday.com dashboard */
          <MondayBoardsDashboard
            boards={activeBoards}
            totalItems={totalItems}
            loading={boardsLoading}
            error={boardsError}
            onRetry={loadBoards}
            isEditor={isEditor}
            onSetEmbed={() => { setEmbedDraft(''); setEditingEmbed(true); }}
          />
        )}
      </div>
    </div>
  );
}

/* ─── Monday.com Native Dashboard ─────────────────────── */
function MondayBoardsDashboard({ boards, totalItems, loading, error, onRetry, isEditor, onSetEmbed }) {
  if (loading && boards.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-gray-400">
        <Loader2 size={28} className="animate-spin mb-3 opacity-60" />
        <div className="text-sm">Loading Monday.com boards...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-gray-400">
        <div className="text-sm text-red-400 mb-2">Failed to load boards</div>
        <div className="text-xs text-gray-400 mb-4">{error}</div>
        <button onClick={onRetry} className="btn-cta text-xs px-4 py-2">Retry</button>
      </div>
    );
  }

  if (boards.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-gray-400">
        <LayoutGrid size={28} className="mb-3 opacity-40" />
        <div className="text-sm mb-1">No Monday.com boards found</div>
        <div className="text-xs text-gray-300 mb-4">
          Make sure MONDAY_API_TOKEN is configured on the server
        </div>
        {isEditor && (
          <button onClick={onSetEmbed} className="flex items-center gap-1 text-xs text-blue-500 hover:underline">
            <Pencil size={12} /> Or set an embed URL instead
          </button>
        )}
      </div>
    );
  }

  return (
    <div>
      {/* Summary bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        <SummaryCard label="Active Boards" value={boards.length} />
        <SummaryCard label="Total Items" value={totalItems} />
        <SummaryCard
          label="Main Boards"
          value={boards.filter(b => b.board_kind === 'public').length}
        />
        <SummaryCard
          label="Private Boards"
          value={boards.filter(b => b.board_kind === 'private').length}
        />
      </div>

      {/* Board cards grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {boards.map((board, idx) => (
          <BoardCard key={board.id} board={board} colorIndex={idx} />
        ))}
      </div>
    </div>
  );
}

function SummaryCard({ label, value }) {
  return (
    <div className="bg-gray-50 rounded-xl p-3 text-center">
      <div className="text-2xl font-black" style={{ color: 'var(--brand-primary)' }}>
        {typeof value === 'number' ? value.toLocaleString() : value}
      </div>
      <div className="text-[11px] text-gray-400 font-semibold mt-0.5">{label}</div>
    </div>
  );
}

function BoardCard({ board, colorIndex }) {
  const gradient = BOARD_COLORS[colorIndex % BOARD_COLORS.length];
  const mondayUrl = `https://monday.com/boards/${board.id}`;

  return (
    <a
      href={mondayUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="group block rounded-xl border border-gray-100 hover:border-gray-200 hover:shadow-md transition-all overflow-hidden"
    >
      {/* Color strip */}
      <div className="h-1.5" style={{ background: gradient }} />

      <div className="p-4">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="font-bold text-sm text-gray-800 group-hover:text-gray-900 leading-tight line-clamp-2">
            {board.name}
          </div>
          <ExternalLink size={12} className="text-gray-300 group-hover:text-gray-500 shrink-0 mt-0.5" />
        </div>

        {board.description && (
          <div className="text-[11px] text-gray-400 mb-3 line-clamp-2 leading-relaxed">
            {board.description}
          </div>
        )}

        <div className="flex items-center gap-3 text-[11px]">
          <span className="font-semibold text-gray-600">
            {(board.items_count || 0).toLocaleString()} items
          </span>
          <span className={clsx(
            'px-2 py-0.5 rounded-full font-semibold',
            board.board_kind === 'public'
              ? 'bg-blue-50 text-blue-600'
              : board.board_kind === 'private'
              ? 'bg-purple-50 text-purple-600'
              : 'bg-gray-100 text-gray-500'
          )}>
            {board.board_kind === 'public' ? 'Main' : board.board_kind === 'private' ? 'Private' : board.board_kind}
          </span>
        </div>
      </div>
    </a>
  );
}

/* ─── Request Card (unchanged) ────────────────────────── */
function RequestCard({ icon, title, subtitle, url, isEditor, onSaveUrl }) {
  const [editingUrl, setEditingUrl] = useState(false);
  const [draft, setDraft] = useState('');

  function handleSave() {
    onSaveUrl(draft);
    setEditingUrl(false);
  }

  return (
    <div className="brand-card">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="text-4xl">{icon}</div>
        {isEditor && (
          <button
            onClick={() => { setDraft(url || ''); setEditingUrl(v => !v); }}
            className={clsx(
              'p-1.5 rounded-lg border text-gray-400 hover:text-gray-600 transition-all',
              editingUrl ? 'bg-blue-50 border-blue-200 text-blue-600' : 'border-gray-200 hover:border-gray-300'
            )}
            title="Edit URL"
          >
            <Pencil size={12} />
          </button>
        )}
      </div>
      <div className="font-black text-lg mb-1" style={{ color: 'var(--brand-primary)' }}>{title}</div>
      <div className="text-xs text-gray-400 mb-4 leading-relaxed">{subtitle}</div>

      {editingUrl ? (
        <div className="space-y-2">
          <input
            className="brand-input text-sm"
            value={draft}
            onChange={e => setDraft(e.target.value)}
            placeholder="https://forms.example.com/..."
            autoFocus
            onKeyDown={e => {
              if (e.key === 'Enter') handleSave();
              if (e.key === 'Escape') setEditingUrl(false);
            }}
          />
          <div className="flex gap-2">
            <button onClick={() => setEditingUrl(false)} className="btn-secondary flex-1 text-xs py-1.5">Cancel</button>
            <button onClick={handleSave} className="btn-cta flex-1 text-xs py-1.5">Save</button>
          </div>
        </div>
      ) : url ? (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl font-semibold text-sm btn-cta"
        >
          Open Form <ExternalLink size={13} />
        </a>
      ) : (
        <div className="text-xs text-gray-300 text-center py-2">
          {isEditor ? 'Click pencil to add a form URL' : 'No form URL set.'}
        </div>
      )}
    </div>
  );
}
