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

// ── Branded report PDF ────────────────────────────────────────────────────────
//
// Usage:
//   exportBrandedReport({
//     title: 'Budget Overview — 2026',
//     brand: { name: 'Particle', accent: '#0808f8', primary: '#030b2e' },
//     currency: 'USD',
//     kpis: [{ label, value, sub, signal }],      // up to 6
//     sections: [{ heading, columns, rows }],      // one or more tables
//     filename: 'budget-overview-2026',
//   })

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  if (h.length === 3) {
    return [parseInt(h[0]+h[0],16), parseInt(h[1]+h[1],16), parseInt(h[2]+h[2],16)];
  }
  return [parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16)];
}

function lighten(rgb, amount = 0.88) {
  return rgb.map(c => Math.round(c + (255 - c) * amount));
}

function signalColor(signal) {
  if (signal === 'green')  return [22, 163, 74];
  if (signal === 'amber')  return [217, 119, 6];
  if (signal === 'red')    return [220, 38, 38];
  return [100, 116, 139]; // slate
}

export async function exportBrandedReport({ title, brand, currency, kpis = [], sections = [], filename }) {
  const { jsPDF } = await import('jspdf');
  const autoTable = (await import('jspdf-autotable')).default;

  const accent   = hexToRgb(brand?.accent  || '#6366f1');
  const primary  = hexToRgb(brand?.primary || '#030b2e');
  const accentLt = lighten(accent, 0.90);

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 14;

  // ── Header band ──────────────────────────────────────────────────────────
  doc.setFillColor(...accent);
  doc.rect(0, 0, pageW, 30, 'F');

  // Accent stripe on left edge
  doc.setFillColor(...lighten(accent, 0.3));
  doc.rect(0, 0, 4, 30, 'F');

  // Brand name
  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(255, 255, 255);
  doc.text((brand?.name || 'CP Panel').toUpperCase(), margin + 2, 13);

  // Report title
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(255, 255, 255);
  doc.text(title || 'Report', margin + 2, 21);

  // Date (right-aligned)
  const dateStr = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  doc.setFontSize(8);
  doc.text(dateStr, pageW - margin, 21, { align: 'right' });

  // Currency badge
  if (currency) {
    doc.setFontSize(7.5);
    doc.setTextColor(255, 255, 255);
    doc.text(`Currency: ${currency}`, pageW - margin, 13, { align: 'right' });
  }

  let y = 36;

  // ── KPI grid (up to 6, 3 per row) ───────────────────────────────────────
  if (kpis.length > 0) {
    const cols   = 3;
    const boxW   = (pageW - margin * 2 - (cols - 1) * 3) / cols;
    const boxH   = 22;
    const gap    = 3;

    kpis.forEach((kpi, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x   = margin + col * (boxW + gap);
      const by  = y + row * (boxH + gap);
      const sc  = signalColor(kpi.signal);

      // Box background
      doc.setFillColor(...accentLt);
      doc.roundedRect(x, by, boxW, boxH, 2, 2, 'F');

      // Signal stripe on top
      doc.setFillColor(...sc);
      doc.roundedRect(x, by, boxW, 2, 1, 1, 'F');

      // Label
      doc.setFontSize(7);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100, 116, 139);
      doc.text(kpi.label, x + 4, by + 8);

      // Value
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...sc);
      doc.text(String(kpi.value), x + 4, by + 15);

      // Sub
      if (kpi.sub) {
        doc.setFontSize(6.5);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(150, 150, 150);
        doc.text(String(kpi.sub), x + 4, by + 20);
      }
    });

    const rows = Math.ceil(kpis.length / cols);
    y += rows * (boxH + gap) + 4;
  }

  // ── Sections (tables) ────────────────────────────────────────────────────
  sections.forEach(section => {
    // Check if we need a new page
    if (y > pageH - 40) { doc.addPage(); y = 16; }

    // Section heading
    if (section.heading) {
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...primary);
      doc.text(section.heading, margin, y);

      // Underline
      doc.setDrawColor(...accent);
      doc.setLineWidth(0.4);
      doc.line(margin, y + 1.5, margin + doc.getTextWidth(section.heading) + 4, y + 1.5);
      y += 6;
    }

    if (section.columns && section.rows) {
      autoTable(doc, {
        head: [section.columns.map(c => c.label)],
        body: section.rows.map(r => section.columns.map(c => {
          const v = r[c.key];
          if (v === null || v === undefined) return '';
          return String(v);
        })),
        startY: y,
        margin: { left: margin, right: margin },
        styles: { fontSize: 7.5, cellPadding: 2.5, textColor: [30, 30, 50] },
        headStyles: {
          fillColor: accent,
          textColor: [255, 255, 255],
          fontStyle: 'bold',
          fontSize: 7.5,
        },
        alternateRowStyles: { fillColor: accentLt },
        columnStyles: section.columnStyles || {},
        didDrawPage: (data) => { y = data.cursor.y + 2; },
      });
      y = doc.lastAutoTable.finalY + 8;
    }
  });

  // ── Footer ────────────────────────────────────────────────────────────────
  const totalPages = doc.internal.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setDrawColor(...accent);
    doc.setLineWidth(0.3);
    doc.line(margin, pageH - 10, pageW - margin, pageH - 10);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(150, 150, 150);
    doc.text(
      `${brand?.name || 'CP Panel'} · ${title || 'Report'} · ${dateStr}`,
      margin, pageH - 6
    );
    doc.text(`Page ${p} of ${totalPages}`, pageW - margin, pageH - 6, { align: 'right' });
  }

  doc.save(`${filename || 'report'}-${todayStamp()}.pdf`);
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
