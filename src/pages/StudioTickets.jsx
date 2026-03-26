import { useState, useEffect, useRef } from 'react';
import { ExternalLink, Pencil, Check, X, Maximize2, Minimize2 } from 'lucide-react';
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
  embedUrl:      '', // Set via Settings — Monday.com embed URL goes here
};

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

export default function StudioTickets() {
  const { isEditor } = useAuth();
  const [settings, setSettings] = useState(loadSettings);
  const [sizeId, setSizeId] = useState('standard');
  const [editingEmbed, setEditingEmbed] = useState(false);
  const [embedDraft, setEmbedDraft] = useState('');
  const iframeKey = useRef(0);

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

      {/* Studio Overview / Iframe embed */}
      <div className="brand-card">
        {/* Iframe toolbar */}
        <div className="flex items-center gap-3 mb-4 flex-wrap">
          <div className="text-sm font-bold" style={{ color: 'var(--brand-primary)' }}>
            Studio Overview
          </div>

          {/* Size presets */}
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

          {/* Open + Edit buttons */}
          <div className="ml-auto flex items-center gap-2">
            {settings.embedUrl && (
              <a
                href={settings.embedUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-gray-200 bg-white text-gray-600 hover:border-gray-300 transition-all"
              >
                <ExternalLink size={12} /> Open ↗
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
              placeholder="Paste embed URL (Monday, Notion, Airtable, Google Sheets…)"
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

        {/* Test Embed button */}
        {settings.embedUrl && (
          <div className="flex items-center gap-2 mb-3">
            <a
              href={settings.embedUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[11px] text-gray-400 hover:text-blue-500 underline"
            >
              Test embed URL in new tab ↗
            </a>
            <span className="text-[10px] text-gray-300">If iframe is blank, the URL may need refreshing from Monday.com</span>
          </div>
        )}

        {/* Iframe */}
        {settings.embedUrl ? (
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
        ) : (
          <div
            style={{ height: iframeHeight }}
            className="flex flex-col items-center justify-center bg-gray-50 rounded-xl border-2 border-dashed border-gray-200 text-gray-400"
          >
            <Maximize2 size={28} className="mb-3 opacity-40" />
            <div className="text-sm">No embed URL set.</div>
            {isEditor && (
              <button
                onClick={() => { setEmbedDraft(''); setEditingEmbed(true); }}
                className="mt-3 flex items-center gap-1 text-xs text-blue-500 hover:underline"
              >
                <Pencil size={12} /> Add embed URL
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

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
            placeholder="https://forms.example.com/…"
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
          {isEditor ? 'Click ✏ to add a form URL' : 'No form URL set.'}
        </div>
      )}
    </div>
  );
}
