import { useState, useRef, useEffect } from 'react';
import { X, Upload, FileSpreadsheet, Check, AlertTriangle, ChevronRight } from 'lucide-react';
import { createLineItem, generateId } from '../../lib/dataService';
import { nowISOString } from '../../lib/timezone';
import clsx from 'clsx';

// Auto-detect currency from cell value prefix
function detectCurrency(val) {
  const str = String(val || '').trim();
  if (str.startsWith('₪') || str.startsWith('NIS') || str.includes('₪')) return 'ILS';
  if (str.startsWith('$') || str.startsWith('USD')) return 'USD';
  return null;
}

function parseAmount(val) {
  const str = String(val || '').replace(/[₪$,\s]/g, '');
  return parseFloat(str) || 0;
}

function parseStatus(val) {
  const str = String(val || '').toLowerCase().trim();
  if (str.includes('paid') && !str.includes('not')) return 'Paid';
  if (str.includes('not') || str.includes('לא')) return 'Not Paid';
  if (str.includes('pending') || str.includes('ממתין')) return 'Pending';
  if (str.includes('שולם') || str.includes('paid')) return 'Paid';
  return 'Not Paid';
}

const COL_MAP_OPTIONS = [
  { key: '', label: '— Skip —' },
  { key: 'supplier', label: 'Supplier / Name' },
  { key: 'item', label: 'Job / Role' },
  { key: 'amount', label: 'Amount (Price)' },
  { key: 'invoice_url', label: 'Invoice / Receipt Link' },
  { key: 'payment_status', label: 'Payment Status' },
  { key: 'payment_method', label: 'Payment Method / Bank' },
];

// Exact matches
const AUTO_MAP_EXACT = {
  'name': 'supplier',        'supplier': 'supplier',    'full name': 'supplier',
  'first name': 'supplier',  'last name': 'supplier',   'contact': 'supplier',
  'job': 'item',             'role': 'item',            'description': 'item',
  'service': 'item',         'title': 'item',           'position': 'item',
  'price': 'amount',         'amount': 'amount',        'cost': 'amount',
  'fee': 'amount',           'total': 'amount',         'budget': 'amount',
  'invoice': 'invoice_url',  'receipt': 'invoice_url',  'link': 'invoice_url',
  'invoice/recipt': 'invoice_url',  'invoice/receipt': 'invoice_url',
  'invoice / receipt': 'invoice_url', 'invoice/receipt link': 'invoice_url',
  'status': 'payment_status',       'payment status': 'payment_status',
  'paid': 'payment_status',
  'payment method': 'payment_method', 'bank': 'payment_method',
  'routing': 'payment_method',        'method': 'payment_method',
  'payment': 'payment_method',
};

// Fuzzy auto-detect by keyword presence in column header
function autoDetectField(header) {
  const h = header.toLowerCase().trim();
  if (!h) return '';
  // Exact lookup first
  if (AUTO_MAP_EXACT[h]) return AUTO_MAP_EXACT[h];
  // Fuzzy keyword rules (order matters — more specific first)
  if (/price|amount|cost|fee|total|budget/.test(h)) return 'amount';
  if (/invoice|receipt|recipt/.test(h)) return 'invoice_url';
  if (/payment.*method|method.*pay|bank|transfer|wire/.test(h)) return 'payment_method';
  if (/payment.*stat|status|paid/.test(h)) return 'payment_status';
  if (/job|role|service|position|description|title/.test(h)) return 'item';
  if (/name|supplier|contact|vendor|talent|model|actor/.test(h)) return 'supplier';
  return '';
}

