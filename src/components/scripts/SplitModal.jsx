import { useState } from 'react';
import { X, Plus, Trash2, Sparkles, Loader2, Scissors, ImageIcon } from 'lucide-react';

const API = import.meta.env.VITE_API_URL || '';
function jwt() { return localStorage.getItem('cp_auth_token'); }

/**
 * SplitModal — User-controlled scene splitting into multiple shots.
 * Opens with the scene's text, lets user add/remove dividers,
 * optionally asks AI for suggestions, then applies the split.
 */
export default function SplitModal({ scene, scriptId, onClose, onApply }) {
  // Parse clean text from HTML
  const stripHtml = (html) => (html || '').replace(/<[^>]*>/g, '').trim();
  const initialWhatWeSee = stripHtml(scene.what_we_see);
  const initialWhatWeHear = stripHtml(scene.what_we_hear);

  const [segments, setSegments] = useState([
    { whatWeSee: initialWhatWeSee, whatWeHear: initialWhatWeHear },
  ]);
  const [loading, setLoading] = useState(false);
  const [generateImages, setGenerateImages] = useState(false);
  const [saveAsBlock, setSaveAsBlock] = useState(false);
  const [blockName, setBlockName] = useState('');

  const addBreakAfter = (index) => {
    setSegments(prev => {
      const seg = prev[index];
      // Split the "what we see" roughly in half by sentences or midpoint
      const seeText = seg.whatWeSee;
      const hearText = seg.whatWeHear;
      const seeMid = Math.ceil(seeText.length / 2);
      const hearMid = Math.ceil(hearText.length / 2);

      // Try to find a natural break (period, comma, newline)
      const findBreak = (text, mid) => {
        for (let i = mid; i < text.length; i++) {
          if ('.!?\n'.includes(text[i])) return i + 1;
        }
        for (let i = mid; i >= 0; i--) {
          if ('.!?\n'.includes(text[i])) return i + 1;
        }
        return mid;
      };

      const seeBreak = findBreak(seeText, seeMid);
      const hearBreak = findBreak(hearText, hearMid);

      const newSegments = [...prev];
      newSegments.splice(index, 1,
        { whatWeSee: seeText.slice(0, seeBreak).trim(), whatWeHear: hearText.slice(0, hearBreak).trim() },
        { whatWeSee: seeText.slice(seeBreak).trim(), whatWeHear: hearText.slice(hearBreak).trim() },
      );
      return newSegments;
    });
  };

  const removeSegment = (index) => {
    if (segments.length <= 1) return;
    setSegments(prev => {
      const newSegs = [...prev];
      // Merge with previous segment
      if (index > 0) {
        newSegs[index - 1] = {
          whatWeSee: (newSegs[index - 1].whatWeSee + ' ' + newSegs[index].whatWeSee).trim(),
          whatWeHear: (newSegs[index - 1].whatWeHear + ' ' + newSegs[index].whatWeHear).trim(),
        };
      }
      newSegs.splice(index, index === 0 ? 1 : 1);
      return newSegs.length > 0 ? newSegs : [{ whatWeSee: '', whatWeHear: '' }];
    });
  };

  const updateSegment = (index, field, value) => {
    setSegments(prev => prev.map((s, i) => i === index ? { ...s, [field]: value } : s));
  };

  const handleSuggestSplits = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/scripts/${scriptId}/suggest-shots`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt()}` },
        body: JSON.stringify({ scene_id: scene.id }),
      });
      const data = await res.json();
      const shots = data.shots || [];
      if (shots.length > 1) {
        // Set visuals from AI, placeholder for audio
        setSegments(shots.map(shot => ({
          whatWeSee: shot.description || '',
          whatWeHear: '...',
        })));

        // Ask Claude to distribute What We Hear across the AI-suggested shots
        if (initialWhatWeHear?.trim()) {
          try {
            const chatRes = await fetch(`${API}/api/scripts/${scriptId}/chat`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt()}` },
              body: JSON.stringify({
                messages: [{
                  role: 'user',
                  content: `I'm splitting a scene into ${shots.length} shots. Distribute the audio/dialogue logically across the shots.

Original "What We Hear" (one block):
${initialWhatWeHear}

Shots (one per visual):
${shots.map((s, i) => `Shot ${i + 1}: "${s.description}"`).join('\n')}

Return ONLY a JSON array of strings — one audio line per shot. Match the dialogue to what makes sense for each visual. Example: ["Shot 1 audio", "Shot 2 audio"]`
                }],
              }),
            });
            const chatData = await chatRes.json();
            if (chatData.reply) {
              const match = chatData.reply.match(/\[[\s\S]*\]/);
              if (match) {
                const audioLines = JSON.parse(match[0]);
                setSegments(prev => prev.map((seg, i) => ({
                  ...seg,
                  whatWeHear: audioLines[i] || '',
                })));
              }
            }
          } catch { /* keep ... placeholders */ }
        }
      }
    } catch {}
    setLoading(false);
  };

  const handleSplitBySentences = async () => {
    // Split What We Hear by sentence boundaries (period, !, ?, or " followed by space)
    let hearSentences = (initialWhatWeHear || '').split(/(?<=[.!?"""])\s+/).filter(s => s.trim());
    // Fallback: split by commas or clauses if no sentence breaks found
    if (hearSentences.length <= 1) {
      hearSentences = (initialWhatWeHear || '').split(/,\s+|;\s+|—\s+|\.\s+/).filter(s => s.trim());
    }
    if (hearSentences.length <= 1) return;

    // Set segments immediately with hear text, empty see (shows loading feel)
    setSegments(hearSentences.map(s => ({ whatWeSee: '...', whatWeHear: s })));

    // Ask Claude to distribute the original What We See across the audio sentences
    if (initialWhatWeSee?.trim()) {
      setLoading(true);
      try {
        const res = await fetch(`${API}/api/scripts/${scriptId}/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt()}` },
          body: JSON.stringify({
            messages: [{
              role: 'user',
              content: `I'm splitting a scene into ${hearSentences.length} shots by audio sentences. Distribute the visual description logically across the shots.

Original "What We See" (one block):
${initialWhatWeSee}

Audio sentences (one per shot):
${hearSentences.map((s, i) => `Shot ${i + 1}: "${s}"`).join('\n')}

Return ONLY a JSON array of strings — one visual description per shot. Match the visual to what makes sense for each audio line. Example: ["Shot 1 visual", "Shot 2 visual"]`
            }],
          }),
        });
        const data = await res.json();
        if (data.reply) {
          try {
            const match = data.reply.match(/\[[\s\S]*\]/);
            if (match) {
              const visuals = JSON.parse(match[0]);
              setSegments(hearSentences.map((s, i) => ({
                whatWeSee: visuals[i] || '',
                whatWeHear: s,
              })));
            }
          } catch { /* keep ... placeholders if parse fails */ }
        }
      } catch {}
      setLoading(false);
    }
  };

  const handleApply = () => {
    const validSegments = segments.filter(s => s.whatWeSee.trim() || s.whatWeHear.trim());
    if (validSegments.length === 0) return;
    onApply(validSegments, generateImages, { saveAsBlock, blockName: blockName.trim() });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="px-6 pt-5 pb-4 border-b border-gray-100 flex items-center justify-between shrink-0">
          <div>
            <h3 className="font-black text-gray-900 text-lg flex items-center gap-2">
              <Scissors size={18} className="text-purple-500" /> Split Scene
            </h3>
            <p className="text-xs text-gray-400 mt-0.5">
              Break this scene into {segments.length} shot{segments.length !== 1 ? 's' : ''}. Edit text for each shot below.
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={handleSplitBySentences}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
              title="Split at every period/sentence"
            >
              <Scissors size={11} /> By Sentence
            </button>
            <button
              onClick={handleSuggestSplits}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-purple-100 text-purple-700 rounded-lg hover:bg-purple-200 transition-colors disabled:opacity-50"
            >
              {loading ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
              AI Suggest
            </button>
            <button onClick={onClose}><X size={18} className="text-gray-400" /></button>
          </div>
        </div>

        {/* Segments */}
        <div className="flex-1 overflow-y-auto p-6 space-y-0">
          {segments.map((seg, i) => (
            <div key={i}>
              {/* Segment card */}
              <div className="border border-gray-200 rounded-xl p-4 bg-white hover:border-purple-200 transition-colors">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-black text-purple-600 uppercase tracking-wider">Shot {i + 1}</span>
                  {segments.length > 1 && (
                    <button
                      onClick={() => removeSegment(i)}
                      className="flex items-center gap-1 text-[10px] text-red-400 hover:text-red-600 transition-colors"
                      title="Merge with previous"
                    >
                      <Trash2 size={10} /> Remove
                    </button>
                  )}
                </div>
                <div className="space-y-2">
                  <div>
                    <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">What We See</label>
                    <textarea
                      value={seg.whatWeSee}
                      onChange={e => updateSegment(i, 'whatWeSee', e.target.value)}
                      placeholder="Visual description for this shot..."
                      className="w-full border border-gray-100 rounded-lg px-3 py-2 text-sm outline-none focus:border-purple-300 resize-none min-h-[60px] mt-1"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">What We Hear</label>
                    <textarea
                      value={seg.whatWeHear}
                      onChange={e => updateSegment(i, 'whatWeHear', e.target.value)}
                      placeholder="Dialogue, voiceover, SFX..."
                      className="w-full border border-gray-100 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-300 resize-none min-h-[40px] mt-1 text-indigo-700 italic"
                    />
                  </div>
                </div>
              </div>

              {/* Divider / Add break button */}
              {i < segments.length - 1 ? (
                <div className="flex items-center gap-2 py-2">
                  <div className="flex-1 border-t border-dashed border-purple-200" />
                  <span className="text-[9px] font-mono text-purple-300">break</span>
                  <div className="flex-1 border-t border-dashed border-purple-200" />
                </div>
              ) : segments.length < 6 && (
                <div className="flex justify-center py-2">
                  <button
                    onClick={() => addBreakAfter(i)}
                    className="flex items-center gap-1 text-[10px] text-purple-400 hover:text-purple-600 px-3 py-1 rounded-lg border border-dashed border-purple-200 hover:border-purple-400 transition-colors"
                  >
                    <Plus size={10} /> Add Break
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 shrink-0">
          <div className="flex items-center gap-4 mb-3">
            <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
              <input type="checkbox" checked={generateImages} onChange={e => setGenerateImages(e.target.checked)} className="accent-purple-600" />
              Generate AI images
            </label>
            <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
              <input type="checkbox" checked={saveAsBlock} onChange={e => setSaveAsBlock(e.target.checked)} className="accent-indigo-600" />
              Save as Universal Block
            </label>
            {saveAsBlock && (
              <input
                value={blockName}
                onChange={e => setBlockName(e.target.value)}
                placeholder="Block name..."
                className="border border-gray-200 rounded-lg px-2.5 py-1 text-xs outline-none focus:border-indigo-300 w-40"
                autoFocus
              />
            )}
          </div>
          <div className="flex items-center gap-3">
            <div className="flex-1" />
          <button onClick={onClose} className="px-4 py-2 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50">
            Cancel
          </button>
          <button
            onClick={handleApply}
            disabled={segments.filter(s => s.whatWeSee.trim() || s.whatWeHear.trim()).length === 0}
            className="px-5 py-2 bg-purple-600 text-white rounded-xl text-sm font-bold hover:bg-purple-700 disabled:opacity-50 flex items-center gap-2 transition-colors"
          >
            <Scissors size={13} /> Apply Split ({segments.filter(s => s.whatWeSee.trim() || s.whatWeHear.trim()).length} shots)
          </button>
          </div>
        </div>
      </div>
    </div>
  );
}
