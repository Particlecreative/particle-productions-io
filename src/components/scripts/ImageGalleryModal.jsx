import { useState, useEffect } from 'react';
import { X, Check, Film, Sparkles, Upload, Clock, Image as ImageIcon } from 'lucide-react';

const API = import.meta.env.VITE_API_URL || '';
function jwt() { return localStorage.getItem('cp_auth_token'); }

/**
 * ImageGalleryModal — browse all images from this script + video frames.
 * Select an image to replace the current scene's visual.
 */
export default function ImageGalleryModal({ scriptId, scenes, targetSceneId, onClose, onSelect }) {
  const [tab, setTab] = useState('all');
  const [selected, setSelected] = useState(null);
  const [videoFrames, setVideoFrames] = useState([]);

  // Collect all images across scenes
  const allImages = [];
  scenes.forEach((s, i) => {
    (s.images || []).forEach(img => {
      allImages.push({
        ...img,
        sceneNumber: i + 1,
        sceneLocation: s.location,
        type: img.source === 'ai' ? 'ai' : img.source === 'video-extract' ? 'video' : 'upload',
      });
    });
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
    { key: 'all', label: 'All', count: allImages.length },
    { key: 'video', label: 'Video Frames', count: videoImages.length + videoFrames.length },
    { key: 'ai', label: 'AI Generated', count: aiImages.length },
    { key: 'uploaded', label: 'Uploaded', count: uploadedImages.length },
  ];

  const displayImages = tab === 'all' ? allImages
    : tab === 'video' ? [...videoImages, ...videoFrames.map(f => ({ id: f.scene_id + '-vf', url: f.frame_url, prompt: f.description, type: 'video', timestamp: f.timestamp_sec }))]
    : tab === 'ai' ? aiImages
    : uploadedImages;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 animate-fade-in" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="px-6 pt-5 pb-3 border-b border-gray-100 flex items-center justify-between shrink-0">
          <div>
            <h3 className="font-black text-gray-900 text-base flex items-center gap-2">
              <ImageIcon size={16} style={{ color: 'var(--brand-accent)' }} /> Image Gallery
            </h3>
            <p className="text-xs text-gray-400 mt-0.5">{allImages.length} images across {scenes.length} scenes</p>
          </div>
          <button onClick={onClose}><X size={18} className="text-gray-400" /></button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 px-6 py-2 border-b border-gray-50 shrink-0">
          {tabs.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${tab === t.key ? 'bg-gray-100 text-gray-800 font-semibold' : 'text-gray-500 hover:text-gray-700'}`}>
              {t.label} <span className="text-gray-400 ml-0.5">{t.count}</span>
            </button>
          ))}
        </div>

        {/* Grid */}
        <div className="flex-1 overflow-y-auto p-4">
          {displayImages.length === 0 ? (
            <div className="text-center py-12">
              <ImageIcon size={28} className="mx-auto mb-2 text-gray-200" />
              <p className="text-sm text-gray-400">No images in this category</p>
            </div>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
              {displayImages.map((img, i) => (
                <button
                  key={img.id || i}
                  onClick={() => setSelected(img)}
                  className={`relative aspect-video rounded-xl overflow-hidden border-2 transition-all group ${
                    selected?.id === img.id ? 'border-purple-500 ring-2 ring-purple-200' : 'border-transparent hover:border-gray-300'
                  }`}
                >
                  <img src={img.url} alt="" className="w-full h-full object-cover" loading="lazy" />
                  {/* Overlay */}
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-end">
                    <div className="w-full px-2 py-1 text-left opacity-0 group-hover:opacity-100 transition-opacity">
                      <div className="flex items-center gap-1">
                        {img.type === 'ai' && <Sparkles size={8} className="text-purple-300" />}
                        {img.type === 'video' && <Film size={8} className="text-blue-300" />}
                        {img.type === 'upload' && <Upload size={8} className="text-green-300" />}
                        <span className="text-[9px] text-white font-medium">Sc {img.sceneNumber || '?'}</span>
                        {img.timestamp !== undefined && (
                          <span className="text-[8px] text-white/70 flex items-center gap-0.5"><Clock size={7} />{img.timestamp?.toFixed(1)}s</span>
                        )}
                      </div>
                    </div>
                  </div>
                  {/* Selected check */}
                  {selected?.id === img.id && (
                    <div className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-purple-500 flex items-center justify-center">
                      <Check size={12} className="text-white" />
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex items-center gap-3 shrink-0">
          {selected && (
            <p className="text-xs text-gray-500 flex-1 truncate">
              {selected.prompt || `Scene ${selected.sceneNumber} — ${selected.type}`}
            </p>
          )}
          {!selected && <div className="flex-1" />}
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
