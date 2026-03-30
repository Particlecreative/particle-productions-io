import { useState, useEffect, useRef } from 'react';
import { X, FileText, Sparkles, Upload, ChevronRight, Loader2, Check, RefreshCw, ArrowLeft } from 'lucide-react';
import clsx from 'clsx';

const API = import.meta.env.VITE_API_URL || '';
function jwt() { return localStorage.getItem('cp_auth_token'); }

const TONES = ['Cinematic', 'Energetic', 'Emotional', 'Humorous', 'Dramatic', 'Corporate', 'Minimalist'];
const DURATIONS = ['15s', '30s', '45s', '60s', '90s', '2min', '3min', '5min+'];
const SCENE_COUNTS = ['3', '4', '5', '6', '8', '10', '12', '15'];

export default function NewScriptModal({ defaultProductionId, defaultBrandId, onCreated, onClose }) {
  const [step, setStep] = useState(1); // 1=setup, 2=method, 3a=ai, 3b=import
  const [productions, setProductions] = useState([]);
  const [productionId, setProductionId] = useState(defaultProductionId || '');
  const [title, setTitle] = useState('');
  const [method, setMethod] = useState(null); // 'empty' | 'ai' | 'import'

  // AI state
  const [aiPrompt, setAiPrompt] = useState('');
  const [tone, setTone] = useState('Cinematic');
  const [duration, setDuration] = useState('30s');
  const [sceneCount, setSceneCount] = useState('4');
  const [aiStatus, setAiStatus] = useState('idle'); // idle | generating | preview | error
  const [aiScenes, setAiScenes] = useState([]);
  const [aiError, setAiError] = useState('');
  const [statusMsg, setStatusMsg] = useState('');

  // Import state
  const [importUrl, setImportUrl] = useState('');
  const [importFile, setImportFile] = useState(null);
  const [importStatus, setImportStatus] = useState('idle'); // idle | extracting | preview | error
  const [importScenes, setImportScenes] = useState([]);
  const [importImagesFound, setImportImagesFound] = useState([]); // [{scene_order, descriptions:[]}]
  const [importError, setImportError] = useState('');
  const fileRef = useRef();

  // Creating state
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API}/api/productions`, {
          headers: { Authorization: `Bearer ${jwt()}` },
        });
        const data = await res.json();
        setProductions(Array.isArray(data) ? data : []);
      } catch (e) { console.error(e); }
    })();
  }, []);

  // Pick brand from selected production
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
      if (script.id) onCreated(script);
    } catch (e) {
      console.error(e);
      setCreating(false);
    }
  }

  async function handleAiGenerate() {
    setAiStatus('generating');
    setAiError('');
    const msgs = [
      'Crafting your scenes...',
      'Building the storyboard...',
      'Adding visual details...',
      'Polishing the script...',
    ];
    let mi = 0;
    setStatusMsg(msgs[0]);
    const interval = setInterval(() => {
      mi = (mi + 1) % msgs.length;
      setStatusMsg(msgs[mi]);
    }, 2000);

    try {
      const res = await fetch(`${API}/api/scripts/temp/ai-generate`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${jwt()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'generate',
          prompt: `${aiPrompt}\n\nTone: ${tone}. Duration: ${duration}. Number of scenes: ${sceneCount}.`,
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
    setImportImagesFound([]);
    try {
      let res;
      if (importFile) {
        // Convert file to base64 for Gemini/Claude
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
        setImportImagesFound(data.images_found || []);
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

  // ── Render ─────────────────────────────────────────────────────────────────

  const canProceedStep1 = title.trim().length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-100">
          <div className="flex items-center gap-3">
            {step > 1 && (
              <button
                onClick={() => { setStep(s => s - 1); setMethod(null); setAiStatus('idle'); setImportStatus('idle'); }}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <ArrowLeft size={18} />
              </button>
            )}
            <h2 className="text-lg font-bold text-gray-800">
              {step === 1 ? 'Create a New Script' :
               step === 2 ? 'How do you want to start?' :
               method === 'ai' ? 'AI Generate' : 'Import Script'}
            </h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="p-6">

          {/* ── STEP 1: Setup ─────────────────────────────── */}
          {step === 1 && (
            <div className="space-y-5">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Production</label>
                <select
                  value={productionId}
                  onChange={e => setProductionId(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-700 bg-white outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400"
                >
                  <option value="">No production (standalone)</option>
                  {productions.map(p => (
                    <option key={p.id} value={p.id}>{p.project_name || p.name || p.title}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Script Name</label>
                <input
                  autoFocus
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  placeholder="e.g. Nike Brand Campaign :30s"
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-800 outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400"
                  onKeyDown={e => { if (e.key === 'Enter' && canProceedStep1) setStep(2); }}
                />
              </div>

              <button
                onClick={() => setStep(2)}
                disabled={!canProceedStep1}
                className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold px-4 py-3 rounded-xl transition-colors"
              >
                Continue <ChevronRight size={16} />
              </button>
            </div>
          )}

          {/* ── STEP 2: Method picker ─────────────────────── */}
          {step === 2 && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {[
                {
                  key: 'empty',
                  icon: FileText,
                  title: 'Start Empty',
                  desc: 'Fill the table yourself',
                  color: 'border-gray-200 hover:border-gray-400',
                  iconColor: 'text-gray-500 bg-gray-100',
                },
                {
                  key: 'ai',
                  icon: Sparkles,
                  title: 'AI Generate',
                  desc: 'Describe your script, Claude builds it',
                  color: 'border-indigo-200 hover:border-indigo-400',
                  iconColor: 'text-indigo-600 bg-indigo-50',
                },
                {
                  key: 'import',
                  icon: Upload,
                  title: 'Import',
                  desc: 'PDF, Word, Google Doc, Google Slides',
                  color: 'border-emerald-200 hover:border-emerald-400',
                  iconColor: 'text-emerald-600 bg-emerald-50',
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
                      'flex flex-col items-center text-center p-5 rounded-2xl border-2 transition-all',
                      card.color,
                      'hover:shadow-md'
                    )}
                  >
                    <div className={clsx('w-12 h-12 rounded-xl flex items-center justify-center mb-3', card.iconColor)}>
                      <Icon size={22} />
                    </div>
                    <div className="font-bold text-gray-800 text-sm mb-1">{card.title}</div>
                    <div className="text-xs text-gray-500 leading-relaxed">{card.desc}</div>
                  </button>
                );
              })}
            </div>
          )}

          {/* ── STEP 3A: AI Generate ──────────────────────── */}
          {step === 3 && method === 'ai' && (
            <div className="space-y-5">
              {aiStatus === 'generating' ? (
                <div className="flex flex-col items-center justify-center py-16 gap-4">
                  <Loader2 size={40} className="text-indigo-500 animate-spin" />
                  <p className="text-sm text-gray-600 font-medium animate-pulse">{statusMsg}</p>
                  <div className="w-48 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-indigo-500 rounded-full animate-[loading_2s_ease-in-out_infinite]" style={{ width: '60%' }} />
                  </div>
                </div>
              ) : aiStatus === 'preview' ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                    <Check size={16} className="text-green-500" />
                    {aiScenes.length} scenes generated — review and accept
                  </div>
                  <div className="border border-gray-200 rounded-xl overflow-hidden max-h-64 overflow-y-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-gray-50 sticky top-0">
                        <tr>
                          <th className="px-3 py-2 text-left text-gray-500 font-semibold w-8">#</th>
                          <th className="px-3 py-2 text-left text-gray-500 font-semibold w-32">Location</th>
                          <th className="px-3 py-2 text-left text-gray-500 font-semibold">What We See</th>
                          <th className="px-3 py-2 text-left text-gray-500 font-semibold">What We Hear</th>
                        </tr>
                      </thead>
                      <tbody>
                        {aiScenes.map((s, i) => (
                          <tr key={s.id || i} className="border-t border-gray-100">
                            <td className="px-3 py-2 text-gray-400 font-bold">{i + 1}</td>
                            <td className="px-3 py-2 text-gray-600 font-mono">{s.location}</td>
                            <td className="px-3 py-2 text-gray-700">{s.what_we_see}</td>
                            <td className="px-3 py-2 text-indigo-700 italic">{s.what_we_hear}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex gap-3">
                    <button
                      onClick={() => { setAiStatus('idle'); }}
                      className="flex-1 flex items-center justify-center gap-2 border border-gray-200 hover:border-gray-300 text-gray-600 text-sm font-medium py-2.5 rounded-xl transition-colors"
                    >
                      <RefreshCw size={14} /> Regenerate
                    </button>
                    <button
                      onClick={() => handleCreate(aiScenes)}
                      disabled={creating}
                      className="flex-1 flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold py-2.5 rounded-xl transition-colors"
                    >
                      {creating ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                      Accept & Edit
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {aiStatus === 'error' && (
                    <div className="bg-red-50 text-red-700 text-sm px-4 py-3 rounded-xl">{aiError}</div>
                  )}
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Script Brief</label>
                    <textarea
                      autoFocus
                      value={aiPrompt}
                      onChange={e => setAiPrompt(e.target.value)}
                      placeholder="e.g. 30-second Nike ad for Instagram. 4 scenes. Energetic athlete footage. VO focused on 'just do it' theme. Target: men 18-35. High-energy music."
                      rows={4}
                      className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-700 outline-none focus:ring-2 focus:ring-indigo-300 resize-none"
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 mb-1.5">Tone</label>
                      <select
                        value={tone}
                        onChange={e => setTone(e.target.value)}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-indigo-300"
                      >
                        {TONES.map(t => <option key={t}>{t}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 mb-1.5">Duration</label>
                      <select
                        value={duration}
                        onChange={e => setDuration(e.target.value)}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-indigo-300"
                      >
                        {DURATIONS.map(d => <option key={d}>{d}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 mb-1.5">Scenes</label>
                      <select
                        value={sceneCount}
                        onChange={e => setSceneCount(e.target.value)}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-indigo-300"
                      >
                        {SCENE_COUNTS.map(n => <option key={n}>{n}</option>)}
                      </select>
                    </div>
                  </div>
                  <button
                    onClick={handleAiGenerate}
                    disabled={!aiPrompt.trim()}
                    className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold px-4 py-3 rounded-xl transition-colors"
                  >
                    <Sparkles size={16} /> Generate Script
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ── STEP 3B: Import ───────────────────────────── */}
          {step === 3 && method === 'import' && (
            <div className="space-y-5">
              {importStatus === 'extracting' ? (
                <div className="flex flex-col items-center justify-center py-16 gap-4">
                  <Loader2 size={40} className="text-emerald-500 animate-spin" />
                  <p className="text-sm text-gray-600 font-medium animate-pulse">Extracting script with AI...</p>
                </div>
              ) : importStatus === 'preview' ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                    <Check size={16} className="text-green-500" />
                    {importScenes.length} scenes extracted — review and accept
                  </div>
                  {/* Images found notice */}
                  {importImagesFound.length > 0 && (
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                      <p className="text-xs font-semibold text-amber-800 mb-1.5">📷 Images found in source</p>
                      <div className="space-y-1">
                        {importImagesFound.map((img, i) => (
                          <div key={i} className="text-xs text-amber-700">
                            <span className="font-medium">Scene {img.scene_order}:</span> {img.descriptions.join(', ')}
                          </div>
                        ))}
                      </div>
                      <p className="text-xs text-amber-600 mt-2">These images were described from the source. You can generate AI equivalents using ✨ AI Image on each scene row after importing.</p>
                    </div>
                  )}
                  <div className="border border-gray-200 rounded-xl overflow-hidden max-h-64 overflow-y-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-gray-50 sticky top-0">
                        <tr>
                          <th className="px-3 py-2 text-left text-gray-500 font-semibold w-8">#</th>
                          <th className="px-3 py-2 text-left text-gray-500 font-semibold w-32">Location</th>
                          <th className="px-3 py-2 text-left text-gray-500 font-semibold">What We See</th>
                          <th className="px-3 py-2 text-left text-gray-500 font-semibold">What We Hear</th>
                        </tr>
                      </thead>
                      <tbody>
                        {importScenes.map((s, i) => (
                          <tr key={s.id || i} className="border-t border-gray-100">
                            <td className="px-3 py-2 text-gray-400 font-bold">{i + 1}</td>
                            <td className="px-3 py-2 text-gray-600 font-mono">{s.location}</td>
                            <td className="px-3 py-2 text-gray-700">{s.what_we_see}</td>
                            <td className="px-3 py-2 text-indigo-700 italic">{s.what_we_hear}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex gap-3">
                    <button
                      onClick={() => { setImportStatus('idle'); setImportFile(null); setImportUrl(''); }}
                      className="flex-1 flex items-center justify-center gap-2 border border-gray-200 hover:border-gray-300 text-gray-600 text-sm font-medium py-2.5 rounded-xl transition-colors"
                    >
                      <RefreshCw size={14} /> Re-extract
                    </button>
                    <button
                      onClick={() => handleCreate(importScenes)}
                      disabled={creating}
                      className="flex-1 flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold py-2.5 rounded-xl transition-colors"
                    >
                      {creating ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                      Accept & Edit
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-5">
                  {importStatus === 'error' && (
                    <div className="bg-red-50 text-red-700 text-sm px-4 py-3 rounded-xl">{importError}</div>
                  )}

                  {/* File drop zone */}
                  <div>
                    <input
                      ref={fileRef}
                      type="file"
                      accept=".pdf,.doc,.docx,.ppt,.pptx"
                      className="hidden"
                      onChange={e => setImportFile(e.target.files[0] || null)}
                    />
                    <button
                      onClick={() => fileRef.current?.click()}
                      className={clsx(
                        'w-full border-2 border-dashed rounded-2xl p-8 text-center transition-colors',
                        importFile ? 'border-emerald-400 bg-emerald-50' : 'border-gray-200 hover:border-gray-300 bg-gray-50'
                      )}
                    >
                      {importFile ? (
                        <div className="flex flex-col items-center gap-2">
                          <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center">
                            <FileText size={20} className="text-emerald-600" />
                          </div>
                          <span className="text-sm font-medium text-emerald-700">{importFile.name}</span>
                          <span className="text-xs text-gray-400">Click to change</span>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center gap-2 text-gray-400">
                          <Upload size={28} className="opacity-50" />
                          <div className="text-sm font-medium text-gray-600">Drop file here or click to upload</div>
                          <div className="text-xs">PDF · DOC · DOCX · PPT · PPTX</div>
                        </div>
                      )}
                    </button>
                  </div>

                  {/* Or URL */}
                  <div className="relative">
                    <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 flex items-center">
                      <div className="flex-1 border-t border-gray-200" />
                      <span className="px-3 text-xs text-gray-400 bg-white">or paste a link</span>
                      <div className="flex-1 border-t border-gray-200" />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Google Docs / Slides URL</label>
                    <input
                      value={importUrl}
                      onChange={e => { setImportUrl(e.target.value); setImportFile(null); }}
                      placeholder="https://docs.google.com/..."
                      className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-700 outline-none focus:ring-2 focus:ring-emerald-300"
                    />
                  </div>

                  <button
                    onClick={handleImportExtract}
                    disabled={!importFile && !importUrl.trim()}
                    className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold px-4 py-3 rounded-xl transition-colors"
                  >
                    <ChevronRight size={16} /> Extract Script
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
