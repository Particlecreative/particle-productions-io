import { useState, useRef, useCallback } from 'react';
import { X, Upload, AlertCircle, Check, ChevronDown } from 'lucide-react';
import { parseFile, applyMapping } from '../../lib/importUtils';
import { createLineItem, upsertSupplier, generateId } from '../../lib/dataService';
import clsx from 'clsx';

// Target schemas per import type
const IMPORT_TARGETS = {
  budget: {
    label: 'Budget / Line Items',
    fields: [
      { key: 'item',           label: 'Item / Description',  required: true },
      { key: 'full_name',      label: 'Supplier Name' },
      { key: 'type',           label: 'Type' },
      { key: 'planned_budget', label: 'Planned Budget' },
      { key: 'actual_spent',   label: 'Actual Spent' },
      { key: 'status',         label: 'Status' },
      { key: 'payment_status', label: 'Payment Status' },
      { key: 'payment_method', label: 'Payment Method' },
      { key: 'payment_due',    label: 'Payment Due Date' },
      { key: 'notes',          label: 'Notes' },
    ],
  },
  suppliers: {
    label: 'Suppliers',
    fields: [
      { key: 'full_name',      label: 'Full Name',   required: true },
      { key: 'email',          label: 'Email' },
      { key: 'phone',          label: 'Phone' },
      { key: 'role',           label: 'Role' },
      { key: 'business_type',  label: 'Business Type' },
      { key: 'supplier_type',  label: 'Supplier Type' },
      { key: 'id_number',      label: 'ID / Tax Number' },
      { key: 'bank_name',      label: 'Bank Name' },
      { key: 'account_number', label: 'Account Number' },
      { key: 'notes',          label: 'Notes' },
    ],
  },
};

