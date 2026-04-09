import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, FileText, CheckCircle, Clock, Archive, Eye, ExternalLink, MessageSquare, Film, Scroll } from 'lucide-react';
import NewScriptModal from '../scripts/NewScriptModal';
import clsx from 'clsx';

const API = import.meta.env.VITE_API_URL || '';
function jwt() { return localStorage.getItem('cp_auth_token'); }

const STATUS_COLORS = {
  draft: 'bg-gray-100 text-gray-500',
  review: 'bg-amber-100 text-amber-700',
  approved: 'bg-green-100 text-green-700',
  archived: 'bg-gray-200 text-gray-400',
};
const STATUS_ICONS = {
  draft: FileText,
  review: Eye,
  approved: CheckCircle,
  archived: Archive,
};

function timeAgo(dateStr) {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

export default function ScriptsTab({ productionId, production }) {
  const [scripts, setScripts] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const brandId = production?.brand_id;

  useEffect(() => { fetchScripts(); }, [productionId]);

  async function fetchScripts() {
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/scripts?production_id=${productionId}`, {
        headers: { Authorization: `Bearer ${jwt()}` },
      });
      const data = await res.json();
      setScripts(Array.isArray(data) ? data : []);
    } catch {}
    setLoading(false);
  }

  function handleScriptCreated(script) {
    setScripts(prev => [script, ...prev]);
    setShowModal(false);
    // Navigate to full scripts page with this script selected
    navigate(`/scripts?script_id=${script.id}`);
  }

  function openScript(scriptId) {
    navigate(`/scripts?script_id=${scriptId}`);
  }

  if (loading) {
    return (
      <div className="p-6 space-y-3">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="flex items-center gap-4 p-4 rounded-xl border border-gray-100">
            <div className="skeleton-block w-10 h-10 rounded-lg shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="skeleton-block h-4 w-2/3 rounded" />
              <div className="skeleton-block h-3 w-1/3 rounded" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h3 className="text-sm font-black text-gray-800 flex items-center gap-2">
            <Scroll size={15} style={{ color: 'var(--brand-accent, #6366f1)' }} />
            Scripts
            <span className="text-xs font-mono text-gray-400 font-normal">{scripts.length}</span>
          </h3>
          <p className="text-xs text-gray-400 mt-0.5">Click any script to open it in the full editor</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-1.5 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
          style={{ background: 'var(--brand-accent, #6366f1)' }}
        >
          <Plus size={12} /> New Script
        </button>
      </div>

      {/* Script cards */}
      {scripts.length === 0 ? (
        <div className="text-center py-16">
          <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-3">
            <FileText size={28} className="text-gray-300" />
          </div>
          <p className="text-sm font-medium text-gray-500 mb-1">No scripts yet</p>
          <p className="text-xs text-gray-400 mb-4">Create a script to start building your storyboard</p>
          <button
            onClick={() => setShowModal(true)}
            className="inline-flex items-center gap-1.5 text-xs font-semibold"
            style={{ color: 'var(--brand-accent, #6366f1)' }}
          >
            <Plus size={12} /> Create Script
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {scripts.map(script => {
            const Icon = STATUS_ICONS[script.status] || FileText;
            return (
              <button
                key={script.id}
                onClick={() => openScript(script.id)}
                className="w-full text-left group bg-white border border-gray-100 rounded-xl p-4 hover:border-gray-300 hover:shadow-md transition-all"
              >
                <div className="flex items-start gap-4">
                  {/* Icon */}
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                    style={{ background: 'var(--brand-glow, #eef2ff)' }}>
                    <Icon size={18} style={{ color: 'var(--brand-accent, #6366f1)' }} />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="text-sm font-bold text-gray-800 truncate group-hover:text-indigo-600 transition-colors">
                        {script.title}
                      </h4>
                      <span className={clsx('text-[10px] px-2 py-0.5 rounded-full font-semibold shrink-0', STATUS_COLORS[script.status])}>
                        {script.status}
                      </span>
                    </div>

                    <div className="flex items-center gap-3 text-[11px] text-gray-400">
                      <span className="flex items-center gap-1">
                        <Film size={10} /> {script.scene_count ?? 0} scenes
                      </span>
                      {script.open_comment_count > 0 && (
                        <span className="flex items-center gap-1 text-amber-600 font-semibold">
                          <MessageSquare size={10} /> {script.open_comment_count} comment{script.open_comment_count !== 1 ? 's' : ''}
                        </span>
                      )}
                      {script.updated_at && (
                        <span className="flex items-center gap-1">
                          <Clock size={10} /> {timeAgo(script.updated_at)}
                        </span>
                      )}
                      {script.created_by_name && (
                        <span className="truncate">by {script.created_by_name}</span>
                      )}
                    </div>
                  </div>

                  {/* Open arrow */}
                  <ExternalLink size={14} className="text-gray-300 group-hover:text-indigo-500 shrink-0 mt-1 transition-colors" />
                </div>
              </button>
            );
          })}
        </div>
      )}

      {showModal && (
        <NewScriptModal
          defaultProductionId={productionId}
          defaultBrandId={brandId}
          onCreated={handleScriptCreated}
          onClose={() => setShowModal(false)}
        />
      )}
    </div>
  );
}
