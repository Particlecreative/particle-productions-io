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
  // Monday.com line-item level fields
  { key: 'item',               label: 'Line Item Name' },
  { key: 'full_name',          label: 'Full Name' },
  { key: 'type',               label: 'Line Item Type' },
  { key: 'status',             label: 'Status' },
  { key: 'timeline_start',     label: 'Timeline Start' },
  { key: 'timeline_end',       label: 'Timeline End' },
  { key: 'planned_budget',     label: 'Planned Budget (item)' },
  { key: 'actual_spent',       label: 'Actual Spent (item)' },
  { key: 'contract',           label: 'Contract Link' },
  { key: 'invoice_url',        label: 'Invoice URL' },
];

// Auto-detect common Monday.com / Excel column name → CP Panel field
const AUTO_MAP = {
  // Production-level mappings
  'name':            'item',
  'project name':    'project_name',
  'project':         'project_name',
  'budget':          'planned_budget_2026',
  'numbers':         'planned_budget_2026',
  'stage':           'stage',
  'person':          'producer',
  'owner':           'producer',
  'start date':      'planned_start',
  'end date':        'planned_end',
  'timeline':        'planned_start',
  'production type': 'production_type',
  'text':            'notes',
  'notes':           'notes',

  // Monday.com line-item level auto-mappings
  'producer':        '_producer_skip',
  'full name':       'full_name',
  'type':            'type',
  'status':          'status',
  'timeline - start':'timeline_start',
  'timeline - end':  'timeline_end',
  'planned budget $':'planned_budget',
  'planned budget':  'planned_budget',
  'actual spent $':  'actual_spent',
  'actual spent':    'actual_spent',
  'price diff':      '',
  'contract':        'contract',
  'invoice':         'invoice_url',
  'prd sheet':       '',
  'dashboard':       '',
  'prd sheet link':  '',
  'dashboard link':  '',
};

// Monday.com section headers to skip
const SECTION_HEADERS = [
  'production tasks', 'production timeline', 'production budget',
  'subitems', 'group', 'section',
];

// Map Monday.com type values to CP Panel types
function normalizeType(raw) {
  const s = (raw || '').trim().toLowerCase();
  if (s.includes('actor') || s.includes('cast') || s.includes('talent') || s.includes('model')) return 'Cast';
  if (s.includes('art department') || s.includes('art dept')) return 'Equipment';
  if (s.includes('catering') || s.includes('transport')) return 'Catering & Transport';
  if (s.includes('post') || s.includes('edit') || s.includes('vfx')) return 'Post';
  if (s.includes('office') || s.includes('insurance') || s.includes('unexpected')) return 'Office';
  if (s.includes('equipment') || s.includes('gear') || s.includes('rental') || s.includes('camera')) return 'Equipment';
  if (s.includes('crew') || s.includes('freelance')) return 'Crew';
  // Pass through if it matches a known type
  const known = ['Crew', 'Equipment', 'Post', 'Office', 'Catering & Transport', 'Cast'];
  const match = known.find(k => k.toLowerCase() === s);
  if (match) return match;
  return raw?.trim() || 'Crew';
}

function guessMapping(header) {
  const key = header.toLowerCase().trim();
  const mapped = AUTO_MAP[key];
  if (mapped === '_producer_skip') return ''; // producer is production-level, skip in column mapping
  return mapped || '';
}

function parseDate(raw) {
  if (!raw) return '';
  const d = new Date(raw);
  if (!isNaN(d)) return d.toISOString().slice(0, 10);
  return '';
}

function parseValue(key, raw) {
  if (raw === null || raw === undefined) return '';
  const str = String(raw).trim();
  if (key === 'planned_budget_2026' || key === 'planned_budget' || key === 'actual_spent') {
    return parseFloat(str.replace(/[^0-9.-]/g, '')) || 0;
  }
  if (key === 'planned_start' || key === 'planned_end' || key === 'timeline_start' || key === 'timeline_end') {
    return parseDate(str);
  }
  if (key === 'type') return normalizeType(str);
  return str;
}

