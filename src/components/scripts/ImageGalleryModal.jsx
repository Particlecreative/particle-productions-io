import { useState, useEffect } from 'react';
import { X, Check, Film, Sparkles, Upload, Clock, Image as ImageIcon, ChevronDown, ChevronRight } from 'lucide-react';

const API = import.meta.env.VITE_API_URL || '';
function jwt() { return localStorage.getItem('cp_auth_token'); }

/**
 * ImageGalleryModal — browse all images from this script + video frames.
 * Select an image to replace or add to a scene.
 */
export default function ImageGalleryModal({ scriptId, scenes, targetSceneId, onClose, onSelect }) {
  const [tab, setTab] = useState('by-scene');
  const [selected, setSelected] = useState(null);
  const [videoFrames, setVideoFrames] = useState([]);
  const [collapsedScenes, setCollapsedScenes] = useState({});

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

  const tabs = [
    { key: 'by-scene', label: 'By Scene', count: allImages.length },
    { key: 'all', label: 'All', count: allImages.length },
    { key: 'ai', label: 'AI', count: aiImages.length, icon: Sparkles, color: 'text-purple-500' },
    { key: 'video', label: 'Video', count: videoImages.length + videoFrames.length, icon: Film, color: 'text-blue-500' },
    { key: 'uploaded', label: 'Uploaded', count: uploadedImages.length, icon: Upload, color: 'text-green-500' },
  ];

  const displayImages = tab === 'all' || tab === 'by-scene' ? allImages
    : tab === 'video' ? [...videoImages, ...videoFrames.map(f => ({ id: f.scene_id + '-vf', url: f.frame_url, prompt: f.description, type: 'video', timestamp: f.timestamp_sec }))]
    : tab === 'ai' ? aiImages
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
        <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end">
          <div className="w-full px-2 py-1.5">
            <div className="flex items-center gap-1">
              {img.type === 'ai' && <Sparkles size={9} className="text-purple-300" />}
              {img.type === 'video' && <Film size={9} className="text-blue-300" />}
              {(img.type === 'upload' || img.type === 'paste') && <Upload size={9} className="text-green-300" />}
              {img.sceneNumber && <span className="text-[9px] text-white font-medium">Scene {img.sceneNumber}</span>}
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
              <button key={t.key} onClick={() => setTab(t.key)}
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
          {displayImages.length === 0 ? (
            <div className="text-center py-16">
              <ImageIcon size={32} className="mx-auto mb-3 text-gray-200" />
              <p className="text-sm text-gray-400 font-medium">No images in this category</p>
              <p className="text-xs text-gray-300 mt-1">Generate AI images or upload from your computer</p>
            </div>
          ) : tab === 'by-scene' ? (
            /* Grouped by scene */
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
            /* Flat grid */
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
              {displayImages.map((img, i) => renderImageCard(img, i))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex items-center gap-3 shrink-0">
          {selected ? (
            <p className="text-xs text-gray-500 flex-1 truncate">
              Scene {selected.sceneNumber} — {selected.prompt || selected.type}
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
