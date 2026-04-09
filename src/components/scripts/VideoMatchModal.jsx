import { useState, useRef, useEffect } from 'react';
import { X, Upload, Film, Loader2, Check, AlertCircle, Youtube, Cloud, HardDrive } from 'lucide-react';
import { toast } from '../../lib/toast';

const API = import.meta.env.VITE_API_URL || '';
function jwt() { return localStorage.getItem('cp_auth_token'); }

export default function VideoMatchModal({ scriptId, sceneCount, onClose, onApplied }) {
  const [step, setStep] = useState(1); // 1=input, 2=processing, 3=review
  const [videoFile, setVideoFile] = useState(null);
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [driveFileId, setDriveFileId] = useState('');
  const [jobId, setJobId] = useState(null);
  const [jobStatus, setJobStatus] = useState('');
  const [matches, setMatches] = useState([]);
  const [error, setError] = useState(null);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [applying, setApplying] = useState(false);
  const fileRef = useRef();
  const pollRef = useRef();

  // Cleanup polling on unmount
  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  async function handleStart() {
    setStep(2);
    setError(null);
    try {
      let res;
      if (videoFile) {
        const formData = new FormData();
        formData.append('video', videoFile);
        res = await fetch(`${API}/api/scripts/${scriptId}/video-match`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${jwt()}` },
          body: formData,
        });
      } else if (youtubeUrl.trim()) {
        res = await fetch(`${API}/api/scripts/${scriptId}/video-match`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt()}` },
          body: JSON.stringify({ youtube_url: youtubeUrl.trim() }),
        });
      } else if (driveFileId.trim()) {
        res = await fetch(`${API}/api/scripts/${scriptId}/video-match`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt()}` },
          body: JSON.stringify({ drive_file_id: driveFileId.trim() }),
        });
      } else {
        setError('No video source selected');
        setStep(1);
        return;
      }
      const data = await res.json();
      if (!data.job_id) { setError(data.error || 'Failed to start'); setStep(1); return; }
      setJobId(data.job_id);
      // Start polling
      pollRef.current = setInterval(async () => {
        try {
          const pollRes = await fetch(`${API}/api/scripts/${scriptId}/video-match/${data.job_id}`, {
            headers: { Authorization: `Bearer ${jwt()}` },
          });
          const pollData = await pollRes.json();
          setJobStatus(pollData.status);
          if (pollData.status === 'complete') {
            clearInterval(pollRef.current);
            const results = pollData.match_results || [];
            setMatches(results);
            setSelectedIds(new Set(results.filter(m => m.frame_url && m.confidence >= 0.3).map(m => m.scene_id)));
            setStep(3);
          } else if (pollData.status === 'failed') {
            clearInterval(pollRef.current);
            setError(pollData.error || 'Processing failed');
            setStep(1);
          }
        } catch {}
      }, 2000);
    } catch (err) {
      setError(err.message);
      setStep(1);
    }
  }

  async function handleApply() {
    setApplying(true);
    try {
      const res = await fetch(`${API}/api/scripts/${scriptId}/video-match/${jobId}/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt()}` },
        body: JSON.stringify({ selected_scene_ids: [...selectedIds] }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(`Applied ${selectedIds.size} matched frames`);
        onApplied?.();
        onClose();
      } else {
        toast.error(data.error || 'Apply failed');
      }
    } catch { toast.error('Apply failed'); }
    setApplying(false);
  }

  function toggleSelect(sceneId) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(sceneId)) next.delete(sceneId);
      else next.add(sceneId);
      return next;
    });
  }

  const STATUS_LABELS = {
    pending: 'Starting...',
    downloading: 'Downloading video...',
    uploading_to_gemini: 'Uploading to AI...',
    analyzing: 'Analyzing video vs script...',
    extracting_frames: 'Extracting frames...',
    complete: 'Done!',
    failed: 'Failed',
  };

  // Extract Google Drive file ID from URL
  function parseDriveUrl(url) {
    const match = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
    return match ? match[1] : url;
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 animate-fade-in" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="px-6 pt-5 pb-4 border-b border-gray-100 flex items-center justify-between shrink-0">
          <div>
            <h3 className="font-black text-gray-900 text-lg flex items-center gap-2">
              <Film size={18} className="text-purple-500" /> Match Video to Script
            </h3>
            <p className="text-xs text-gray-400 mt-0.5">
              {step === 1 && `Extract frames for ${sceneCount} scenes`}
              {step === 2 && STATUS_LABELS[jobStatus] || 'Processing...'}
              {step === 3 && `${matches.length} matches found — select which to apply`}
            </p>
          </div>
          <button onClick={onClose}><X size={18} className="text-gray-400" /></button>
        </div>

        {/* Step 1: Input */}
        {step === 1 && (
          <div className="p-6 space-y-4">
            {error && (
              <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-600">
                <AlertCircle size={14} /> {error}
              </div>
            )}

            {/* Upload MP4 */}
            <div
              onClick={() => fileRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${videoFile ? 'border-purple-300 bg-purple-50' : 'border-gray-200 hover:border-purple-300 hover:bg-purple-50/50'}`}
            >
              {videoFile ? (
                <div className="flex items-center gap-3 justify-center">
                  <Film size={20} className="text-purple-500" />
                  <div className="text-left">
                    <p className="text-sm font-semibold text-purple-700 truncate max-w-[250px]">{videoFile.name}</p>
                    <p className="text-[10px] text-purple-500">{(videoFile.size / 1024 / 1024).toFixed(1)} MB</p>
                  </div>
                  <button onClick={e => { e.stopPropagation(); setVideoFile(null); }} className="text-purple-400 hover:text-red-500"><X size={14} /></button>
                </div>
              ) : (
                <>
                  <Upload size={24} className="mx-auto mb-2 text-gray-400" />
                  <p className="text-sm font-medium text-gray-600">Drop MP4 here or click to browse</p>
                  <p className="text-[10px] text-gray-400 mt-1">Up to 500MB</p>
                </>
              )}
            </div>
            <input ref={fileRef} type="file" accept="video/mp4,video/*" className="hidden" onChange={e => setVideoFile(e.target.files?.[0] || null)} />

            <div className="flex items-center gap-3">
              <div className="flex-1 h-px bg-gray-200" />
              <span className="text-[10px] text-gray-400 font-semibold">OR</span>
              <div className="flex-1 h-px bg-gray-200" />
            </div>

            {/* YouTube URL */}
            <div className="flex items-center gap-2">
              <Youtube size={16} className="text-red-500 shrink-0" />
              <input
                value={youtubeUrl}
                onChange={e => { setYoutubeUrl(e.target.value); setDriveFileId(''); }}
                placeholder="YouTube URL..."
                className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-purple-300"
              />
            </div>

            {/* Google Drive URL */}
            <div className="flex items-center gap-2">
              <HardDrive size={16} className="text-blue-500 shrink-0" />
              <input
                value={driveFileId}
                onChange={e => { setDriveFileId(parseDriveUrl(e.target.value)); setYoutubeUrl(''); }}
                placeholder="Google Drive link or file ID..."
                className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-purple-300"
              />
            </div>

            <button
              onClick={handleStart}
              disabled={!videoFile && !youtubeUrl.trim() && !driveFileId.trim()}
              className="w-full py-3 bg-purple-600 text-white rounded-xl text-sm font-bold hover:bg-purple-700 disabled:opacity-40 flex items-center justify-center gap-2 transition-colors"
            >
              <Film size={14} /> Match Video to {sceneCount} Scenes
            </button>
          </div>
        )}

        {/* Step 2: Processing */}
        {step === 2 && (
          <div className="p-6 flex flex-col items-center justify-center py-16">
            <Loader2 size={32} className="animate-spin text-purple-500 mb-4" />
            <p className="text-sm font-semibold text-gray-800 mb-1">{STATUS_LABELS[jobStatus] || 'Processing...'}</p>
            <p className="text-xs text-gray-400">This may take 30-120 seconds depending on video length</p>
            <div className="mt-6 flex gap-1">
              {['downloading', 'uploading_to_gemini', 'analyzing', 'extracting_frames'].map((s, i) => (
                <div key={s} className={`w-2 h-2 rounded-full transition-colors ${
                  s === jobStatus ? 'bg-purple-500 animate-pulse' :
                  ['downloading', 'uploading_to_gemini', 'analyzing', 'extracting_frames'].indexOf(jobStatus) > i ? 'bg-purple-500' : 'bg-gray-200'
                }`} />
              ))}
            </div>
          </div>
        )}

        {/* Step 3: Review */}
        {step === 3 && (
          <div className="flex-1 overflow-y-auto p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs text-gray-500">{selectedIds.size} of {matches.length} selected</p>
              <div className="flex gap-2">
                <button onClick={() => setSelectedIds(new Set(matches.filter(m => m.frame_url).map(m => m.scene_id)))}
                  className="text-[10px] text-purple-600 font-semibold hover:underline">Select All</button>
                <button onClick={() => setSelectedIds(new Set())}
                  className="text-[10px] text-gray-500 font-semibold hover:underline">Deselect All</button>
              </div>
            </div>
            <div className="space-y-2">
              {matches.map(match => (
                <div
                  key={match.scene_id}
                  onClick={() => match.frame_url && toggleSelect(match.scene_id)}
                  className={`flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${
                    selectedIds.has(match.scene_id)
                      ? 'border-purple-400 bg-purple-50'
                      : match.frame_url ? 'border-gray-100 hover:border-gray-300' : 'border-gray-100 opacity-50'
                  }`}
                >
                  {/* Frame thumbnail */}
                  <div className="w-16 h-12 rounded-lg bg-gray-100 overflow-hidden shrink-0">
                    {match.frame_url ? (
                      <img src={match.frame_url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-300"><Film size={16} /></div>
                    )}
                  </div>
                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-gray-700">Scene {match.scene_number}</span>
                      <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-semibold ${
                        match.confidence >= 0.7 ? 'bg-green-100 text-green-700' :
                        match.confidence >= 0.4 ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-500'
                      }`}>
                        {Math.round(match.confidence * 100)}%
                      </span>
                      <span className="text-[9px] text-gray-400">{match.match_type}</span>
                    </div>
                    <p className="text-[10px] text-gray-500 truncate mt-0.5">{match.description}</p>
                    <p className="text-[9px] text-gray-400 font-mono">@ {match.timestamp_sec?.toFixed(1)}s</p>
                  </div>
                  {/* Checkbox */}
                  {match.frame_url && (
                    <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 ${
                      selectedIds.has(match.scene_id) ? 'border-purple-500 bg-purple-500' : 'border-gray-300'
                    }`}>
                      {selectedIds.has(match.scene_id) && <Check size={12} className="text-white" />}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Footer */}
        {step === 3 && (
          <div className="px-6 py-4 border-t border-gray-100 flex gap-2 shrink-0">
            <button onClick={onClose} className="px-4 py-2 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
            <button
              onClick={handleApply}
              disabled={selectedIds.size === 0 || applying}
              className="flex-1 py-2.5 bg-purple-600 text-white rounded-xl text-sm font-bold hover:bg-purple-700 disabled:opacity-50 flex items-center justify-center gap-2 transition-colors"
            >
              {applying ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
              Apply {selectedIds.size} Frame{selectedIds.size !== 1 ? 's' : ''}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
