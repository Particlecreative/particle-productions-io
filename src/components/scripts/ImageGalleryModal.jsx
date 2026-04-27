import { useState, useEffect } from 'react';
import { X, Check, Film, Sparkles, Upload, Clock, Image as ImageIcon, ChevronDown, ChevronRight, Package, BookOpen } from 'lucide-react';

const API = import.meta.env.VITE_API_URL || '';
function jwt() { return localStorage.getItem('cp_auth_token'); }

/**
 * ImageGalleryModal — browse images from this script, blocks, other scripts + video frames.
 */
export default function ImageGalleryModal({ scriptId, scenes, targetSceneId, brandId, onClose, onSelect }) {
  const [tab, setTab] = useState('by-scene');
  const [selected, setSelected] = useState(null);
  const [videoFrames, setVideoFrames] = useState([]);
  const [collapsedScenes, setCollapsedScenes] = useState({});
  const [blockImages, setBlockImages] = useState([]); // images from saved blocks
  const [otherScriptImages, setOtherScriptImages] = useState([]); // images from other scripts
  const [otherScriptsLoading, setOtherScriptsLoading] = useState(false);
  const [otherScriptsError, setOtherScriptsError] = useState(false);
  const [otherScriptsLoaded, setOtherScriptsLoaded] = useState(false);
  const [blockFilter, setBlockFilter] = useState('');        // active category filter for blocks tab
  const [scriptFilter, setScriptFilter] = useState('');     // active production filter for other-scripts tab

  // Collect all images across scenes
  const allImages = [];
  const imagesByScene = {};
  scenes.forEach((s, i) => {
    const sceneImages = [];
    (s.images || []).forEach(img => {
      const enriched = {
        ...img,
        sceneId: s.id,
        sceneNumber: i + 1,
        sceneLocation: s.location,
        type: img.source === 'ai' ? 'ai' : img.source === 'video-extract' ? 'video' : 'upload',
      };
      allImages.push(enriched);
      sceneImages.push(enriched);
    });
    if (sceneImages.length > 0) {
      imagesByScene[s.id] = { sceneNumber: i + 1, location: s.location, images: sceneImages };
    }
  });

  const aiImages = allImages.filter(img => img.type === 'ai');
  const videoImages = allImages.filter(img => img.type === 'video');
  const uploadedImages = allImages.filter(img => img.type === 'upload' || img.type === 'paste');

  // Load video match results
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API}/api/scripts/${scriptId}/video-match/latest`, {
          headers: { Authorization: `Bearer ${jwt()}` },
        });
        if (res.ok) {
          const data = await res.json();
          if (data.match_results) {
            setVideoFrames(data.match_results.filter(m => m.frame_url));
          }
        }
      } catch {}
    })();
  }, [scriptId]);

  // Load images from saved blocks
  useEffect(() => {
    if (!brandId) return;
    (async () => {
      try {
        const res = await fetch(`${API}/api/scripts/blocks?brand_id=${brandId}`, {
          headers: { Authorization: `Bearer ${jwt()}` },
        });
        if (!res.ok) return;
        const data = await res.json();
        const imgs = [];
        (data.blocks || []).forEach(block => {
          (block.scenes || []).forEach(scene => {
            (scene.images || []).forEach(img => {
              if (img.url) imgs.push({
                ...img,
                id: img.id || `block-${block.id}-${imgs.length}`,
                sourceType: 'block',
                sourceLabel: block.name || 'Block',
                sourceCategory: block.category || '',
                type: img.source === 'ai' ? 'ai' : img.source === 'video-extract' ? 'video' : 'upload',
              });
            });
          });
        });
        setBlockImages(imgs);
      } catch {}
    })();
  }, [brandId]);

  // Load images from other scripts (lazy — only when tab is first opened)
  async function loadOtherScripts(force = false) {
    if ((otherScriptsLoaded || otherScriptsLoading) && !force) return;
    setOtherScriptsLoading(true);
    setOtherScriptsError(false);
    try {
      // include_scenes=true so the backend returns scenes+images, not just metadata
      const res = await fetch(`${API}/api/scripts?include_scenes=true`, {
        headers: { Authorization: `Bearer ${jwt()}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const scripts = Array.isArray(data) ? data : (data.scripts || []);
      const imgs = [];
      for (const s of scripts) {
        if (s.id === scriptId) continue; // skip current script
        (s.scenes || []).forEach(scene => {
          (scene.images || []).forEach(img => {
            if (img.url) imgs.push({
              ...img,
              id: img.id || `os-${s.id}-${imgs.length}`,
              sourceType: 'other-script',
              sourceLabel: s.title || 'Untitled Script',
              sourceScriptId: s.id,
              sourceProductionId: s.production_id || '',
              sourceProductionName: s.project_name || 'No Production',
              sourceProductionEnd: s.planned_end || '',
              type: img.source === 'ai' ? 'ai' : img.source === 'video-extract' ? 'video' : 'upload',
            });
          });
        });
      }
      setOtherScriptImages(imgs);
      setOtherScriptsLoaded(true);
    } catch {
      setOtherScriptsError(true);
    }
    setOtherScriptsLoading(false);
  }

  const tabs = [
    { key: 'by-scene', label: 'By Scene', count: allImages.length },
    { key: 'all', label: 'All', count: allImages.length },
    { key: 'ai', label: 'AI', count: aiImages.length, icon: Sparkles, color: 'text-purple-500' },
    { key: 'video', label: 'Video', count: videoImages.length + videoFrames.length, icon: Film, color: 'text-blue-500' },
    { key: 'uploaded', label: 'Uploaded', count: uploadedImages.length, icon: Upload, color: 'text-green-500' },
    { key: 'blocks', label: 'Blocks', count: blockImages.length, icon: Package, color: 'text-orange-500' },
    { key: 'other-scripts', label: 'Other Scripts', count: otherScriptImages.length, icon: BookOpen, color: 'text-teal-500' },
  ];

  const displayImages = tab === 'all' || tab === 'by-scene' ? allImages
    : tab === 'video' ? [...videoImages, ...videoFrames.map(f => ({ id: f.scene_id + '-vf', url: f.frame_url, prompt: f.description, type: 'video', timestamp: f.timestamp_sec }))]
    : tab === 'ai' ? aiImages
    : tab === 'blocks' ? blockImages
    : tab === 'other-scripts' ? otherScriptImages
    : uploadedImages;

  function toggleScene(sceneId) {
    setCollapsedScenes(prev => ({ ...prev, [sceneId]: !prev[sceneId] }));
  }

  function renderImageCard(img, i) {
    return (
      <button
        key={img.id || i}
        onClick={() => setSelected(img)}
        className={`relative aspect-video rounded-xl overflow-hidden border-2 transition-all group ${
          selected?.id === img.id ? 'border-purple-500 ring-2 ring-purple-200 scale-[1.02]' : 'border-transparent hover:border-gray-300'
        }`}
      >
        <img src={img.url} alt="" className="w-full h-full object-cover" loading="lazy" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end">
          <div className="w-full px-2 py-1.5">
            <div className="flex items-center gap-1">
              {img.type === 'ai' && <Sparkles size={9} className="text-purple-300" />}
              {img.type === 'video' && <Film size={9} className="text-blue-300" />}
              {(img.type === 'upload' || img.type === 'paste') && <Upload size={9} className="text-green-300" />}
              {img.sourceType === 'block' && <Package size={9} className="text-orange-300" />}
              {img.sourceType === 'other-script' && <BookOpen size={9} className="text-teal-300" />}
              <span className="text-[9px] text-white font-medium truncate">
                {img.sourceLabel || (img.sceneNumber ? `Scene ${img.sceneNumber}` : '')}
              </span>
              {img.timestamp !== undefined && (
                <span className="text-[8px] text-white/70 flex items-center gap-0.5 ml-auto"><Clock size={7} />{img.timestamp?.toFixed(1)}s</span>
              )}
            </div>
            {img.prompt && <p className="text-[8px] text-white/80 truncate mt-0.5">{img.prompt}</p>}
          </div>
        </div>
        {selected?.id === img.id && (
          <div className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-purple-500 flex items-center justify-center shadow-md">
            <Check size={12} className="text-white" />
          </div>
        )}
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 animate-fade-in" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="px-6 pt-5 pb-3 border-b border-gray-100 flex items-center justify-between shrink-0">
          <div>
            <h3 className="font-black text-gray-900 text-base flex items-center gap-2">
              <ImageIcon size={16} style={{ color: 'var(--brand-accent)' }} /> Image Library
            </h3>
            <p className="text-xs text-gray-400 mt-0.5">{allImages.length} images across {scenes.length} scenes</p>
          </div>
          <button onClick={onClose}><X size={18} className="text-gray-400" /></button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 px-6 py-2 border-b border-gray-50 shrink-0 overflow-x-auto">
          {tabs.map(t => {
            const Icon = t.icon;
            return (
              <button key={t.key} onClick={() => { setTab(t.key); if (t.key === 'other-scripts') loadOtherScripts(); }}
                className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-medium transition-colors whitespace-nowrap ${
                  tab === t.key ? 'bg-gray-100 text-gray-800 font-semibold' : 'text-gray-500 hover:text-gray-700'
                }`}>
                {Icon && <Icon size={11} className={tab === t.key ? t.color : 'text-gray-400'} />}
                {t.label} <span className="text-gray-400 text-[10px]">{t.count}</span>
              </button>
            );
          })}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {/* Other Scripts — loading / error / grouped */}
          {tab === 'other-scripts' && otherScriptsLoading ? (
            <div className="text-center py-16">
              <div className="animate-spin rounded-full h-8 w-8 border-2 border-gray-200 mx-auto mb-3" style={{ borderTopColor: 'var(--brand-accent)' }} />
              <p className="text-sm text-gray-400">Loading images from other scripts…</p>
            </div>
          ) : tab === 'other-scripts' && otherScriptsError ? (
            <div className="text-center py-16">
              <ImageIcon size={32} className="mx-auto mb-3 text-gray-200" />
              <p className="text-sm text-gray-500 font-medium mb-1">Couldn't load other scripts</p>
              <p className="text-xs text-gray-400 mb-4">Check your connection and try again</p>
              <button onClick={() => loadOtherScripts(true)}
                className="px-4 py-2 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50">
                Try Again
              </button>
            </div>
          ) : tab === 'other-scripts' ? (() => {
            // Group by production
            const productions = {};
            otherScriptImages.forEach(img => {
              const key = img.sourceProductionId || '__none__';
              if (!productions[key]) productions[key] = { name: img.sourceProductionName || 'No Production', imgs: [] };
              productions[key].imgs.push(img);
            });
            const prodKeys = Object.keys(productions).sort((a, b) => {
              const da = productions[a].imgs[0]?.sourceProductionEnd || '';
              const db2 = productions[b].imgs[0]?.sourceProductionEnd || '';
              return db2.localeCompare(da); // newest first
            });
            const uniqueProds = prodKeys.map(k => productions[k].name);
            const filteredProds = scriptFilter ? prodKeys.filter(k => productions[k].name === scriptFilter) : prodKeys;

            if (otherScriptImages.length === 0) return (
              <div className="text-center py-16">
                <BookOpen size={32} className="mx-auto mb-3 text-gray-200" />
                <p className="text-sm text-gray-400 font-medium">No images found in other scripts</p>
                <p className="text-xs text-gray-300 mt-1">Other scripts with generated or uploaded images will appear here</p>
              </div>
            );
            return (
              <div>
                {/* Production filter pills */}
                <div className="flex gap-1.5 flex-wrap mb-3">
                  <button onClick={() => setScriptFilter('')}
                    className={`text-[11px] px-2.5 py-1 rounded-full border font-medium transition-colors ${!scriptFilter ? 'bg-gray-800 text-white border-gray-800' : 'border-gray-200 text-gray-500 hover:border-gray-400'}`}>
                    All productions
                  </button>
                  {uniqueProds.map(name => (
                    <button key={name} onClick={() => setScriptFilter(name === scriptFilter ? '' : name)}
                      className={`text-[11px] px-2.5 py-1 rounded-full border font-medium transition-colors ${scriptFilter === name ? 'bg-gray-800 text-white border-gray-800' : 'border-gray-200 text-gray-500 hover:border-gray-400'}`}>
                      {name}
                    </button>
                  ))}
                </div>
                <div className="space-y-3">
                  {filteredProds.map(key => {
                    const prod = productions[key];
                    const isCollapsed = collapsedScenes[`prod-${key}`];
                    return (
                      <div key={key} className="rounded-xl border border-gray-100">
                        <button onClick={() => toggleScene(`prod-${key}`)}
                          className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-gray-50/50 rounded-t-xl transition-colors">
                          {isCollapsed ? <ChevronRight size={12} className="text-gray-400" /> : <ChevronDown size={12} className="text-gray-400" />}
                          <BookOpen size={11} className="text-teal-400 shrink-0" />
                          <span className="text-xs font-semibold text-gray-700 truncate">{prod.name}</span>
                          <span className="text-[10px] text-gray-400 ml-auto shrink-0">{prod.imgs.length} image{prod.imgs.length !== 1 ? 's' : ''}</span>
                        </button>
                        {!isCollapsed && (
                          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 px-3 pb-3">
                            {prod.imgs.map((img, i) => renderImageCard(img, i))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()

          /* Blocks — grouped by category */
          : tab === 'blocks' ? (() => {
            const categories = {};
            blockImages.forEach(img => {
              const cat = img.sourceCategory || 'General';
              if (!categories[cat]) categories[cat] = [];
              categories[cat].push(img);
            });
            const catKeys = Object.keys(categories).sort();
            const filteredCats = blockFilter ? catKeys.filter(c => c === blockFilter) : catKeys;

            if (blockImages.length === 0) return (
              <div className="text-center py-16">
                <Package size={32} className="mx-auto mb-3 text-gray-200" />
                <p className="text-sm text-gray-400 font-medium">No images in saved blocks</p>
                <p className="text-xs text-gray-300 mt-1">Save scenes as blocks to reuse them across scripts</p>
              </div>
            );
            return (
              <div>
                {catKeys.length > 1 && (
                  <div className="flex gap-1.5 flex-wrap mb-3">
                    <button onClick={() => setBlockFilter('')}
                      className={`text-[11px] px-2.5 py-1 rounded-full border font-medium transition-colors ${!blockFilter ? 'bg-orange-500 text-white border-orange-500' : 'border-gray-200 text-gray-500 hover:border-gray-400'}`}>
                      All
                    </button>
                    {catKeys.map(cat => (
                      <button key={cat} onClick={() => setBlockFilter(cat === blockFilter ? '' : cat)}
                        className={`text-[11px] px-2.5 py-1 rounded-full border font-medium transition-colors ${blockFilter === cat ? 'bg-orange-500 text-white border-orange-500' : 'border-gray-200 text-gray-500 hover:border-gray-400'}`}>
                        {cat}
                      </button>
                    ))}
                  </div>
                )}
                <div className="space-y-3">
                  {filteredCats.map(cat => {
                    const imgs = categories[cat];
                    const isCollapsed = collapsedScenes[`cat-${cat}`];
                    return (
                      <div key={cat} className="rounded-xl border border-orange-100/80">
                        <button onClick={() => toggleScene(`cat-${cat}`)}
                          className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-orange-50/30 rounded-t-xl transition-colors">
                          {isCollapsed ? <ChevronRight size={12} className="text-gray-400" /> : <ChevronDown size={12} className="text-gray-400" />}
                          <Package size={11} className="text-orange-400 shrink-0" />
                          <span className="text-xs font-semibold text-gray-700">{cat}</span>
                          <span className="text-[10px] text-gray-400 ml-auto shrink-0">{imgs.length} image{imgs.length !== 1 ? 's' : ''}</span>
                        </button>
                        {!isCollapsed && (
                          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 px-3 pb-3">
                            {imgs.map((img, i) => renderImageCard(img, i))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()

          /* Empty state for other tabs */
          : displayImages.length === 0 ? (
            <div className="text-center py-16">
              <ImageIcon size={32} className="mx-auto mb-3 text-gray-200" />
              <p className="text-sm text-gray-400 font-medium">No images in this category</p>
              <p className="text-xs text-gray-300 mt-1">Generate AI images or upload from your computer</p>
            </div>

          /* By-scene grouped view */
          ) : tab === 'by-scene' ? (
            <div className="space-y-4">
              {Object.entries(imagesByScene).map(([sceneId, data]) => {
                const isCollapsed = collapsedScenes[sceneId];
                const isCurrent = sceneId === targetSceneId;
                return (
                  <div key={sceneId} className={`rounded-xl border ${isCurrent ? 'border-purple-200 bg-purple-50/30' : 'border-gray-100'}`}>
                    <button onClick={() => toggleScene(sceneId)}
                      className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-gray-50/50 rounded-t-xl transition-colors">
                      {isCollapsed ? <ChevronRight size={12} className="text-gray-400" /> : <ChevronDown size={12} className="text-gray-400" />}
                      <span className="text-[10px] font-bold bg-gray-200 text-gray-600 rounded-full px-1.5 py-0.5">{data.sceneNumber}</span>
                      <span className="text-xs text-gray-500 font-mono truncate">{data.location || 'No location'}</span>
                      <span className="text-[10px] text-gray-400 ml-auto">{data.images.length} image{data.images.length !== 1 ? 's' : ''}</span>
                      {isCurrent && <span className="text-[9px] bg-purple-100 text-purple-600 px-1.5 py-0.5 rounded-full font-semibold">Current</span>}
                    </button>
                    {!isCollapsed && (
                      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 px-3 pb-3">
                        {data.images.map((img, i) => renderImageCard(img, i))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            /* Flat grid for All / AI / Video / Uploaded */
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
              {displayImages.map((img, i) => renderImageCard(img, i))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex items-center gap-3 shrink-0">
          {selected ? (
            <p className="text-xs text-gray-500 flex-1 truncate">
              {selected.sourceLabel
                ? `${selected.sourceType === 'block' ? '📦 Block' : '📄 Script'}: ${selected.sourceLabel}`
                : `Scene ${selected.sceneNumber}`}
              {selected.prompt ? ` — ${selected.prompt}` : ''}
            </p>
          ) : (
            <p className="text-xs text-gray-400 flex-1">Select an image to use</p>
          )}
          <button onClick={onClose} className="px-4 py-2 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
          <button
            onClick={() => { if (selected) { onSelect(selected); onClose(); } }}
            disabled={!selected}
            className="px-5 py-2 rounded-xl text-sm font-bold text-white disabled:opacity-40 transition-colors"
            style={{ background: 'var(--brand-accent)' }}
          >
            Use This Image
          </button>
        </div>
      </div>
    </div>
  );
}