function isUrl(val) {
  const s = String(val || '').trim();
  return s.startsWith('http://') || s.startsWith('https://') || s.startsWith('www.');
}

// Check if a row looks like a section header or totals row
function shouldSkipRow(row) {
  const firstCell = String(row[0] || '').trim();
  // Skip rows where col 0 is empty/NaN
  if (!firstCell || firstCell === 'NaN' || firstCell === 'undefined' || firstCell === 'null') {
    // But also skip if it looks like a totals row (empty name but numbers exist)
    return true;
  }
  // Skip section headers
  const lower = firstCell.toLowerCase();
  if (SECTION_HEADERS.some(h => lower === h || lower.startsWith(h))) return true;
  return false;
}

// Clean trailing whitespace from all values in a row
function cleanRow(row) {
  return row.map(cell => {
    if (typeof cell === 'string') return cell.trimEnd();
    return cell;
  });
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
  const [step, setStep] = useState(1); // 1=upload, 2=map, 2.5=currency, 3=preview
  const [importCurrency, setImportCurrency] = useState('USD'); // USD or ILS
  const [headers, setHeaders] = useState([]);
  const [rows, setRows] = useState([]);
  const [mapping, setMapping] = useState({});
  const [selected, setSelected] = useState({});
  const [importing, setImporting] = useState(false);
  const [producerName, setProducerName] = useState('');
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
    // Find header row (first row with multiple non-empty cells that look like headers)
    let headerIdx = 0;
    for (let i = 0; i < Math.min(json.length, 5); i++) {
      const nonEmpty = json[i].filter(c => c !== '' && c != null).length;
      if (nonEmpty >= 3) { headerIdx = i; break; }
    }
    const hdrs = json[headerIdx].map(h => String(h).trim());

    // Clean rows and apply skip logic
    const dataRows = json.slice(headerIdx + 1)
      .map(cleanRow)
      .filter(r => {
        // Must have at least one non-empty cell
        if (!r.some(c => c !== '' && c != null)) return false;
        // Skip section headers, empty name rows, totals rows
        if (shouldSkipRow(r)) return false;
        return true;
      });

    // Auto-detect producer from first non-empty value in Producer column (col index 1 by name)
    const producerIdx = hdrs.findIndex(h => h.toLowerCase().trim() === 'producer');
    if (producerIdx >= 0) {
      for (const row of dataRows) {
        const val = String(row[producerIdx] || '').trim();
        if (val && val !== 'NaN') { setProducerName(val); break; }
      }
    }

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
      if (!field) return;
      // Handle contract/invoice — only save if value is a URL
      if (field === 'contract') {
        if (isUrl(row[hi])) obj.contract_url = String(row[hi]).trim();
        return;
      }
      if (field === 'invoice_url') {
        if (isUrl(row[hi])) obj.invoice_url = String(row[hi]).trim();
        return;
      }
      obj[field] = parseValue(field, row[hi]);
    });
    if (!obj.project_name) obj.project_name = obj.item || `Imported Production ${idx + 1}`;
    if (producerName && !obj.producer) obj.producer = producerName;
    const yearSuffix = String(selectedYear).slice(2);
    obj.id = `PRD${yearSuffix}-IMP${String(idx + 1).padStart(2, '0')}`;
    obj.estimated_budget = parseFloat(obj.planned_budget_2026 || obj.planned_budget) || 0;
    obj.actual_spent = parseFloat(obj.actual_spent) || 0;
    // Apply currency choice to line items
    if (importCurrency === 'ILS') {
      obj.currency_code = 'ILS';
    }
    return obj;
  }

  function goToCurrency() {
    // Check if any budget columns are mapped — if so, ask about currency
    const hasBudget = Object.values(mapping).some(v =>
      v === 'planned_budget_2026' || v === 'planned_budget' || v === 'actual_spent'
    );
    if (hasBudget) setStep(2.5);
    else setStep(3);
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
          {['Upload file', 'Map columns', 'Currency', 'Preview & confirm'].map((label, i) => (
            <div key={i} className="flex items-center gap-2">
              <div className={clsx(
                'w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold',
                step > [1,2,2.5,3][i] ? 'bg-green-500 text-white' :
                step === [1,2,2.5,3][i] ? 'text-white' : 'bg-gray-200 text-gray-500'
              )} style={step === [1,2,2.5,3][i] ? { background: 'var(--brand-accent)' } : {}}>
                {step > [1,2,2.5,3][i] ? <Check size={12} /> : i + 1}
              </div>
              <span className={clsx('text-xs font-semibold', step === i + 1 ? 'text-gray-700' : 'text-gray-400')}>{label}</span>
              {i < 3 && <ChevronRight size={14} className="text-gray-300" />}
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
            {producerName && (
              <div className="mb-3 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-700">
                Auto-detected producer: <span className="font-bold">{producerName}</span> — will be set on all imported productions.
              </div>
            )}
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
                onClick={goToCurrency}
                disabled={!Object.values(mapping).some(v => v === 'project_name' || v === 'item')}
                className="btn-cta flex-1 disabled:opacity-40"
              >
                Next
              </button>
            </div>
            {!Object.values(mapping).some(v => v === 'project_name' || v === 'item') && (
              <p className="text-xs text-red-500 mt-2 flex items-center gap-1">
                <AlertTriangle size={11} /> Map at least one column to "Project Name" or "Line Item Name" to continue.
              </p>
            )}
          </div>
        )}

        {/* Step 2.5 — Currency */}
        {step === 2.5 && (
          <div>
            <div className="text-center py-6">
              <p className="text-sm font-semibold text-gray-700 mb-2">
                Are budget values in $ or ₪?
              </p>
              <p className="text-xs text-gray-400 mb-5">
                This will set the currency on all imported line items.
              </p>
              <div className="flex justify-center gap-4">
                <button
                  onClick={() => { setImportCurrency('USD'); preview(); }}
                  className={clsx(
                    'flex flex-col items-center gap-2 px-8 py-5 rounded-xl border-2 transition-all hover:shadow-md',
                    importCurrency === 'USD' ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-blue-300'
                  )}
                >
                  <span className="text-2xl font-black">$</span>
                  <span className="text-sm font-bold">$ USD</span>
                  <span className="text-[10px] text-gray-400">US Dollars</span>
                </button>
                <button
                  onClick={() => { setImportCurrency('ILS'); preview(); }}
                  className={clsx(
                    'flex flex-col items-center gap-2 px-8 py-5 rounded-xl border-2 transition-all hover:shadow-md',
                    importCurrency === 'ILS' ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-blue-300'
                  )}
                >
                  <span className="text-2xl font-black">₪</span>
                  <span className="text-sm font-bold">₪ ILS</span>
                  <span className="text-[10px] text-gray-400">Israeli Shekels</span>
                </button>
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setStep(2)} className="btn-secondary flex-1">Back</button>
            </div>
          </div>
        )}

        {/* Step 3 — Preview */}
        {step === 3 && (
          <div>
            <p className="text-xs text-gray-500 mb-3">
              Review the productions below. Uncheck any rows you don't want to import.
              {importCurrency === 'ILS' && (
                <span className="ml-1 text-blue-600 font-semibold">Currency: ₪ ILS</span>
              )}
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
                    const sym = importCurrency === 'ILS' ? '₪' : '$';
                    const budgetVal = parseFloat(p.planned_budget_2026 || p.planned_budget) || 0;
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
                        </td>
                        <td className="px-3 py-2 text-gray-500">
                          {budgetVal ? `${sym}${Number(budgetVal).toLocaleString()}` : '—'}
                        </td>
                        <td className="px-3 py-2 text-gray-400">
                          {(p.planned_start || p.timeline_start) && (p.planned_end || p.timeline_end)
                            ? `${p.planned_start || p.timeline_start} → ${p.planned_end || p.timeline_end}`
                            : p.planned_start || p.timeline_start || '—'}
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
