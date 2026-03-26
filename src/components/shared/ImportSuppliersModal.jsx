import { useState, useMemo } from 'react';
import { X, Upload, FileSpreadsheet, AlertTriangle, Check, Users } from 'lucide-react';
import * as XLSX from 'xlsx';
import {
  upsertSupplier, createCastMember, getSuppliers, generateId,
} from '../../lib/dataService';
import clsx from 'clsx';

// ── Column header mappings (case-insensitive) ─────────────────────────────
const HEADER_MAP = [
  { patterns: ['name'],                                     field: 'full_name' },
  { patterns: ['role'],                                     field: 'role' },
  { patterns: ['phone'],                                    field: 'phone' },
  { patterns: ['email'],                                    field: 'email' },
  { patterns: ['home address', 'address', '\u05DB\u05EA\u05D5\u05D1\u05EA'], field: 'address' },
  { patterns: ['food restrictions'],                        field: 'food_restrictions' },
  { patterns: ['food notes'],                               field: 'dietary_notes' },
  { patterns: ['taxi or independent'],                      field: 'transport_mode' },
  { patterns: ['arrival to set'],                           field: 'arrival_to_set' },
  { patterns: ['contacts list'],                            field: 'contacts_list' },
];

// Section header keywords (rows that separate Crew from Talent)
const SECTION_KEYWORDS = ['crew', 'talent', 'cast'];

function matchHeader(raw) {
  const lower = (raw || '').trim().toLowerCase();
  for (const m of HEADER_MAP) {
    if (m.patterns.some(p => lower === p || lower.includes(p))) return m.field;
  }
  return null;
}

function isSectionRow(row, colMap) {
  // A row is a section header if the first cell matches a keyword and other cells are empty
  const nameIdx = colMap.findIndex(c => c?.field === 'full_name');
  if (nameIdx === -1) return { isSection: false };
  const val = (row[nameIdx] || '').toString().trim().toLowerCase();
  if (SECTION_KEYWORDS.includes(val)) {
    return { isSection: true, section: val === 'talent' || val === 'cast' ? 'talent' : 'crew' };
  }
  return { isSection: false };
}

function isEmptyRow(row) {
  return row.every(cell => !cell || cell.toString().trim() === '');
}

