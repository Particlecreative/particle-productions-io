import { useState, useRef, useEffect } from 'react';
import { X, Upload, ChevronRight, Check, AlertTriangle, FileSpreadsheet, Download } from 'lucide-react';
import { createProduction, generateId } from '../../lib/dataService';
import { useAuth } from '../../context/AuthContext';
import clsx from 'clsx';

// CP Panel field targets for the column mapper
const TARGET_FIELDS = [
  { key: '',                   label: '— Skip —' },
  { key: 'project_name',       label: 'Project Name *' },
  { key: 'planned_budget_2026',label: 'Planned Budget ($)' },
  { key: 'planned_start',      label: 'Start Date' },
  { key: 'planned_end',        label: 'End Date' },
  { key: 'stage',              label: 'Stage' },
  { key: 'producer',           label: 'Producer' },
  { key: 'production_type',    label: 'Production Type' },
  { key: 'notes',              label: 'Notes' },
];

// Auto-detect common Monday.com / Excel column name → CP Panel field
const AUTO_MAP = {
  'name':            'project_name',
  'project name':    'project_name',
  'project':         'project_name',
  'item':            'project_name',
  'budget':          'planned_budget_2026',
  'planned budget':  'planned_budget_2026',
  'numbers':         'planned_budget_2026',
  'status':          'stage',
  'stage':           'stage',
  'person':          'producer',
  'owner':           'producer',
  'producer':        'producer',
  'start date':      'planned_start',
  'start':           'planned_start',
  'end date':        'planned_end',
  'end':             'planned_end',
  'timeline':        'planned_start',
  'type':            'production_type',
  'production type': 'production_type',
  'notes':           'notes',
  'text':            'notes',
};

function guessMapping(header) {
  return AUTO_MAP[header.toLowerCase().trim()] || '';
}

function parseDate(raw) {
  if (!raw) return '';
  // Try ISO, or common formats
  const d = new Date(raw);
  if (!isNaN(d)) return d.toISOString().slice(0, 10);
  return '';
}

function parseValue(key, raw) {
  if (raw === null || raw === undefined) return '';
  const str = String(raw).trim();
  if (key === 'planned_budget_2026') return parseFloat(str.replace(/[^0-9.]/g, '')) || 0;
  if (key === 'planned_start' || key === 'planned_end') return parseDate(str);
  return str;
}

// Download a blank Excel template the user can fill in
function downloadTemplate() {
  import('xlsx').then(XLSX => {
    const wb = XLSX.utils.book_new();
    const headers = ['Project Name', 'Budget', 'Start Date', 'End Date', 'Stage', 'Producer', 'Production Type', 'Notes'];
    const ws = XLSX.utils.aoa_to_sheet([headers]);
    XLSX.utils.book_append_sheet(wb, ws, 'Productions');
    XLSX.writeFile(wb, 'CP_Panel_Import_Template.xlsx');
  });
}