export default function ImportModal({ productionId, onClose, onImported }) {
  const [step, setStep] = useState('upload'); // upload | map | confirm | done
  const [importTarget, setImportTarget] = useState('budget');
  const [parsed, setParsed] = useState(null); // { headers, rows }
  const [mapping, setMapping] = useState({});  // fileHeader → targetKey
  const [error, setError] = useState('');
  const [importing, setImporting] = useState(false);
  const [importedCount, setImportedCount] = useState(0);
  const fileRef = useRef(null);

  const target = IMPORT_TARGETS[importTarget];

  // ── Step 1: Upload ──────────────────────────────────────────────────────────

  const handleFile = useCallback(async (file) => {
    setError('');
    try {
      const result = await parseFile(file);
      if (!result.headers.length || !result.rows.length) {
        setError('File is empty or could not be parsed.');
        return;
      }
      // Auto-map: fuzzy match file headers to target fields
      const autoMap = {};
      result.headers.forEach(h => {
        const hLower = h.toLowerCase().replace(/[\s_-]+/g, '');
        const match = target.fields.find(f => {
          const fLower = f.key.toLowerCase().replace(/[\s_-]+/g, '');
          const fLabel = f.label.toLowerCase().replace(/[\s_-]+/g, '');
          return hLower === fLower || hLower === fLabel || hLower.includes(fLower) || fLower.includes(hLower);
        });
        autoMap[h] = match ? match.key : '__skip__';
      });
      setParsed(result);
      setMapping(autoMap);
      setStep('map');
    } catch (e) {
      setError(e.message || 'Failed to parse file.');
    }
  }, [target]);

  function onDrop(e) {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  function onFileInput(e) {
    const file = e.target.files[0];
    if (file) handleFile(file);
  }

  // ── Step 2: Map ─────────────────────────────────────────────────────────────

  function setMappingField(fileHeader, targetKey) {
    setMapping(m => ({ ...m, [fileHeader]: targetKey }));
  }

  const previewRows = parsed ? parsed.rows.slice(0, 3) : [];
  const mappedHeaders = parsed ? parsed.headers.filter(h => mapping[h] && mapping[h] !== '__skip__') : [];

  // ── Step 3: Import ──────────────────────────────────────────────────────────

  async function doImport() {
    setImporting(true);
    setError('');
    try {
      const rows = applyMapping(parsed.rows, mapping);
      let count = 0;

      if (importTarget === 'budget') {
        rows.forEach(row => {
          createLineItem({
            id: generateId('li'),
            production_id: productionId,
            item: row.item || 'Unnamed',
            full_name: row.full_name || '',
            type: row.type || 'Crew',
            planned_budget: parseFloat(row.planned_budget) || 0,
            actual_spent: parseFloat(row.actual_spent) || 0,
            status: row.status || 'Not Started',
            payment_status: row.payment_status || 'Not Paid',
            payment_method: row.payment_method || '',
            payment_due: row.payment_due || '',
            notes: row.notes || '',
            invoice_url: '',
            invoice_status: '',
            invoice_type: null,
            invoice_stage: 'pending',
            dealer_type: null,
            created_at: new Date().toISOString(),
          });
          count++;
        });
      } else if (importTarget === 'suppliers') {
        rows.forEach(row => {
          if (!row.full_name) return;
          upsertSupplier({
            full_name: row.full_name,
            email: row.email || '',
            phone: row.phone || '',
            role: row.role || '',
            business_type: row.business_type || '',
            supplier_type: row.supplier_type || '',
            id_number: row.id_number || '',
            bank_name: row.bank_name || '',
            account_number: row.account_number || '',
            notes: row.notes || '',
            productions: productionId ? [productionId] : [],
            source: 'import',
          });
          count++;
        });
      }

      setImportedCount(count);
      setStep('done');
      if (onImported) onImported(count);
    } catch (e) {
      setError(e.message || 'Import failed.');
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col" style={{ maxHeight: '90vh' }}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b" style={{ borderColor: 'var(--brand-border)' }}>
          <h2 className="text-lg font-black" style={{ color: 'var(--brand-primary)' }}>
            Import Data
          </h2>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-100 text-gray-400">
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* ── Upload ──────────────────────────────────────────────────────── */}
          {step === 'upload' && (
            <>
              {/* Target selector */}
              <div>
                <label className="text-xs font-semibold text-gray-500 mb-2 block">Import as</label>
                <div className="flex gap-2">
                  {Object.entries(IMPORT_TARGETS).map(([key, t]) => (
                    <button
                      key={key}
                      onClick={() => setImportTarget(key)}
                      className={clsx(
                        'flex-1 py-2 px-4 rounded-lg text-sm font-semibold border transition-all',
                        importTarget === key
                          ? 'text-white border-transparent'
                          : 'text-gray-500 border-gray-200 hover:border-gray-300'
                      )}
                      style={importTarget === key ? { background: 'var(--brand-primary)' } : {}}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Drop zone */}
              <div
                onDrop={onDrop}
                onDragOver={e => e.preventDefault()}
                onClick={() => fileRef.current?.click()}
                className="border-2 border-dashed rounded-xl p-10 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-all"
                style={{ borderColor: 'var(--brand-border)' }}
              >
                <Upload size={28} className="mx-auto mb-3 text-gray-300" />
                <p className="font-semibold text-gray-600 text-sm">Drop a CSV or Excel file here</p>
                <p className="text-xs text-gray-400 mt-1">or click to browse</p>
                <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={onFileInput} />
              </div>

              {error && (
                <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 rounded-lg p-3">
                  <AlertCircle size={14} /> {error}
                </div>
              )}
            </>
          )}

          {/* ── Map ─────────────────────────────────────────────────────────── */}
          {step === 'map' && parsed && (
            <>
              <p className="text-sm text-gray-500">
                Found <strong>{parsed.rows.length}</strong> rows and <strong>{parsed.headers.length}</strong> columns.
                Map each file column to a CP Panel field below.
              </p>

              <div className="space-y-2">
                {parsed.headers.map(h => (
                  <div key={h} className="flex items-center gap-3">
                    <div className="w-40 text-xs font-mono bg-gray-50 rounded px-2 py-1.5 text-gray-600 truncate flex-shrink-0 border" style={{ borderColor: 'var(--brand-border)' }}>
                      {h}
                    </div>
                    <ChevronDown size={12} className="text-gray-300 flex-shrink-0" />
                    <select
                      className="brand-input text-xs flex-1"
                      value={mapping[h] || '__skip__'}
                      onChange={e => setMappingField(h, e.target.value)}
                    >
                      <option value="__skip__">— Skip —</option>
                      {target.fields.map(f => (
                        <option key={f.key} value={f.key}>{f.label}{f.required ? ' *' : ''}</option>
                      ))}
                    </select>
                    {/* Preview value from first row */}
                    {parsed.rows[0]?.[h] !== undefined && (
                      <span className="text-xs text-gray-400 truncate max-w-24 flex-shrink-0">
                        "{String(parsed.rows[0][h]).slice(0, 20)}"
                      </span>
                    )}
                  </div>
                ))}
              </div>

              {/* Preview table */}
              {previewRows.length > 0 && mappedHeaders.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-400 mb-2">Preview (first 3 rows)</p>
                  <div className="overflow-x-auto rounded-lg border" style={{ borderColor: 'var(--brand-border)' }}>
                    <table className="data-table text-xs">
                      <thead>
                        <tr>
                          {mappedHeaders.map(h => (
                            <th key={h}>{target.fields.find(f => f.key === mapping[h])?.label || mapping[h]}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {previewRows.map((row, i) => (
                          <tr key={i}>
                            {mappedHeaders.map(h => (
                              <td key={h} className="text-gray-600">{String(row[h] ?? '').slice(0, 40)}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {error && (
                <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 rounded-lg p-3">
                  <AlertCircle size={14} /> {error}
                </div>
              )}
            </>
          )}

          {/* ── Done ────────────────────────────────────────────────────────── */}
          {step === 'done' && (
            <div className="text-center py-8">
              <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4" style={{ background: 'var(--brand-primary)' }}>
                <Check size={24} className="text-white" />
              </div>
              <p className="text-lg font-black" style={{ color: 'var(--brand-primary)' }}>
                Import complete!
              </p>
              <p className="text-sm text-gray-500 mt-1">
                {importedCount} row{importedCount !== 1 ? 's' : ''} imported successfully.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t" style={{ borderColor: 'var(--brand-border)' }}>
          {step === 'map' && (
            <>
              <button onClick={() => setStep('upload')} className="btn-secondary text-sm px-4 py-2">Back</button>
              <button
                onClick={doImport}
                disabled={importing}
                className="btn-cta text-sm px-5 py-2"
                style={{ opacity: importing ? 0.7 : 1 }}
              >
                {importing ? 'Importing…' : `Import ${parsed?.rows.length ?? ''} rows`}
              </button>
            </>
          )}
          {(step === 'upload' || step === 'done') && (
            <button onClick={onClose} className="btn-cta text-sm px-5 py-2">
              {step === 'done' ? 'Done' : 'Cancel'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
