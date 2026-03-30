import { useState, useEffect, useRef } from 'react';
import { X, FileText, Sparkles, Upload, Loader2, ArrowLeft, Link, Package } from 'lucide-react';
import clsx from 'clsx';

const API = import.meta.env.VITE_API_URL || '';
function jwt() { return localStorage.getItem('cp_auth_token'); }

const TONES = ['Cinematic', 'Energetic', 'Emotional', 'Humorous', 'Dramatic', 'Corporate', 'Minimalist'];
const DURATIONS = ['15s', '30s', '45s', '60s', '90s', '2min'];
const SCENE_COUNTS = ['3', '4', '5', '6', '8', '10'];

const STATUS_MSGS = [
  'Reading your brief...',
  'Crafting scenes...',
  'Building the storyboard...',
  'Adding visual details...',
  'Polishing the script...',
];

export default function NewScriptModal({ defaultProductionId, defaultBrandId, onCreated, onClose }) {
  const [step, setStep] = useState(1);
  const [productions, setProductions] = useState([]);
  const [productionId, setProductionId] = useState(defaultProductionId || '');
  const [title, setTitle] = useState('');
  const [commercialTarget, setCommercialTarget] = useState('30');
  const [method, setMethod] = useState(null);

  // AI state
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiProduct, setAiProduct] = useState('');
  const [aiReferenceUrl, setAiReferenceUrl] = useState('');
  const [aiReferenceFetching, setAiReferenceFetching] = useState(false);
  const [tone, setTone] = useState('Cinematic');
  const [duration, setDuration] = useState('30s');
  const [sceneCount, setSceneCount] = useState('4');
  const [aiStatus, setAiStatus] = useState('idle');
  const [aiScenes, setAiScenes] = useState([]);
  const [aiError, setAiError] = useState('');
  const [statusMsg, setStatusMsg] = useState('');

  // Import state
  const [importUrl, setImportUrl] = useState('');
  const [importFile, setImportFile] = useState(null);
  const [importStatus, setImportStatus] = useState('idle');
  const [importScenes, setImportScenes] = useState([]);
  const [importError, setImportError] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef();
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API}/api/productions`, { headers: { Authorization: `Bearer ${jwt()}` } });
        const data = await res.json();
        setProductions(Array.isArray(data) ? data : []);
      } catch (e) {}
    })();
  }, []);

  function getBrandId() {
    if (defaultBrandId) return defaultBrandId;
    const prod = productions.find(p => p.id === productionId);
    return prod?.brand_id || '';
  }

  async function handleCreate(scenesOverride) {
    setCreating(true);
    try {
      const res = await fetch(`${API}/api/scripts`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${jwt()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title || 'Untitled Script',
          production_id: productionId || null,
          brand_id: getBrandId(),
          scenes: scenesOverride || [],
        }),
      });
      const script = await res.json();
      if (script.id) {
        if (commercialTarget !== 'other') {
          localStorage.setItem(`script_target_${script.id}`, commercialTarget);
        }
        onCreated(script);
      }
    } catch (e) {
      console.error(e);
      setCreating(false);
    }
  }

  async function handleAiGenerate() {
    setAiStatus('generating');
    setAiError('');
    let mi = 0;
    setStatusMsg(STATUS_MSGS[0]);
    const interval = setInterval(() => {
      mi = (mi + 1) % STATUS_MSGS.length;
      setStatusMsg(STATUS_MSGS[mi]);
    }, 2200);
    try {
      const res = await fetch(`${API}/api/scripts/temp/ai-generate`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${jwt()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'generate',
          prompt: `${aiPrompt}\n\nTone: ${tone}. Duration: ${duration}. Number of scenes: ${sceneCount}.`,
          product: aiProduct.trim() || undefined,
          reference_url: aiReferenceUrl.trim() || undefined,
        }),
      });
      clearInterval(interval);
      const data = await res.json();
      if (data.scenes && Array.isArray(data.scenes)) {
        setAiScenes(data.scenes);
        setAiStatus('preview');
      } else {
        setAiError(data.error || 'Generation failed. Please try again.');
        setAiStatus('error');
      }
    } catch (e) {
      clearInterval(interval);
      setAiError('Network error. Please try again.');
      setAiStatus('error');
    }
  }

  async function handleImportExtract() {
    setImportStatus('extracting');
    setImportError('');
    try {
      let res;
      if (importFile) {
        const base64 = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = e => resolve(e.target.result.split(',')[1]);
          reader.onerror = reject;
          reader.readAsDataURL(importFile);
        });
        res = await fetch(`${API}/api/scripts/import`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${jwt()}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileBase64: base64, fileName: importFile.name, mimeType: importFile.type }),
        });
      } else if (importUrl.trim()) {
        res = await fetch(`${API}/api/scripts/import`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${jwt()}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: importUrl }),
        });
      } else return;
      const data = await res.json();
      if (data.scenes && Array.isArray(data.scenes)) {
        setImportScenes(data.scenes);
        setImportStatus('preview');
      } else {
        setImportError(data.error || 'Could not extract scenes. Please try again.');
        setImportStatus('error');
      }
    } catch (e) {
      setImportError('Network error. Please try again.');
      setImportStatus('error');
    }
  }

  const canStep1 = title.trim().length > 0;

  // Chips component
  function ChipRow({ label, options, value, onChange }) {
    return (
      <div>
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">{label}</p>
        <div className="flex flex-wrap gap-1.5">
          {options.map(opt => (
            <button
              key={opt}
              type="button"
              onClick={() => onChange(opt)}
              className={clsx(
                'px-3 py-1.5 rounded-full text-xs font-semibold border transition-all',
                value === opt
                  ? 'bg-indigo-600 border-indigo-600 text-white shadow-sm'
                  : 'border-gray-200 text-gray-600 hover:border-indigo-300 hover:text-indigo-600'
              )}
            >
              {opt}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4">
      <div className="bg-white w-full sm:max-w-lg sm:rounded-3xl rounded-t-3xl shadow-2xl max-h-[92vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white/95 backdrop-blur-sm z-10 px-6 pt-5 pb-3 flex items-center justify-between border-b border-gray-100">
          <div className="flex items-center gap-3">
            {step > 1 && (
              <button
                onClick={() => { setStep(s => s - 1); setMethod(null); setAiStatus('idle'); setImportStatus('idle'); }}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200 transition-colors"
              >
                <ArrowLeft size={15} />
              </button>
            )}
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-indigo-500">
                {step === 1 ? 'New Script' : step === 2 ? 'Choose method' : method === 'ai' ? 'AI Generate' : 'Import'}
              </p>
              <h2 className="text-base font-black text-gray-900 leading-tight">
                {step === 1 ? (title.trim() || 'Create a Script') :
                 step === 2 ? 'How do you want to start?' :
                 method === 'ai' ? 'Describe your script' : 'Import from file or link'}
              </h2>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200 transition-colors">
            <X size={15} />
          </button>
        </div>

        {/* Step indicators */}
        <div className="flex items-center gap-1.5 px-6 pt-3 pb-1">
          {[1, 2, 3].map(s => (
            <div key={s} className={clsx('h-1 rounded-full transition-all', s === step ? 'bg-indigo-600 flex-[2]' : s < step ? 'bg-indigo-200 flex-1' : 'bg-gray-100 flex-1')} />
          ))}
        </div>

        <div className="px-6 py-5">

          {/* ── STEP 1 ── */}
          {step === 1 && (
            <div className="space-y-5">
              {/* Script name — hero input */}
              <div>
                <input
                  autoFocus
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && canStep1) setStep(2); }}
                  placeholder="Script name..."
                  className="w-full text-2xl font-bold text-gray-900 placeholder-gray-200 border-0 border-b-2 border-gray-100 focus:border-indigo-400 outline-none pb-3 bg-transparent transition-colors"
                />
              </div>

              {/* Commercial length */}
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Commercial length</p>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { val: '30', label: ':30s', sub: '30 second' },
                    { val: '60', label: ':60s', sub: '60 second' },
                    { val: 'other', label: 'Other', sub: 'Custom' },
                  ].map(opt => (
                    <button
                      key={opt.val}
                      type="button"
                      onClick={() => setCommercialTarget(opt.val)}
                      className={clsx(
                        'py-3 px-2 rounded-2xl border-2 text-center transition-all',
                        commercialTarget === opt.val
                          ? 'border-indigo-500 bg-indigo-50'
                          : 'border-gray-100 hover:border-gray-200 bg-gray-50'
                      )}
                    >
                      <div className={clsx('text-lg font-black', commercialTarget === opt.val ? 'text-indigo-700' : 'text-gray-700')}>{opt.label}</div>
                      <div className={clsx('text-[10px]', commercialTarget === opt.val ? 'text-indigo-500' : 'text-gray-400')}>{opt.sub}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Production — optional, compact */}
              <div>
                <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-1 mb-2">
                  Production
                  <span className="normal-case font-normal text-gray-300">(optional)</span>
                </label>
                <select
                  value={productionId}
                  onChange={e => setProductionId(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-700 bg-white outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400"
                >
                  <option value="">No production</option>
                  {productions.map(p => (
                    <option key={p.id} value={p.id}>{p.project_name || p.name || p.title}</option>
                  ))}
                </select>
              </div>

              <button
                onClick={() => setStep(2)}
                disabled={!canStep1}
                className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-30 disabled:cursor-not-allowed text-white font-bold rounded-2xl transition-all text-sm"
              >
                Continue →
              </button>
            </div>
          )}

          {/* ── STEP 2 ── */}
          {step === 2 && (
            <div className="space-y-3">
              {[
                {
                  key: 'empty',
                  icon: FileText,
                  iconBg: 'bg-gray-100',
                  iconColor: 'text-gray-500',
                  borderColor: 'border-l-gray-300',
                  title: 'Start Empty',
                  desc: 'Open a blank storyboard and fill it yourself',
                },
                {
                  key: 'ai',
                  icon: Sparkles,
                  iconBg: 'bg-indigo-100',
                  iconColor: 'text-indigo-600',
                  borderColor: 'border-l-indigo-500',
                  title: 'AI Generate',
                  desc: 'Describe your spot — Claude builds the full storyboard',
                  highlight: true,
                },
                {
                  key: 'import',
                  icon: Upload,
                  iconBg: 'bg-emerald-100',
                  iconColor: 'text-emerald-600',
                  borderColor: 'border-l-emerald-500',
                  title: 'Import',
                  desc: 'From PDF, Word, Google Docs, or Slides',
                },
              ].map(card => {
                const Icon = card.icon;
                return (
                  <button
                    key={card.key}
                    onClick={() => {
                      if (card.key === 'empty') {
                        handleCreate([]);
                      } else {
                        setMethod(card.key);
                        setStep(3);
                      }
                    }}
                    disabled={creating}
                    className={clsx(
                      'w-full text-left flex items-center gap-4 p-4 rounded-2xl border border-gray-100 border-l-4 transition-all hover:shadow-md hover:-translate-y-0.5',
                      card.borderColor,
                      card.highlight ? 'bg-indigo-50/50' : 'bg-white hover:bg-gray-50'
                    )}
                  >
                    <div className={clsx('w-10 h-10 rounded-xl flex items-center justify-center shrink-0', card.iconBg)}>
                      <Icon size={20} className={card.iconColor} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className={clsx('font-bold text-sm', card.highlight ? 'text-indigo-800' : 'text-gray-800')}>{card.title}</div>
                      <div className="text-xs text-gray-500 mt-0.5 leading-relaxed">{card.desc}</div>
                    </div>
                    <div className="text-gray-300 text-lg">›</div>
                  </button>
                );
              })}
            </div>
          )}

          {/* ── STEP 3A: AI ── */}
          {step === 3 && method === 'ai' && (
            <div className="space-y-5">
              {aiStatus === 'generating' && (
                <div className="flex flex-col items-center justify-center py-16 gap-5">
                  <div className="flex gap-2">
                    {[0, 1, 2].map(i => (
                      <div key={i} className="w-2.5 h-2.5 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
                    ))}
                  </div>
                  <p className="text-sm text-gray-500 font-medium">{statusMsg}</p>
                </div>
              )}
              {aiStatus === 'preview' && (
                <div>
                  <p className="text-sm font-semibold text-gray-700 mb-3">{aiScenes.length} scenes — looks good?</p>
                  <div className="space-y-2 max-h-52 overflow-y-auto mb-4 pr-1">
                    {aiScenes.map((s, i) => (
                      <div key={s.id || i} className="bg-gray-50 rounded-xl p-3 text-xs">
                        <div className="font-mono text-gray-400 mb-1">{i + 1}. {s.location || 'Location TBD'}</div>
                        {s.what_we_see && <p className="text-gray-700 line-clamp-1"><span className="font-semibold">See:</span> {s.what_we_see}</p>}
                        {s.what_we_hear && <p className="text-indigo-600 italic line-clamp-1"><span className="font-semibold not-italic text-indigo-700">Hear:</span> {s.what_we_hear}</p>}
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => handleCreate(aiScenes)} disabled={creating} className="flex-1 py-3 bg-indigo-600 text-white rounded-2xl text-sm font-bold hover:bg-indigo-700 disabled:opacity-50">
                      {creating ? 'Creating...' : 'Use These Scenes →'}
                    </button>
                    <button onClick={() => setAiStatus('idle')} className="py-3 px-4 border border-gray-200 rounded-2xl text-sm text-gray-600 hover:bg-gray-50">Redo</button>
                  </div>
                </div>
              )}
              {(aiStatus === 'idle' || aiStatus === 'error') && (
                <>
                  {/* Product + Reference — context inputs */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 mb-1.5">
                        <Package size={11} /> Product
                        <span className="font-normal text-gray-300">optional</span>
                      </label>
                      <input
                        value={aiProduct}
                        onChange={e => setAiProduct(e.target.value)}
                        placeholder="e.g. Nike Air Max, iPhone 15..."
                        className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-300 placeholder-gray-300"
                      />
                    </div>
                    <div>
                      <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 mb-1.5">
                        <Link size={11} /> Reference link
                        <span className="font-normal text-gray-300">optional</span>
                      </label>
                      <div className="relative">
                        <input
                          value={aiReferenceUrl}
                          onChange={e => setAiReferenceUrl(e.target.value)}
                          placeholder="Script guidelines, past scripts..."
                          className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-300 placeholder-gray-300 pr-8"
                        />
                        {aiReferenceUrl.trim() && (
                          <button onClick={() => setAiReferenceUrl('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500">
                            <X size={12} />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Brief */}
                  <div>
                    <label className="text-xs font-semibold text-gray-500 mb-1.5 block">Script brief</label>
                    <textarea
                      value={aiPrompt}
                      onChange={e => setAiPrompt(e.target.value)}
                      placeholder="Describe your spot... e.g. '30-second Nike ad for Instagram. Athlete running at dawn. Voiceover on perseverance. Powerful and emotional.'"
                      rows={4}
                      className="w-full border border-gray-200 rounded-2xl p-4 text-sm text-gray-800 outline-none resize-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400 placeholder-gray-300 leading-relaxed"
                    />
                    {aiError && <p className="text-xs text-red-500 mt-1">{aiError}</p>}
                  </div>

                  <ChipRow label="Tone" options={TONES} value={tone} onChange={setTone} />
                  <ChipRow label="Duration" options={DURATIONS} value={duration} onChange={setDuration} />
                  <ChipRow label="Scenes" options={SCENE_COUNTS} value={sceneCount} onChange={setSceneCount} />
                  <button
                    onClick={handleAiGenerate}
                    disabled={!aiPrompt.trim()}
                    className="w-full py-3.5 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-2xl text-sm font-bold hover:from-indigo-700 hover:to-purple-700 disabled:opacity-40 transition-all flex items-center justify-center gap-2"
                  >
                    <Sparkles size={15} /> Generate Script
                  </button>
                </>
              )}
            </div>
          )}

          {/* ── STEP 3B: Import ── */}
          {step === 3 && method === 'import' && (
            <div className="space-y-4">
              {importStatus === 'extracting' && (
                <div className="flex flex-col items-center py-16 gap-4">
                  <div className="flex gap-2">
                    {[0, 1, 2].map(i => (
                      <div key={i} className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
                    ))}
                  </div>
                  <p className="text-sm text-gray-500">Extracting scenes from your file...</p>
                </div>
              )}
              {importStatus === 'preview' && (
                <div>
                  <p className="text-sm font-semibold text-gray-700 mb-3">{importScenes.length} scenes extracted</p>
                  <div className="space-y-2 max-h-52 overflow-y-auto mb-4">
                    {importScenes.map((s, i) => (
                      <div key={s.id || i} className="bg-gray-50 rounded-xl p-3 text-xs">
                        <div className="font-mono text-gray-400 mb-1">{i + 1}. {s.location || 'Scene'}</div>
                        {s.what_we_see && <p className="text-gray-700 line-clamp-1">{s.what_we_see}</p>}
                        {s.what_we_hear && <p className="text-indigo-600 italic line-clamp-1">{s.what_we_hear}</p>}
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => handleCreate(importScenes)} disabled={creating} className="flex-1 py-3 bg-emerald-600 text-white rounded-2xl text-sm font-bold hover:bg-emerald-700 disabled:opacity-50">
                      {creating ? 'Creating...' : 'Use These Scenes →'}
                    </button>
                    <button onClick={() => setImportStatus('idle')} className="py-3 px-4 border border-gray-200 rounded-2xl text-sm text-gray-600 hover:bg-gray-50">Back</button>
                  </div>
                </div>
              )}
              {(importStatus === 'idle' || importStatus === 'error') && (
                <>
                  {/* Drop zone */}
                  <div
                    onClick={() => fileRef.current?.click()}
                    onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={e => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files[0]) setImportFile(e.dataTransfer.files[0]); }}
                    className={clsx(
                      'border-2 rounded-2xl p-8 text-center cursor-pointer transition-all',
                      dragOver ? 'border-emerald-400 bg-emerald-50' : importFile ? 'border-emerald-300 bg-emerald-50/50' : 'border-dashed border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                    )}
                  >
                    <Upload size={24} className={clsx('mx-auto mb-2', importFile ? 'text-emerald-500' : 'text-gray-300')} />
                    <p className={clsx('text-sm font-semibold', importFile ? 'text-emerald-700' : 'text-gray-500')}>
                      {importFile ? importFile.name : 'Drop file or tap to upload'}
                    </p>
                    <p className="text-xs text-gray-400 mt-1">PDF · DOC · DOCX · PPT · PPTX</p>
                    <input ref={fileRef} type="file" accept=".pdf,.doc,.docx,.ppt,.pptx" className="hidden" onChange={e => setImportFile(e.target.files[0])} />
                  </div>

                  {/* URL input */}
                  <div className="flex items-center gap-3">
                    <div className="flex-1 h-px bg-gray-100" />
                    <span className="text-xs text-gray-400 shrink-0">or paste a link</span>
                    <div className="flex-1 h-px bg-gray-100" />
                  </div>
                  <input
                    value={importUrl}
                    onChange={e => setImportUrl(e.target.value)}
                    placeholder="https://docs.google.com/..."
                    className="w-full border border-gray-200 rounded-2xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-emerald-300 focus:border-emerald-400 placeholder-gray-300"
                  />
                  {importError && <p className="text-xs text-red-500">{importError}</p>}

                  <button
                    onClick={handleImportExtract}
                    disabled={!importFile && !importUrl.trim()}
                    className="w-full py-3.5 bg-emerald-600 text-white rounded-2xl text-sm font-bold hover:bg-emerald-700 disabled:opacity-40 transition-all"
                  >
                    Extract Script
                  </button>
                </>
              )}
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
