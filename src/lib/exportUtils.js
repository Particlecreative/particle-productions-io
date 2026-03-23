/**
 * exportUtils.js — CSV, Excel, and PDF export helpers
 *
 * Usage:
 *   exportCSV(rows, columns, 'suppliers-2026-03-12')
 *   exportXLSX(rows, columns, 'accounting-2026-03-12', 'Accounting')
 *   exportPDF(rows, columns, 'invoices-2026-03-12', 'Invoices')
 *
 * rows:    Array of plain objects
 * columns: Array of { key: string, label: string }
 */

// ── helpers ──────────────────────────────────────────────────────────────────

function todayStamp() {
  return new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD
}

function getValues(rows, columns) {
  return rows.map(r => columns.map(c => {
    const v = r[c.key];
    if (v === null || v === undefined) return '';
    if (Array.isArray(v)) return v.join(', ');
    return String(v);
  }));
}

// ── CSV ───────────────────────────────────────────────────────────────────────

export function exportCSV(rows, columns, filename) {
  const headers = columns.map(c => JSON.stringify(c.label)).join(',');
  const body = rows.map(r =>
    columns.map(c => {
      const v = r[c.key];
      if (v === null || v === undefined) return '';
      if (Array.isArray(v)) return JSON.stringify(v.join(', '));
      return JSON.stringify(String(v));
    }).join(',')
  ).join('\n');

  const csv = `${headers}\n${body}`;
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  triggerDownload(blob, `${filename || 'export'}-${todayStamp()}.csv`);
}

// ── Excel (XLSX) ──────────────────────────────────────────────────────────────

export async function exportXLSX(rows, columns, filename, sheetName) {
  const XLSX = await import('xlsx');
  const ws = XLSX.utils.aoa_to_sheet([
    columns.map(c => c.label),
    ...getValues(rows, columns),
  ]);

  // Auto-width columns
  const colWidths = columns.map((c, i) => {
    const maxLen = Math.max(
      c.label.length,
      ...rows.map(r => {
        const v = r[c.key];
        if (v === null || v === undefined) return 0;
        return String(Array.isArray(v) ? v.join(', ') : v).length;
      })
    );
    return { wch: Math.min(maxLen + 2, 40) };
  });
  ws['!cols'] = colWidths;

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName || 'Sheet1');
  XLSX.writeFile(wb, `${filename || 'export'}-${todayStamp()}.xlsx`);
}

// ── PDF ───────────────────────────────────────────────────────────────────────

export async function exportPDF(rows, columns, filename, title) {
  const { jsPDF } = await import('jspdf');
  const autoTable = (await import('jspdf-autotable')).default;

  const doc = new jsPDF({ orientation: columns.length > 6 ? 'landscape' : 'portrait', unit: 'mm', format: 'a4' });

  if (title) {
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text(title, 14, 15);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(150);
    doc.text(`Exported ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}`, 14, 21);
    doc.setTextColor(0);
  }

  autoTable(doc, {
    head: [columns.map(c => c.label)],
    body: getValues(rows, columns),
    startY: title ? 26 : 10,
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [8, 8, 248], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [245, 247, 250] },
    margin: { left: 14, right: 14 },
  });

  doc.save(`${filename || 'export'}-${todayStamp()}.pdf`);
}

// ── trigger download ──────────────────────────────────────────────────────────

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