export default function ImportAccountingModal({ productionId, onClose, onImported }) {
  const [step, setStep] = useState(1); // 1=upload, 2=map, 2.5=currency, 3=preview
  const [fallbackCurrency, setFallbackCurrency] = useState('USD');
  const [headers, setHeaders] = useState([]);
  const [rows, setRows] = useState([]);
  const [mapping, setMapping] = useState({});
  const [parsedRows, setParsedRows] = useState([]);
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

    // Find header row
    let headerIdx = 0;
    for (let i = 0; i < Math.min(json.length, 5); i++) {
      if (json[i].filter(c => c !== '' && c != null).length >= 3) { headerIdx = i; break; }
    }

    const hdrs = json[headerIdx].map(h => String(h).trim());
    const dataRows = json.slice(headerIdx + 1).filter(r => r.some(c => c !== '' && c != null));

    // Key by column INDEX (not header name) so duplicate/blank headers don't collide
    const autoMapping = {};
    hdrs.forEach((h, hi) => { autoMapping[hi] = autoDetectField(h); });

    setHeaders(hdrs);
    setRows(dataRows);
    setMapping(autoMapping);
    setStep(2);
  }

  function buildParsedRows(currencyChoice) {
    const currency = currencyChoice || fallbackCurrency;
    return rows.map((row, idx) => {
      const obj = { _idx: idx, _include: true };
      headers.forEach((h, hi) => {
        const field = mapping[hi];
        if (!field) return;
        const val = row[hi];
        if (field === 'amount') {
          obj.amount = parseAmount(val);
          obj.currency = detectCurrency(val) || currency;
        } else if (field === 'payment_status') {
          obj.payment_status = parseStatus(val);
        } else {
          obj[field] = String(val || '').trim();
        }
      });
      // Skip rows with no supplier and no amount
      if (!obj.supplier && !obj.amount) obj._include = false;
      return obj;
    }).filter(r => r._include);
  }

  // Scan amount column and count per-currency rows
  function scanCurrencies() {
    const amountIdx = Object.entries(mapping).find(([, v]) => v === 'amount')?.[0];
    if (amountIdx == null) return { ils: 0, usd: 0, none: 0 };
    let ils = 0, usd = 0, none = 0;
    rows.forEach(row => {
      const val = String(row[amountIdx] ?? '');
      const c = detectCurrency(val);
      if (c === 'ILS') ils++;
      else if (c === 'USD') usd++;
      else none++;
    });
    return { ils, usd, none };
  }

  function goToCurrencyOrPreview() {
    const hasAmount = Object.values(mapping).includes('amount');
    if (!hasAmount) { goToPreview('USD'); return; }
    const { ils, usd, none } = scanCurrencies();
    // If every row has a detectable currency, skip the prompt entirely
    if (none === 0) { goToPreview('USD'); return; }
    // If only one currency type detected + some unknowns, auto-select that as fallback
    if (ils > 0 && usd === 0) setFallbackCurrency('ILS');
    else if (usd > 0 && ils === 0) setFallbackCurrency('USD');
    setStep(2.5);
  }

  function goToPreview(currencyChoice) {
    const parsed = buildParsedRows(currencyChoice);
    setParsedRows(parsed);
    const sel = {};
    parsed.forEach((_, i) => { sel[i] = true; });
    setSelected(sel);
    setStep(3);
  }

  async function handleImport() {
    setImporting(true);
    const toImport = parsedRows.filter((_, i) => selected[i]);

    for (const row of toImport) {
      const isPaid = row.payment_status === 'Paid';
      await Promise.resolve(createLineItem({
        id: generateId('li'),
        production_id: productionId,
        item: row.item || '',
        full_name: row.supplier || '',
        type: guessType(row.item),
        status: isPaid ? 'Done' : 'Not Started',
        planned_budget: row.amount || 0,
        actual_spent: isPaid ? (row.amount || 0) : 0,
        payment_status: row.payment_status || 'Not Paid',
        payment_method: row.payment_method || '',
        invoice_url: isPaid ? (row.invoice_url || '') : '',
        invoice_status: isPaid && row.invoice_url ? 'Received' : '',
        currency_code: row.currency || fallbackCurrency,
        notes: '',
        created_at: nowISOString(),
      }));
    }

    setImporting(false);
    onImported?.();
    onClose();
  }

  function guessType(item) {
    const s = (item || '').toLowerCase();
    if (/director|editor|photographer|dop|grip|gaffer|stylist|makeup|sound|coordinator|assistant|producer/i.test(s)) return 'Crew';
    if (/equipment|camera|gear|rental|lighting/i.test(s)) return 'Equipment';
    if (/catering|transport|taxi|parking|food/i.test(s)) return 'Catering & Transport';
    if (/offline|online|mix|color|vfx|vo|voice/i.test(s)) return 'Post';
    if (/office|unexpected|insurance/i.test(s)) return 'Office';
    if (/actor|actress|model|talent|extra/i.test(s)) return 'Cast';
    return 'Crew';
  }

  const selectedCount = Object.values(selected).filter(Boolean).length;
  const paidCount = parsedRows.filter((r, i) => selected[i] && r.payment_status === 'Paid').length;
  const notPaidCount = selectedCount - paidCount;

  const stepValues = [1, 2, 2.5, 3];
  const stepLabels = ['Upload file', 'Map columns', 'Currency', 'Preview & confirm'];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-panel" style={{ maxWidth: 720 }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-lg font-black" style={{ color: 'var(--brand-primary)' }}>
              Import from PRD Sheet
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">
              Import accounting data from your Production Budget Google Sheet
            </p>
          </div>
          <button onClick={onClose}><X size={18} className="text-gray-400" /></button>
        </div>

        {/* Step indicator */}
        <div className="flex items-center gap-2 mb-6">
          {stepLabels.map((label, i) => (
            <div key={i} className="flex items-center gap-2">
              <div className={clsx(
                'w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold',
                step > stepValues[i] ? 'bg-green-500 text-white' :
                step === stepValues[i] ? 'text-white' : 'bg-gray-200 text-gray-500'
              )} style={step === stepValues[i] ? { background: 'var(--brand-accent)' } : {}}>
                {step > stepValues[i] ? <Check size={12} /> : i + 1}
              </div>
              <span className={clsx('text-xs font-semibold', step === stepValues[i] ? 'text-gray-700' : 'text-gray-400')}>{label}</span>
              {i < 3 && <ChevronRight size={14} className="text-gray-300" />}
            </div>
          ))}
        </div>

        {/* Step 1: Upload */}
        {step === 1 && (
          <div>
            <div
              onDragOver={e => e.preventDefault()}
              onDrop={e => { e.preventDefault(); handleFile(e.dataTransfer.files[0]); }}
              onClick={() => fileRef.current?.click()}
              className="border-2 border-dashed border-gray-300 rounded-xl p-10 text-center cursor-pointer hover:border-gray-400 hover:bg-gray-50 transition-all"
            >
              <FileSpreadsheet size={36} className="mx-auto mb-3 text-gray-300" />
              <p className="text-sm font-semibold text-gray-600 mb-1">
                Drop your PRD Google Sheet export (.xlsx)
              </p>
              <p className="text-xs text-gray-400">
                Export from Google Sheets: File → Download → .xlsx
              </p>
              <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden"
                onChange={e => handleFile(e.target.files[0])} />
            </div>
          </div>
        )}

        {/* Step 2: Map columns */}
        {step === 2 && (
          <div>
            <p className="text-xs text-gray-500 mb-3">
              Map columns from your PRD sheet to accounting fields.
            </p>
            <div className="overflow-auto max-h-72 rounded-xl border border-gray-200">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-gray-50 border-b">
                    <th className="px-3 py-2 text-left">Your column</th>
                    <th className="px-3 py-2 text-left">Sample</th>
                    <th className="px-3 py-2 text-left">Maps to</th>
                  </tr>
                </thead>
                <tbody>
                  {headers.map((h, hi) => (
                    <tr key={hi} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="px-3 py-2 font-medium">{h}</td>
                      <td className="px-3 py-2 text-gray-400 truncate max-w-[140px]">
                        {String(rows[0]?.[hi] ?? '').slice(0, 30)}
                      </td>
                      <td className="px-3 py-2">
                        <select value={mapping[hi] || ''} onChange={e => setMapping(m => ({ ...m, [hi]: e.target.value }))}
                          className="brand-input py-1 text-xs">
                          {COL_MAP_OPTIONS.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setStep(1)} className="btn-secondary flex-1">Back</button>
              <button onClick={goToCurrencyOrPreview} className="btn-cta flex-1">Next</button>
            </div>
          </div>
        )}

        {/* Step 2.5: Currency prompt */}
        {step === 2.5 && (() => {
          const { ils, usd, none } = scanCurrencies();
          const total = ils + usd + none;
          return (
            <div>
              <div className="text-center py-4">
                <p className="text-sm font-semibold text-gray-700 mb-1">
                  Default currency for rows without a symbol
                </p>
                <p className="text-xs text-gray-400 mb-4">
                  Per-row ₪ / $ symbols are auto-detected. This only affects the <strong>{none}</strong> row{none !== 1 ? 's' : ''} without a currency symbol.
                </p>

                {/* Currency breakdown summary */}
                <div className="flex justify-center gap-3 mb-5">
                  {ils > 0 && (
                    <div className="flex items-center gap-1.5 bg-blue-50 border border-blue-100 rounded-lg px-3 py-1.5 text-xs">
                      <span className="font-bold text-blue-700">₪ ILS</span>
                      <span className="text-blue-500">auto-detected in {ils} row{ils !== 1 ? 's' : ''}</span>
                    </div>
                  )}
                  {usd > 0 && (
                    <div className="flex items-center gap-1.5 bg-green-50 border border-green-100 rounded-lg px-3 py-1.5 text-xs">
                      <span className="font-bold text-green-700">$ USD</span>
                      <span className="text-green-500">auto-detected in {usd} row{usd !== 1 ? 's' : ''}</span>
                    </div>
                  )}
                  {none > 0 && (
                    <div className="flex items-center gap-1.5 bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 text-xs">
                      <span className="font-bold text-gray-500">? Unknown</span>
                      <span className="text-gray-400">{none} row{none !== 1 ? 's' : ''} — needs fallback</span>
                    </div>
                  )}
                </div>

                <div className="flex justify-center gap-4">
                  <button
                    onClick={() => { setFallbackCurrency('USD'); goToPreview('USD'); }}
                    className={clsx(
                      'flex flex-col items-center gap-2 px-8 py-5 rounded-xl border-2 transition-all hover:shadow-md',
                      fallbackCurrency === 'USD' ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-blue-300'
                    )}
                  >
                    <span className="text-2xl font-black">$</span>
                    <span className="text-sm font-bold">$ USD</span>
                    <span className="text-[10px] text-gray-400">US Dollars</span>
                  </button>
                  <button
                    onClick={() => { setFallbackCurrency('ILS'); goToPreview('ILS'); }}
                    className={clsx(
                      'flex flex-col items-center gap-2 px-8 py-5 rounded-xl border-2 transition-all hover:shadow-md',
                      fallbackCurrency === 'ILS' ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-blue-300'
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
          );
        })()}

        {/* Step 3: Preview */}
        {step === 3 && (
          <div>
            <p className="text-xs text-gray-500 mb-2">
              {parsedRows.length} line items found.
              <span className="text-green-600 font-semibold ml-1">{paidCount} paid</span>
              {notPaidCount > 0 && <span className="text-gray-400 ml-1">· {notPaidCount} not paid</span>}
            </p>
            <div className="overflow-auto max-h-64 rounded-xl border border-gray-200">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-gray-50 border-b sticky top-0">
                    <th className="px-2 py-2 w-8"><input type="checkbox"
                      checked={selectedCount === parsedRows.length}
                      onChange={e => { const n = {}; parsedRows.forEach((_, i) => { n[i] = e.target.checked; }); setSelected(n); }}
                      className="rounded" /></th>
                    <th className="px-2 py-2 text-left">Name</th>
                    <th className="px-2 py-2 text-left">Job</th>
                    <th className="px-2 py-2 text-right">Amount</th>
                    <th className="px-2 py-2 text-center">Currency</th>
                    <th className="px-2 py-2 text-center">Invoice</th>
                    <th className="px-2 py-2 text-center">Status</th>
                    <th className="px-2 py-2 text-left">Payment</th>
                  </tr>
                </thead>
                <tbody>
                  {parsedRows.map((r, i) => {
                    const isPaid = r.payment_status === 'Paid';
                    return (
                      <tr key={i} className={clsx(
                        'border-b border-gray-100',
                        !selected[i] && 'opacity-40',
                        isPaid && selected[i] && 'bg-green-50',
                        !isPaid && selected[i] && 'bg-gray-50',
                      )}>
                        <td className="px-2 py-2">
                          <input type="checkbox" checked={!!selected[i]}
                            onChange={e => setSelected(s => ({ ...s, [i]: e.target.checked }))} className="rounded" />
                        </td>
                        <td className="px-2 py-2 font-medium max-w-[110px] truncate">{r.supplier || '—'}</td>
                        <td className="px-2 py-2 text-gray-500 max-w-[90px] truncate">{r.item || '—'}</td>
                        <td className="px-2 py-2 text-right font-semibold">
                          {r.currency === 'ILS' ? '₪' : '$'}{r.amount?.toLocaleString() || '0'}
                        </td>
                        <td className="px-2 py-2 text-center text-[10px] text-gray-400">{r.currency || '—'}</td>
                        <td className="px-2 py-2 text-center">
                          {r.invoice_url ? <span className="text-green-500">✓</span> : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-2 py-2 text-center">
                          <span className={clsx(
                            'px-1.5 py-0.5 rounded text-[10px] font-bold',
                            isPaid ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-600'
                          )}>
                            {r.payment_status || 'Not Paid'}
                          </span>
                        </td>
                        <td className="px-2 py-2 text-gray-400 max-w-[80px] truncate text-[10px]">
                          {r.payment_method || '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {paidCount > 0 && (
              <div className="mt-3 flex items-center gap-2 px-3 py-2 bg-green-50 border border-green-200 rounded-lg text-xs text-green-700">
                <Check size={12} />
                {paidCount} items marked as Paid will import with invoice data and accounting status.
              </div>
            )}

            <div className="flex gap-3 mt-5">
              <button onClick={() => setStep(2)} className="btn-secondary flex-1">Back</button>
              <button onClick={handleImport} disabled={importing || selectedCount === 0}
                className="btn-cta flex-1 disabled:opacity-40">
                {importing ? 'Importing…' : `Import ${selectedCount} Item${selectedCount !== 1 ? 's' : ''}`}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