export default function ImportSuppliersModal({ brandId, productionId, onClose, onImported }) {
  const [step, setStep] = useState('upload'); // upload | preview | done
  const [fileName, setFileName] = useState('');
  const [parsedRows, setParsedRows] = useState([]);
  const [colMap, setColMap] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  // Existing suppliers for dedup
  const existingSuppliers = useMemo(() => {
    try { return getSuppliers(brandId) || []; } catch { return []; }
  }, [brandId]);

  // ── File Upload & Parse ────────────────────────────────────────────────
  function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');
    setFileName(file.name);

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const wb = XLSX.read(evt.target.result, { type: 'array' });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const raw = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

        if (raw.length < 2) {
          setError('File appears empty or has no data rows.');
          return;
        }

        // Map headers
        const headers = raw[0];
        const mapping = headers.map(h => {
          const field = matchHeader(String(h));
          return field ? { header: String(h), field } : null;
        });
        setColMap(mapping);

        // Parse rows, detecting sections
        let currentSection = 'crew'; // default
        const rows = [];
        for (let i = 1; i < raw.length; i++) {
          const r = raw[i];
          if (isEmptyRow(r)) continue;

          const sec = isSectionRow(r, mapping);
          if (sec.isSection) {
            currentSection = sec.section;
            continue;
          }

          // Build row object
          const obj = { _section: currentSection, _rowIndex: i };
          mapping.forEach((m, ci) => {
            if (m) obj[m.field] = (r[ci] || '').toString().trim();
          });

          // Skip rows with no name
          if (!obj.full_name) continue;

          // Check for duplicates
          obj._duplicate = existingSuppliers.some(s =>
            (s.full_name && obj.full_name && s.full_name.toLowerCase() === obj.full_name.toLowerCase()) ||
            (s.phone && obj.phone && s.phone.replace(/\D/g, '') === obj.phone.replace(/\D/g, ''))
          );

          rows.push(obj);
        }

        setParsedRows(rows);
        setSelected(new Set(rows.map((_, i) => i)));
        setStep('preview');
      } catch (err) {
        console.error('XLSX parse error:', err);
        setError('Failed to parse file. Make sure it is a valid .xlsx file.');
      }
    };
    reader.readAsArrayBuffer(file);
  }

  // ── Import ─────────────────────────────────────────────────────────────
  async function handleImport() {
    setImporting(true);
    let crewCount = 0;
    let talentCount = 0;
    let errorCount = 0;

    for (const [i, row] of parsedRows.entries()) {
      if (!selected.has(i)) continue;
      try {
        const base = {
          full_name: row.full_name,
          role: row.role || null,
          phone: row.phone || null,
          email: row.email || null,
          food_restrictions: row.food_restrictions || null,
          dietary_notes: row.dietary_notes || null,
          source: 'import',
          productions: productionId ? [productionId] : [],
        };

        // Store address in notes if present
        if (row.address) {
          base.notes = row.address ? `Address: ${row.address}` : null;
          base.address = row.address;
        }

        if (row._section === 'talent') {
          // Cast member
          const castData = {
            ...base,
            transport_mode: row.transport_mode || null,
            production_id: productionId || null,
          };
          await Promise.resolve(createCastMember(castData));
          talentCount++;
        } else {
          // Supplier (crew)
          await Promise.resolve(upsertSupplier(base));
          crewCount++;
        }
      } catch (err) {
        console.error('Import row error:', err);
        errorCount++;
      }
    }

    setResult({ crewCount, talentCount, errorCount });
    setImporting(false);
    setStep('done');
    if (onImported) onImported();
  }

  // ── Toggle helpers ─────────────────────────────────────────────────────
  function toggleRow(i) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i); else next.add(i);
      return next;
    });
  }
  function toggleAll() {
    if (selected.size === parsedRows.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(parsedRows.map((_, i) => i)));
    }
  }

  const crewRows = parsedRows.filter((r, i) => r._section === 'crew' && selected.has(i));
  const talentRows = parsedRows.filter((r, i) => r._section === 'talent' && selected.has(i));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <FileSpreadsheet size={20} style={{ color: 'var(--brand-primary)' }} />
            <h2 className="text-lg font-bold" style={{ color: 'var(--brand-primary)' }}>
              Import Crew List
            </h2>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 text-gray-400">
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto p-6">
          {/* ── UPLOAD STEP ── */}
          {step === 'upload' && (
            <div className="flex flex-col items-center justify-center py-12 gap-6">
              <div className="w-20 h-20 rounded-2xl bg-blue-50 flex items-center justify-center">
                <Upload size={32} className="text-blue-500" />
              </div>
              <div className="text-center">
                <div className="text-lg font-bold text-gray-800 mb-1">Upload Crew List</div>
                <div className="text-sm text-gray-400">
                  Excel file (.xlsx) with columns like Name, Role, Phone, Email, etc.
                </div>
              </div>

              <label className="cursor-pointer">
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  className="hidden"
                  onChange={handleFile}
                />
                <span className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-semibold text-sm text-white transition-all hover:opacity-90"
                  style={{ backgroundColor: 'var(--brand-primary)' }}>
                  <Upload size={16} /> Choose File
                </span>
              </label>

              {error && (
                <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 px-4 py-2 rounded-lg">
                  <AlertTriangle size={14} /> {error}
                </div>
              )}
            </div>
          )}

          {/* ── PREVIEW STEP ── */}
          {step === 'preview' && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="text-sm text-gray-500">
                  <span className="font-semibold text-gray-800">{fileName}</span>
                  {' \u2014 '}
                  {parsedRows.length} rows detected
                  {crewRows.length > 0 && <span className="ml-2 text-blue-600">{crewRows.length} Crew</span>}
                  {talentRows.length > 0 && <span className="ml-2 text-amber-600">{talentRows.length} Talent</span>}
                </div>
                <label className="flex items-center gap-2 text-xs text-gray-500 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selected.size === parsedRows.length}
                    onChange={toggleAll}
                    className="accent-blue-600"
                  />
                  Select All
                </label>
              </div>

              {/* Detected columns info */}
              <div className="mb-4 flex flex-wrap gap-1">
                {colMap.filter(Boolean).map((c, i) => (
                  <span key={i} className="badge text-xs bg-gray-100 text-gray-600 border border-gray-200">
                    {c.header} &rarr; {c.field}
                  </span>
                ))}
              </div>

              {/* Preview table */}
              <div className="border border-gray-200 rounded-xl overflow-hidden">
                <div className="overflow-auto" style={{ maxHeight: 400 }}>
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50 sticky top-0">
                      <tr>
                        <th className="px-3 py-2 text-left w-8"></th>
                        <th className="px-3 py-2 text-left">Name</th>
                        <th className="px-3 py-2 text-left">Role</th>
                        <th className="px-3 py-2 text-left">Phone</th>
                        <th className="px-3 py-2 text-left">Email</th>
                        <th className="px-3 py-2 text-left">Address</th>
                        <th className="px-3 py-2 text-left w-24">Type</th>
                        <th className="px-3 py-2 text-left w-28">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {parsedRows.map((row, i) => {
                        const isTalent = row._section === 'talent';
                        return (
                          <tr
                            key={i}
                            className={clsx(
                              'border-t border-gray-100 transition-colors',
                              isTalent ? 'bg-amber-50/50' : '',
                              !selected.has(i) && 'opacity-40',
                            )}
                          >
                            <td className="px-3 py-2">
                              <input
                                type="checkbox"
                                checked={selected.has(i)}
                                onChange={() => toggleRow(i)}
                                className="accent-blue-600"
                              />
                            </td>
                            <td className="px-3 py-2 font-medium text-gray-800">{row.full_name}</td>
                            <td className="px-3 py-2 text-gray-500">{row.role || '\u2014'}</td>
                            <td className="px-3 py-2 text-gray-500">{row.phone || '\u2014'}</td>
                            <td className="px-3 py-2 text-gray-500">{row.email || '\u2014'}</td>
                            <td className="px-3 py-2 text-gray-500 max-w-[120px] truncate">{row.address || '\u2014'}</td>
                            <td className="px-3 py-2">
                              {isTalent ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-700 border border-amber-200">
                                  <Users size={10} /> Cast
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-700 border border-blue-200">
                                  Crew
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-2">
                              {row._duplicate ? (
                                <span className="inline-flex items-center gap-1 text-xs text-amber-600">
                                  <AlertTriangle size={11} /> Already exists
                                </span>
                              ) : (
                                <span className="text-xs text-green-600">New</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ── DONE STEP ── */}
          {step === 'done' && result && (
            <div className="flex flex-col items-center justify-center py-12 gap-4">
              <div className="w-16 h-16 rounded-full bg-green-50 flex items-center justify-center">
                <Check size={28} className="text-green-500" />
              </div>
              <div className="text-lg font-bold text-gray-800">Import Complete</div>
              <div className="text-sm text-gray-500 text-center space-y-1">
                {result.crewCount > 0 && (
                  <div><span className="font-semibold text-blue-600">{result.crewCount}</span> crew members imported as suppliers</div>
                )}
                {result.talentCount > 0 && (
                  <div><span className="font-semibold text-amber-600">{result.talentCount}</span> talent imported to Cast</div>
                )}
                {result.errorCount > 0 && (
                  <div className="text-red-500">{result.errorCount} rows failed</div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100">
          {step === 'preview' && (
            <button
              onClick={() => setStep('upload')}
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              &larr; Back
            </button>
          )}
          {step !== 'preview' && <div />}

          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-sm font-semibold text-gray-500 hover:bg-gray-100 transition-all"
            >
              {step === 'done' ? 'Close' : 'Cancel'}
            </button>
            {step === 'preview' && (
              <button
                onClick={handleImport}
                disabled={importing || selected.size === 0}
                className="px-5 py-2 rounded-xl text-sm font-bold text-white transition-all hover:opacity-90 disabled:opacity-50"
                style={{ backgroundColor: 'var(--brand-primary)' }}
              >
                {importing ? 'Importing...' : `Import ${selected.size} row${selected.size !== 1 ? 's' : ''}`}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
