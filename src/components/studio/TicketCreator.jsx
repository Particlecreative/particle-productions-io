import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Send, Sparkles, Loader2, RotateCcw, CheckCircle2, ExternalLink, AlertTriangle, X, Film, PenTool, Plus, Paperclip, FileText, FileVideo, Image as ImageIcon, File as FileIcon, Link2, UploadCloud } from 'lucide-react';
import { studioApi } from '../../lib/studioService';
import { useAuth } from '../../context/AuthContext';

const STARTERS = [
  'Resize the Face Cream static to 9x16 and 4x5 for Meta, by Thursday',
  'New UGC edit for NeoRoot from the creator footage, 3 hooks, 9x16',
  'TV cutdown 15s from The Hunt, for next week',
  'Website hero banner for the Black Friday sale',
];

// Same as the server: "Product | Campaign | Platform | AI tool | Task name"
function itemName(f) {
  const ai = f.ai_assist && !/^(none|no|-)$/i.test(f.ai_assist) ? f.ai_assist : null;
  const platform = f.platform && !/^(other|-)$/i.test(f.platform) ? f.platform : null;
  return [f.product, f.campaign?.[0], platform, ai, f.task_name].filter(Boolean).join(' | ');
}

const READABLE = new Set(['image', 'pdf', 'docx', 'text']);
const guessKind = (f) => (f.type.startsWith('image/') ? 'image' : f.type === 'application/pdf' ? 'pdf' : f.type.startsWith('video/') ? 'video' : /\.docx$/i.test(f.name) ? 'docx' : f.type.startsWith('text/') ? 'text' : 'other');
const size = (n) => (n >= 1048576 ? `${Math.round(n / 104857.6) / 10} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const shortUrl = (u) => { try { const x = new URL(u); return `${x.hostname.replace(/^www\./, '')}${x.pathname.length > 1 ? `${x.pathname.slice(0, 18)}…` : ''}`; } catch { return u.slice(0, 30); } };

function Toggle({ on, disabled, onClick, icon: Icon, label, title }) {
  return (
    <button type="button" disabled={disabled} onClick={onClick} title={title}
      className={`inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-md border ${disabled ? 'opacity-35 border-gray-200 text-gray-400' : on ? 'bg-[#030b2e] border-[#030b2e] text-white' : 'border-gray-200 text-gray-500 hover:border-gray-400'}`}>
      <Icon size={10} /> {label}
    </button>
  );
}

/** A file in the composer: read it for the brief, attach it to the Monday ticket — or both. */
function FileChip({ f, onToggle, onRemove }) {
  const Icon = f.kind === 'pdf' || f.kind === 'docx' || f.kind === 'text' ? FileText : f.kind === 'video' ? FileVideo : f.kind === 'image' ? ImageIcon : FileIcon;
  return (
    <div className={`flex items-center gap-2 pl-1.5 pr-1 py-1.5 rounded-xl border text-xs max-w-[300px] ${f.error ? 'border-red-200 bg-red-50' : 'border-gray-200 bg-white'}`}>
      {f.preview ? <img src={f.preview} alt="" className="w-10 h-10 rounded-lg object-cover flex-none" />
        : <span className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center flex-none"><Icon size={17} className="text-gray-500" /></span>}
      <div className="min-w-0">
        <div className="truncate font-semibold text-gray-800" title={f.name}>{f.name}</div>
        {f.uploading ? <div className="text-gray-400 flex items-center gap-1 mt-0.5"><Loader2 size={10} className="animate-spin" /> Uploading · {size(f.size)}</div>
          : f.error ? <div className="text-red-600 truncate mt-0.5" title={f.error}>{f.error}</div>
            : (
              <div className="flex items-center gap-1 mt-1">
                <Toggle on={f.read && f.readable} disabled={!f.readable} onClick={() => onToggle('read')} icon={Sparkles} label="Read"
                  title={f.readable ? 'Use it to write the brief' : 'This kind of file can’t be read — it can only be attached'} />
                <Toggle on={f.attach} onClick={() => onToggle('attach')} icon={Paperclip} label="Attach" title="Attach it to the Monday ticket" />
                <span className="text-[10px] text-gray-400 ml-0.5">{size(f.size)}</span>
              </div>
            )}
      </div>
      <button type="button" onClick={onRemove} className="p-1 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100 self-start" title="Remove"><X size={13} /></button>
    </div>
  );
}

function Chips({ value, options, onChange, max, free }) {
  const [adding, setAdding] = useState(false);
  const rest = (options || []).filter(o => !value.includes(o));
  const addFree = (t) => { const v = t.trim(); if (v && !value.includes(v)) onChange([...value, v]); setAdding(false); };
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {value.map(v => (
        <span key={v} className="inline-flex items-center gap-1 text-xs font-semibold pl-2.5 pr-1.5 py-1 rounded-full bg-[#0808f8]/8 text-[#030b2e]">
          {v}<button type="button" onClick={() => onChange(value.filter(x => x !== v))} className="text-gray-400 hover:text-gray-700"><X size={12} /></button>
        </span>
      ))}
      {(!max || value.length < max) && (adding && free ? (
        <>
          <input autoFocus list="cp-free-options" placeholder="Type or pick…" onBlur={e => addFree(e.target.value)}
            onKeyDown={e => { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); addFree(e.currentTarget.value); } if (e.key === 'Escape') setAdding(false); }}
            className="text-xs px-2.5 py-1 rounded-full border border-gray-200 w-[200px] outline-none focus:border-[#4a55ff]" />
          <datalist id="cp-free-options">{rest.map(o => <option key={o} value={o} />)}</datalist>
        </>
      ) : adding ? (
        <select autoFocus value="" onBlur={() => setAdding(false)} onChange={(e) => { if (e.target.value) onChange([...value, e.target.value]); setAdding(false); }}
          className="text-xs px-2 py-1 rounded-full border border-gray-200 max-w-[200px]">
          <option value="">Choose…</option>
          {rest.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      ) : (
        <button type="button" onClick={() => setAdding(true)} className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full border border-dashed border-gray-300 text-gray-500 hover:border-[#0808f8] hover:text-[#0808f8]"><Plus size={12} /> Add</button>
      ))}
    </div>
  );
}

function Field({ f, value, onChange, missing }) {
  const base = `w-full text-sm px-3 py-2 rounded-xl border outline-none focus:border-[#4a55ff] ${missing ? 'border-amber-400 bg-amber-50/40' : 'border-gray-200 bg-white'}`;
  let input;
  if (f.type === 'status') {
    input = (
      <select value={value || ''} onChange={e => onChange(e.target.value)} className={base}>
        <option value="">—</option>
        {(f.options || []).map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    );
  } else if (f.type === 'dropdown' || f.type === 'people') {
    input = <Chips value={Array.isArray(value) ? value : []} options={f.options} onChange={onChange} free={f.free} />;
  } else if (f.type === 'long_text') {
    input = <textarea rows={['concept', 'script', 'supporting_text'].includes(f.key) ? 6 : 3} value={value || ''} onChange={e => onChange(e.target.value)} onKeyDown={e => e.stopPropagation()} className={`${base} leading-relaxed`} />;
  } else if (f.type === 'date') {
    input = <input type="date" value={value || ''} onChange={e => onChange(e.target.value)} className={base} />;
  } else if (f.type === 'number') {
    input = <input type="number" min={0} value={value || ''} onChange={e => onChange(e.target.value)} className={`${base} max-w-[140px]`} />;
  } else {
    input = <input value={value || ''} onChange={e => onChange(e.target.value)} onKeyDown={e => e.stopPropagation()} className={base} />;
  }
  return (
    <label className="block">
      <span className="block text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-1">{f.label}{f.required && <span className="text-red-500"> *</span>}</span>
      {input}
    </label>
  );
}

/** ChatGPT-style ticket creator: describe it, Claude fills the Monday form, you review and approve. */
export default function TicketCreator() {
  const { user } = useAuth();
  const [form, setForm] = useState(null);
  const [error, setError] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [board, setBoard] = useState('video');
  const [draft, setDraft] = useState(null);
  const [missing, setMissing] = useState([]);
  const [confirm, setConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [created, setCreated] = useState(null);
  const [files, setFiles] = useState([]); // { key, id, name, size, kind, readable, read, attach, uploading, error, preview }
  const [dragOver, setDragOver] = useState(false);
  const fileInput = useRef(null);
  const sentFiles = useRef(new Set());
  const scroller = useRef(null);

  useEffect(() => {
    studioApi.ticketForm().then(f => { setForm(f); setDraft(f.empty); }).catch(e => setError(e.message));
  }, []);
  useEffect(() => { scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' }); }, [messages, busy]);

  const def = form?.boards?.[board];
  const reset = () => {
    files.forEach(f => f.preview && URL.revokeObjectURL(f.preview));
    setFiles([]); sentFiles.current = new Set();
    setMessages([]); setDraft(form.empty); setMissing([]); setCreated(null); setInput(''); setBoard('video');
  };
  // Files: uploaded right away; by default read for the brief (when readable) and attached to the ticket
  const addFiles = (list) => {
    for (const file of Array.from(list || [])) {
      const key = `${Date.now()}-${Math.random()}`;
      const kind = guessKind(file);
      setFiles(fs => [...fs, { key, name: file.name || 'pasted-image.png', size: file.size, kind, readable: READABLE.has(kind), read: true, attach: true, uploading: true, preview: kind === 'image' ? URL.createObjectURL(file) : null }]);
      studioApi.uploadTicketFile(file)
        .then(r => setFiles(fs => fs.map(f => (f.key === key ? { ...f, ...r, uploading: false } : f))))
        .catch(e => setFiles(fs => fs.map(f => (f.key === key ? { ...f, uploading: false, error: e.message } : f))));
    }
  };
  const uploading = files.some(f => f.uploading);
  const send = async (text) => {
    const fresh = files.filter(f => f.id && !sentFiles.current.has(f.id));
    const content = (text ?? input).trim() || (fresh.length ? 'Here are the files — use them for the ticket.' : '');
    if (!content || busy || uploading) return;
    const next = [...messages, { role: 'user', content, files: fresh.map(f => f.name) }];
    setMessages(next); setInput(''); setBusy(true); setError(null);
    try {
      const r = await studioApi.draftTicket({ messages: next.map(({ role, content: c }) => ({ role, content: c })), draft, board, files: files.filter(f => f.id && f.read && f.readable).map(f => f.id) });
      fresh.forEach(f => sentFiles.current.add(f.id));
      setMessages(m => [...m, { role: 'assistant', content: r.reply, sources: r.sources }]);
      setBoard(r.board); setDraft(r.fields); setMissing(r.missing || []);
    } catch (e) {
      setMessages(m => [...m, { role: 'assistant', content: `Sorry — ${e.message}`, error: true }]);
    } finally { setBusy(false); }
  };
  const required = (def?.fields || []).filter(f => f.required);
  const stillMissing = required.filter(f => !(Array.isArray(draft?.[f.key]) ? draft[f.key].length : draft?.[f.key])).map(f => f.key);
  const submit = async () => {
    setSubmitting(true); setError(null);
    try {
      const r = await studioApi.submitTicket({ board, fields: draft, conversation: messages.map(({ role, content }) => ({ role, content })), files: files.filter(f => f.id && f.attach).map(f => f.id) });
      setCreated(r); setConfirm(false);
    } catch (e) { setError(e.message); setConfirm(false); } finally { setSubmitting(false); }
  };

  if (error && !form) return <div className="my-4 px-4 py-3 rounded-2xl bg-red-50 text-red-700 text-sm flex items-center gap-2"><AlertTriangle size={16} /> {error}</div>;
  if (!form || !draft) return <div className="py-24 text-center text-gray-400"><Loader2 className="animate-spin inline" /></div>;

  if (created) {
    return (
      <div className="max-w-xl mx-auto mt-10 bg-white rounded-3xl border border-gray-200 p-10 text-center">
        <CheckCircle2 size={44} className="mx-auto text-emerald-500" />
        <div className="text-xl font-bold text-[#030b2e] mt-3">Ticket created on {board === 'video' ? 'Video Projects' : 'Design Projects 2.0'}</div>
        <div className="text-sm text-gray-600 mt-1">{created.name}</div>
        <div className="text-xs text-gray-400 mt-1">In “Form Requests” · the brief is posted as an update{created.attached ? ` · ${created.attached} file${created.attached === 1 ? '' : 's'} attached` : ''}</div>
        {created.failed?.length > 0 && <div className="text-xs text-amber-700 mt-2">Couldn’t attach: {created.failed.join(', ')}</div>}
        <div className="flex justify-center gap-2 mt-6">
          {created.url && <a href={created.url} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold px-5 py-2.5 rounded-xl text-white flex items-center gap-1.5" style={{ background: '#0808f8' }}>Open in Monday <ExternalLink size={14} /></a>}
          <button type="button" onClick={reset} className="text-sm font-semibold px-5 py-2.5 rounded-xl border border-gray-200 hover:bg-gray-50">New ticket</button>
        </div>
      </div>
    );
  }

  return (
    <div className="grid lg:grid-cols-[minmax(0,1fr)_460px] gap-5 items-start">
      {/* Chat */}
      <div className="relative bg-white rounded-2xl border border-gray-200 flex flex-col" style={{ height: 'calc(100vh - 260px)', minHeight: 520 }}
        onDragOver={(e) => { if (e.dataTransfer?.types?.includes('Files')) { e.preventDefault(); setDragOver(true); } }}
        onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setDragOver(false); }}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); addFiles(e.dataTransfer.files); }}>
        {dragOver && (
          <div className="absolute inset-2 z-10 rounded-2xl border-2 border-dashed border-[#0808f8] bg-[#0808f8]/5 flex flex-col items-center justify-center text-[#0808f8] pointer-events-none">
            <UploadCloud size={30} /><div className="font-semibold mt-1">Drop files to add them</div><div className="text-xs opacity-70">I’ll read them for the brief and attach them to the ticket</div>
          </div>
        )}
        <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2">
          <Sparkles size={16} className="text-[#0808f8]" />
          <span className="text-sm font-bold text-[#030b2e]">Ticket assistant</span>
          <span className="text-xs text-gray-400">· describe the task, I’ll fill the Monday form</span>
          {messages.length > 0 && <button type="button" onClick={reset} className="ml-auto text-xs font-semibold text-gray-500 hover:text-gray-800 flex items-center gap-1"><RotateCcw size={12} /> Start over</button>}
        </div>
        <div ref={scroller} className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-3">
          {!messages.length && (
            <div className="m-auto max-w-lg text-center">
              <div className="text-2xl font-black text-[#030b2e] uppercase" style={{ fontFamily: '"Sofia Sans Extra Condensed", sans-serif' }}>What do you need made, {user?.name?.split(' ')[0] || 'there'}?</div>
              <p className="text-sm text-gray-500 mt-1">Write it like you’d tell the team. Paste links (Google Docs, Dropbox, references) and add files or screenshots — I’ll read them, pick the board, fill every field and ask only if something essential is missing.</p>
              <div className="flex flex-col gap-2 mt-5">
                {STARTERS.map(s => <button key={s} type="button" onClick={() => send(s)} className="text-left text-sm px-4 py-2.5 rounded-xl border border-gray-200 hover:border-[#0808f8] hover:bg-[#0808f8]/5 text-gray-700">{s}</button>)}
              </div>
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} className={`flex flex-col gap-1.5 max-w-[85%] ${m.role === 'user' ? 'self-end items-end' : 'self-start items-start'}`}>
              <div className={`text-sm leading-relaxed px-4 py-2.5 rounded-2xl whitespace-pre-wrap ${m.role === 'user' ? 'bg-[#030b2e] text-white rounded-br-md' : m.error ? 'bg-red-50 text-red-700 rounded-bl-md' : 'bg-gray-100 text-gray-900 rounded-bl-md'}`} dir="auto">
                {m.content}
                {m.files?.length > 0 && <div className="mt-1.5 text-[11px] opacity-70 flex items-center gap-1"><Paperclip size={11} /> {m.files.join(', ')}</div>}
              </div>
              {m.sources?.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {m.sources.map((s, j) => (
                    <span key={j} title={s.note || (s.type === 'link' ? s.url : s.name)}
                      className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full ${s.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                      {s.type === 'link' ? <Link2 size={10} /> : <Paperclip size={10} />}
                      {s.ok ? 'Read' : 'Couldn’t read'} · {s.type === 'link' ? (s.title || shortUrl(s.url)).slice(0, 40) : s.name}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
          {busy && <div className="self-start bg-gray-100 text-gray-500 text-sm px-4 py-2.5 rounded-2xl rounded-bl-md flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Writing the ticket…</div>}
        </div>
        {files.length > 0 && (
          <div className="px-3 pt-3 border-t border-gray-100 flex flex-wrap gap-2">
            {files.map(f => (
              <FileChip key={f.key} f={f}
                onToggle={(k) => setFiles(fs => fs.map(x => (x.key === f.key ? { ...x, [k]: !x[k] } : x)))}
                onRemove={() => { if (f.preview) URL.revokeObjectURL(f.preview); setFiles(fs => fs.filter(x => x.key !== f.key)); }} />
            ))}
          </div>
        )}
        <form className={`p-3 flex items-end gap-2 ${files.length ? '' : 'border-t border-gray-100'}`} onSubmit={(e) => { e.preventDefault(); send(); }}>
          <input ref={fileInput} type="file" multiple className="hidden" onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
          <button type="button" onClick={() => fileInput.current?.click()} title="Add files or images (or drop / paste them)"
            className="w-11 h-11 rounded-full border border-gray-200 text-gray-500 hover:text-[#0808f8] hover:border-[#0808f8] flex items-center justify-center flex-none"><Paperclip size={17} /></button>
          <textarea value={input} onChange={e => setInput(e.target.value)} rows={2} dir="auto"
            onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
            onPaste={(e) => { const pasted = Array.from(e.clipboardData?.files || []); if (pasted.length) { e.preventDefault(); addFiles(pasted); } }}
            placeholder={messages.length ? 'Reply, or tell me what to change…' : 'e.g. Gravité static for Meta, 3 versions, 1x1 + 4x5, Natalie, due Sunday — paste links or screenshots too'}
            className="flex-1 resize-none text-sm px-4 py-3 rounded-2xl border border-gray-200 outline-none focus:border-[#4a55ff]" />
          <button type="submit" disabled={busy || uploading || (!input.trim() && !files.some(f => f.id && !sentFiles.current.has(f.id)))} title={uploading ? 'Waiting for uploads…' : 'Send'}
            className="w-11 h-11 rounded-full text-white flex items-center justify-center disabled:opacity-40 flex-none" style={{ background: '#0808f8' }}>{uploading ? <Loader2 size={17} className="animate-spin" /> : <Send size={17} />}</button>
        </form>
      </div>

      {/* Form */}
      <div className="bg-white rounded-2xl border border-gray-200 flex flex-col" style={{ maxHeight: 'calc(100vh - 260px)', minHeight: 520 }}>
        <div className="px-5 py-3 border-b border-gray-100">
          <div className="flex p-1 rounded-xl bg-gray-100">
            {[['video', 'Video Projects', Film], ['design', 'Design Projects 2.0', PenTool]].map(([k, label, Icon]) => (
              <button key={k} type="button" onClick={() => setBoard(k)} className={`flex-1 flex items-center justify-center gap-1.5 text-xs font-semibold py-2 rounded-lg ${board === k ? 'bg-white shadow text-[#030b2e]' : 'text-gray-500'}`}><Icon size={13} /> {label}</button>
            ))}
          </div>
          {(draft.product || draft.task_name) && <div className="mt-3 text-xs text-gray-500">Monday name: <b className="text-gray-900">{itemName(draft) || '—'}</b></div>}
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-3.5">
          {def.fields.map(f => (
            <Field key={f.key} f={f} value={draft[f.key]} missing={missing.includes(f.key) && stillMissing.includes(f.key)}
              onChange={(v) => setDraft(d => ({ ...d, [f.key]: v }))} />
          ))}
          <div>
            <span className="block text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-1">Files for the ticket</span>
            {files.some(f => f.id && f.attach) ? (
              <div className="flex flex-wrap gap-1.5">
                {files.filter(f => f.id && f.attach).map(f => <span key={f.key} className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-gray-100 text-gray-700"><Paperclip size={11} /> {f.name}</span>)}
              </div>
            ) : <div className="text-xs text-gray-400">None — add files with <Paperclip size={11} className="inline" /> in the chat (or drop / paste them there).</div>}
          </div>
        </div>
        <div className="px-5 py-3 border-t border-gray-100 flex items-center gap-3">
          <span className="text-xs text-gray-500 flex-1">{stillMissing.length ? `Missing: ${stillMissing.map(k => def.fields.find(f => f.key === k)?.label).join(', ')}` : 'Ready — review and submit'}</span>
          <button type="button" disabled={!!stillMissing.length} onClick={() => setConfirm(true)}
            className="text-sm font-semibold px-5 py-2.5 rounded-xl text-white disabled:opacity-40" style={{ background: '#0808f8' }}>Submit to Monday</button>
        </div>
        {error && <div className="mx-5 mb-3 px-3 py-2 rounded-xl bg-red-50 text-red-700 text-xs">{error}</div>}
      </div>

      {form.recent?.length > 0 && (
        <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-200 px-5 py-3">
          <div className="text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-2">Recently created here</div>
          <div className="flex flex-col gap-1">
            {form.recent.map(t => (
              <a key={t.item_id} href={t.item_url || '#'} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-xs text-gray-700 hover:text-[#0808f8]">
                <span className="w-14 text-gray-400">{t.board === 'video' ? 'Video' : 'Design'}</span>
                <span className="truncate flex-1">{t.name}</span>
                <span className="text-gray-400">{t.created_by_name} · {new Date(t.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>
              </a>
            ))}
          </div>
        </div>
      )}

      {confirm && createPortal(
        <div className="fixed inset-0 z-[90] flex items-center justify-center p-4" style={{ background: 'rgba(3,11,46,.5)' }} onClick={() => !submitting && setConfirm(false)}>
          <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl p-6" onClick={e => e.stopPropagation()}>
            <div className="text-lg font-bold text-[#030b2e]">Create this ticket on Monday?</div>
            <div className="text-sm text-gray-500 mt-1">{board === 'video' ? 'Video Projects' : 'Design Projects 2.0'} → Form Requests</div>
            <div className="mt-4 rounded-xl bg-gray-50 p-4 text-sm flex flex-col gap-1.5 max-h-[50vh] overflow-y-auto">
              <div className="font-bold text-gray-900">{itemName(draft)}</div>
              {def.fields.filter(f => !['task_name'].includes(f.key)).map(f => {
                const v = draft[f.key];
                const txt = Array.isArray(v) ? v.join(', ') : v;
                return txt ? <div key={f.key} className="text-gray-700"><span className="text-gray-400">{f.label}:</span> <span className="whitespace-pre-wrap">{f.type === 'long_text' && txt.length > 220 ? `${txt.slice(0, 220)}…` : txt}</span></div> : null;
              })}
            </div>
            {files.some(f => f.id && f.attach) && (
              <div className="mt-3 text-xs text-gray-600 flex items-start gap-1.5"><Paperclip size={13} className="mt-0.5 flex-none" /> Attached to the brief: {files.filter(f => f.id && f.attach).map(f => f.name).join(', ')}</div>
            )}
            <div className="flex justify-end gap-2 mt-5">
              <button type="button" disabled={submitting} onClick={() => setConfirm(false)} className="text-sm font-semibold px-4 py-2.5 rounded-xl text-gray-600 hover:bg-gray-100">Keep editing</button>
              <button type="button" disabled={submitting} onClick={submit} className="text-sm font-semibold px-5 py-2.5 rounded-xl text-white flex items-center gap-2" style={{ background: '#0808f8' }}>
                {submitting && <Loader2 size={14} className="animate-spin" />} Yes, create it
              </button>
            </div>
          </div>
        </div>, document.body)}
    </div>
  );
}
