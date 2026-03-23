import { useState, useEffect } from 'react';
import { FileText, Download, Trash2, Search, X, RefreshCw } from 'lucide-react';
import { getAllCallSheets, deleteCallSheet, getProduction } from '../lib/dataService';
import { useAuth } from '../context/AuthContext';
import clsx from 'clsx';

export default function CallSheets() {
  const { isAdmin } = useAuth();
  const [callSheets, setCallSheets] = useState([]);
  const [search, setSearch] = useState('');
  const [productionNames, setProductionNames] = useState({});

  async function load() {
    const sheetsRaw = await Promise.resolve(getAllCallSheets());
    const sheets = Array.isArray(sheetsRaw) ? sheetsRaw : [];
    setCallSheets(sheets.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0)));
    // Resolve production names
    const names = {};
    await Promise.all(sheets.map(async cs => {
      if (cs.production_id && !names[cs.production_id]) {
        const p = await Promise.resolve(getProduction(cs.production_id));
        if (p) names[cs.production_id] = p.project_name || cs.production_id;
      }
    }));
    setProductionNames(names);
  }

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function remove(id) {
    if (!confirm('Delete this call sheet?')) return;
    deleteCallSheet(id);
    load();
  }

  function fmtDate(dt) {
    if (!dt) return '—';
    return new Date(dt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  const filtered = callSheets.filter(cs => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      (cs.title || '').toLowerCase().includes(q) ||
      (productionNames[cs.production_id] || '').toLowerCase().includes(q) ||
      (cs.shoot_date || '').includes(q) ||
      (cs.created_by || '').toLowerCase().includes(q)
    );
  });

  const RECIPIENT_LABELS = {
    all: 'All', crew: 'Crew Only', cast: 'Cast Only',
    stakeholders: 'Stakeholders', custom: 'Custom',
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl flex items-center justify-center" style={{ background: 'var(--brand-primary)' }}>
            <FileText size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-xl font-black text-gray-900">Call Sheets</h1>
            <p className="text-xs text-gray-400">{callSheets.length} generated across all productions</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button onClick={load} className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-400 hover:text-gray-600 transition-all">
            <RefreshCw size={14} />
          </button>
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search…"
              className="pl-8 pr-7 py-2 border border-gray-200 rounded-lg text-xs outline-none focus:ring-2 focus:ring-blue-300 w-48"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500">
                <X size={11} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="brand-card p-0 overflow-hidden">
        <div className="table-scroll-wrapper">
          <table className="data-table" style={{ minWidth: 700 }}>
            <thead>
              <tr>
                <th style={{ minWidth: 200 }}>Title</th>
                <th style={{ minWidth: 160 }}>Production</th>
                <th style={{ minWidth: 110 }}>Shoot Date</th>
                <th style={{ minWidth: 110 }}>Recipients</th>
                <th style={{ minWidth: 120 }}>Created By</th>
                <th style={{ minWidth: 120 }}>Generated On</th>
                <th style={{ minWidth: 80 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-16 text-gray-400 text-sm">
                    <FileText size={36} className="mx-auto mb-3 opacity-20" />
                    {search ? 'No call sheets match your search.' : 'No call sheets generated yet.'}
                    <div className="text-xs mt-1 text-gray-300">
                      Open a Shoot production → Call Sheet tab to generate one.
                    </div>
                  </td>
                </tr>
              ) : filtered.map(cs => (
                <tr key={cs.id}>
                  <td>
                    <div className="font-semibold text-sm text-gray-900">{cs.title || '—'}</div>
                    <div className="text-[10px] text-gray-400 font-mono">{cs.id}</div>
                  </td>
                  <td className="text-sm text-gray-600">
                    {productionNames[cs.production_id] || cs.production_id || '—'}
                  </td>
                  <td className="text-sm font-medium">{cs.shoot_date || '—'}</td>
                  <td>
                    <span className="px-2 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 rounded text-xs font-semibold">
                      {RECIPIENT_LABELS[cs.recipients] || cs.recipients || 'All'}
                    </span>
                    {cs.recipients === 'custom' && cs.custom_recipient_ids?.length > 0 && (
                      <div className="text-[10px] text-gray-400 mt-0.5">{cs.custom_recipient_ids.length} selected</div>
                    )}
                  </td>
                  <td className="text-sm text-gray-500">{cs.created_by || '—'}</td>
                  <td className="text-xs text-gray-400">{fmtDate(cs.created_at)}</td>
                  <td>
                    <div className="flex items-center gap-1.5">
                      {isAdmin && (
                        <button
                          onClick={() => remove(cs.id)}
                          title="Delete"
                          className="p-1.5 rounded text-gray-300 hover:text-red-500 hover:bg-red-50 transition-all"
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {filtered.length > 0 && (
        <div className="mt-3 text-xs text-gray-400 text-right">{filtered.length} of {callSheets.length} call sheets</div>
      )}
    </div>
  );
}