export default function ImportProductionsModal({ brandId, selectedYear = 2026, onClose, onImported }) {
  const { isEditor } = useAuth();
  const [step, setStep] = useState(1); // 1=upload, 2=map, 3=preview
  const [headers, setHeaders] = useState([]);
  const [rows, setRows] = useState([]);
  const [mapping, setMapping] = useState({});
  const [selected, setSelected] = useState({});
  const [importing, setImporting] = useState(false);
  const fileRef = useRef();

  // Escape to close
  useEffect(() => {
    function handleKey(e) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  async function handleFile(file) {
    if (!file) return;
    const XLSX = await import('xlsx');
    const data = await file.arrayBuffer();
    const wb = XLSX.read(data);
    const ws = wb.Sheets[wb.SheetNames[0]];
    const json = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
    if (json.length < 2) return;
    const hdrs = json[0].map(h => String(h));
    const dataRows = json.slice(1).filter(r => r.some(c => c !== ''));
    const autoMapping = {};
    hdrs.forEach(h => { autoMapping[h] = guessMapping(h); });
    setHeaders(hdrs);
    setRows(dataRows);
    setMapping(autoMapping);
    const sel = {};
    dataRows.forEach((_, i) => { sel[i] = true; });
    setSelected(sel);
    setStep(2);
  }

  function handleDrop(e) {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  function buildProduction(row, idx) {
    const obj = { brand_id: brandId, production_year: selectedYear, timeline_mode: 'manual', stage: 'Pending', product_type: [] };
    headers.forEach((h, hi) => {
      const field = mapping[h];
      if (field) obj[field] = parseValue(field, row[hi]);
    });
    if (!obj.project_name) obj.project_name = `Imported Production ${idx + 1}`;
    const yearSuffix = String(selectedYear).slice(2);
    obj.id = `PRD${yearSuffix}-IMP${String(idx + 1).padStart(2, '0')}`;
    obj.estimated_budget = parseFloat(obj.planned_budget_2026) || 0;
    obj.actual_spent = 0;
    return obj;
  }

  function preview() {
    setStep(3);
  }

  async function handleImport() {
    if (!isEditor) return;
    setImporting(true);
    const toImport = rows
      .map((r, i) => ({ row: r, idx: i }))
      .filter(({ idx }) => selected[idx]);

    const created = [];
    for (const { row, idx } of toImport) {
      const prod = buildProduction(row, idx);
      const result = createProduction(prod);
      if (result) created.push(result);
    }
    setImporting(false);
    onImported(created);
    onClose();
  }

  const selectedCount = Object.values(selected).filter(Boolean).length;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-panel" style={{ maxWidth: 720 }} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-lg font-black" style={{ color: 'var(--brand-primary)' }}>Import Productions</h2>
            <p className="text-xs text-gray-400 mt-0.5">From Excel or Monday.com export · {selectedYear}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>

        {/* Step indicator */}
        <div className="flex items-center gap-2 mb-6">
          {['Upload file', 'Map columns', 'Preview & confirm'].map((label, i) => (
            <div key={i} className="flex items-center gap-2">
              <div className={clsx(
                'w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold',
                step > i + 1 ? 'bg-green-500 text-white' :
                step === i + 1 ? 'text-white' : 'bg-gray-200 text-gray-500'
              )} style={step === i + 1 ? { background: 'var(--brand-accent)' } : {}}>
                {step > i + 1 ? <Check size={12} /> : i + 1}
              </div>
              <span className={clsx('text-xs font-semibold', step === i + 1 ? 'text-gray-700' : 'text-gray-400')}>{label}</span>
              {i < 2 && <ChevronRight size={14} className="text-gray-300" />}
            </div>
          ))}
        </div>

        {/* Step 1 — Upload */}
        {step === 1 && (
          <div>
            <div
              onDragOver={e => e.preventDefault()}
              onDrop={handleDrop}
              onClick={() => fileRef.current?.click()}
              className="border-2 border-dashed border-gray-300 rounded-xl p-10 text-center cursor-pointer hover:border-gray-400 hover:bg-gray-50 transition-all"
            >
              <FileSpreadsheet size={36} className="mx-auto mb-3 text-gray-300" />
              <p className="text-sm font-semibold text-gray-600 mb-1">Drop an Excel or CSV file here</p>
              <p className="text-xs text-gray-400">or click to browse · .xlsx, .csv accepted</p>
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={e => handleFile(e.target.files[0])}
              />
            </div>
            <div className="mt-4 flex items-center justify-between">
              <p className="text-xs text-gray-400">
                Works with Monday.com board exports and custom spreadsheets.
              </p>
              <button
                onClick={downloadTemplate}
                className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-700 font-semibold"
              >
                <Download size={12} />
                Download blank template
              </button>
            </div>
          </div>
        )}

        {/* Step 2 — Map Columns */}
        {step === 2 && (
          <div>
            <p className="text-xs text-gray-500 mb-3">
              {headers.length} columns detected in <span className="font-semibold">{rows.length}</span> row(s).
              Map each column to a CP Panel field.
            </p>
            <div className="overflow-auto max-h-80 rounded-xl border border-gray-200">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="px-3 py-2 text-left font-semibold text-gray-500">Your column</th>
                    <th className="px-3 py-2 text-left font-semibold text-gray-500">Sample value</th>
                    <th className="px-3 py-2 text-left font-semibold text-gray-500">Maps to</th>
                  </tr>
                </thead>
                <tbody>
                  {headers.map((h, hi) => (
                    <tr key={h} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="px-3 py-2 font-medium text-gray-700">{h}</td>
                      <td className="px-3 py-2 text-gray-400 truncate max-w-[160px]">
                        {String(rows[0]?.[hi] ?? '').slice(0, 40) || <span className="italic">—</span>}
                      </td>
                      <td className="px-3 py-2">
                        <select
                          value={mapping[h] || ''}
                          onChange={e => setMapping(m => ({ ...m, [h]: e.target.value }))}
                          className="brand-input py-1 text-xs"
                        >
                          {TARGET_FIELDS.map(f => (
                            <option key={f.key} value={f.key}>{f.label}</option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setStep(1)} className="btn-secondary flex-1">Back</button>
              <button
                onClick={preview}
                disabled={!Object.values(mapping).includes('project_name')}
                className="btn-cta flex-1 disabled:opacity-40"
              >
                Preview {rows.length} Productions
              </button>
            </div>
            {!Object.values(mapping).includes('project_name') && (
              <p className="text-xs text-red-500 mt-2 flex items-center gap-1">
                <AlertTriangle size={11} /> Map at least one column to "Project Name" to continue.
              </p>
            )}
          </div>
        )}

        {/* Step 3 — Preview */}
        {step === 3 && (
          <div>
            <p className="text-xs text-gray-500 mb-3">
              Review the productions below. Uncheck any rows you don't want to import.
            </p>
            <div className="overflow-auto max-h-72 rounded-xl border border-gray-200">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200 sticky top-0">
                    <th className="px-2 py-2 w-8">
                      <input
                        type="checkbox"
                        checked={selectedCount === rows.length}
                        onChange={e => {
                          const next = {};
                          rows.forEach((_, i) => { next[i] = e.target.checked; });
                          setSelected(next);
                        }}
                        className="rounded"
                      />
                    </th>
                    <th className="px-3 py-2 text-left font-semibold text-gray-500">ID</th>
                    <th className="px-3 py-2 text-left font-semibold text-gray-500">Project Name</th>
                    <th className="px-3 py-2 text-left font-semibold text-gray-500">Budget</th>
                    <th className="px-3 py-2 text-left font-semibold text-gray-500">Start → End</th>
                    <th className="px-3 py-2 text-left font-semibold text-gray-500">Stage</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, idx) => {
                    const p = buildProduction(row, idx);
                    const isPast = p.planned_end && new Date(p.planned_end) < new Date();
                    return (
                      <tr
                        key={idx}
                        className={clsx(
                          'border-b border-gray-100',
                          selected[idx] ? 'bg-white' : 'opacity-40 bg-gray-50',
                          isPast && selected[idx] && 'bg-amber-50'
                        )}
                      >
                        <td className="px-2 py-2">
                          <input
                            type="checkbox"
                            checked={!!selected[idx]}
                            onChange={e => setSelected(s => ({ ...s, [idx]: e.target.checked }))}
                            className="rounded"
                          />
                        </td>
                        <td className="px-3 py-2 font-mono text-gray-500">{p.id}</td>
                        <td className="px-3 py-2 font-medium text-gray-700 max-w-[200px] truncate">
                          {p.project_name}
                          {isPast && <span className="ml-1 text-amber-500 text-[10px]">📅 past</span>}
                        </td>
                        <td className="px-3 py-2 text-gray-500">
                          {p.planned_budget_2026 ? `$${Number(p.planned_budget_2026).toLocaleString()}` : '—'}
                        </td>
                        <td className="px-3 py-2 text-gray-400">
                          {p.planned_start && p.planned_end
                            ? `${p.planned_start} → ${p.planned_end}`
                            : p.planned_start || '—'}
                        </td>
                        <td className="px-3 py-2 text-gray-400">{p.stage || 'Pending'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {rows.filter((r, i) => {
              const p = buildProduction(r, i);
              return selected[i] && p.planned_end && new Date(p.planned_end) < new Date();
            }).length > 0 && (
              <div className="mt-3 flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700">
                <AlertTriangle size={12} className="shrink-0" />
                Some productions have past timelines — you'll be prompted to mark them as Completed after import.
              </div>
            )}

            <div className="flex gap-3 mt-5">
              <button onClick={() => setStep(2)} className="btn-secondary flex-1">Back</button>
              <button
                onClick={handleImport}
                disabled={importing || selectedCount === 0}
                className="btn-cta flex-1 disabled:opacity-40"
              >
                {importing ? 'Importing…' : `Import ${selectedCount} Production${selectedCount !== 1 ? 's' : ''}`}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
