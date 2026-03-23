import { useState, useRef, useEffect } from 'react';
import { Download, ChevronDown } from 'lucide-react';
import { exportCSV, exportXLSX, exportPDF } from '../../lib/exportUtils';

/**
 * <ExportMenu rows={[]} columns={[{ key, label }]} filename="suppliers" title="Suppliers" />
 */
export default function ExportMenu({ rows, columns, filename, title }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState('');
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    function onOutside(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    document.addEventListener('mousedown', onOutside);
    return () => document.removeEventListener('mousedown', onOutside);
  }, [open]);

  async function run(type) {
    setBusy(type);
    setOpen(false);
    try {
      if (type === 'csv')  exportCSV(rows, columns, filename);
      if (type === 'xlsx') await exportXLSX(rows, columns, filename, title);
      if (type === 'pdf')  await exportPDF(rows, columns, filename, title);
    } finally {
      setBusy('');
    }
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        disabled={!!busy}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold text-gray-600 hover:bg-gray-50 transition-all"
        style={{ borderColor: 'var(--brand-border)' }}
        title="Export"
      >
        <Download size={13} />
        {busy ? `${busy.toUpperCase()}…` : 'Export'}
        <ChevronDown size={11} />
      </button>

      {open && (
        <div className="absolute right-0 mt-1 z-50 bg-white rounded-xl shadow-lg border py-1" style={{ minWidth: 130, borderColor: 'var(--brand-border)' }}>
          {[
            { id: 'csv',  label: 'CSV' },
            { id: 'xlsx', label: 'Excel (.xlsx)' },
            { id: 'pdf',  label: 'PDF' },
          ].map(opt => (
            <button
              key={opt.id}
              onClick={() => run(opt.id)}
              className="w-full text-left px-4 py-2 text-xs hover:bg-gray-50 text-gray-700"
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
