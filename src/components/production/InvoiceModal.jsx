import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, MessageCircle, Mail, Send, Printer } from 'lucide-react';
import { getLineItems, getProduction, getSuppliers, createInvoice, updateLineItem, generateId, createReceipt } from '../../lib/dataService';
import FileUploadButton from '../shared/FileUploadButton';
import { useNotifications } from '../../context/NotificationsContext';
import { nowISOString } from '../../lib/timezone';

const DEALER_BADGE = {
  osek_patur:  { label: 'Osek Patur', color: '#6b7280' },
  osek_murshe: { label: 'Osek Murshe', color: '#2563eb' },
  ltd:         { label: 'Ltd.', color: '#7c3aed' },
  foreign:     { label: 'Foreign', color: '#d97706' },
};

const INV_TYPE_LABELS = {
  cheshbon_iska:        'חשבון עסקה (Business Invoice)',
  receipt:              'קבלה (Receipt)',
  tax_invoice:          'חשבונית מס (Tax Invoice)',
  tax_invoice_receipt:  'חשבונית מס/קבלה (Combined)',
  sachar_omanim:        'שכר אומנים (Artist Fee)',
  American:             'American Invoice',
  proforma:             'Proforma',
  Other:                'Other',
};

const INVOICE_TEMPLATE_EN = (prodName, amount, itemId, brandName) =>
`Dear Team,

We hope this message finds you well.

Please send us a formal invoice for services rendered on the following production:

Production: ${prodName}
Reference: ${itemId}
Amount: $${amount ? amount.toLocaleString() : 'as agreed'}
Payment Terms: Net 30 days from invoice date

Please send the invoice at your earliest convenience to ensure timely processing.

Thank you,
${brandName}
Production Team`;

const INVOICE_TEMPLATE_HE = (prodName, amount, itemId, brandName) =>
`שלום רב,

נבקש להפיק חשבונית עבור השירותים שניתנו בהפקה הבאה:

הפקה: ${prodName}
מספר הפניה: ${itemId}
סכום: ₪${amount ? amount.toLocaleString() : 'לפי הסכם'}
תנאי תשלום: שוטף + 30 מיום החשבונית

נודה לשליחת החשבונית בהקדם לצורך עיבוד התשלום.

תודה רבה,
${brandName}
צוות הפקה`;

const INVOICE_TEMPLATE = (prodName, amount, itemId, brandName, locale = 'en') =>
  locale === 'he'
    ? INVOICE_TEMPLATE_HE(prodName, amount, itemId, brandName)
    : INVOICE_TEMPLATE_EN(prodName, amount, itemId, brandName);

/**
 * InvoiceModal
 * Props:
 *  lineItemId    — ID of the line item
 *  productionId  — ID of the production
 *  initialStep   — 'send' | 'receive'  (default: 'send')
 *  onClose       — callback
 */
export default function InvoiceModal({ lineItemId, productionId, initialStep = 'send', onClose }) {
  const { addNotification } = useNotifications();

  const brandName = document.documentElement.getAttribute('data-brand') === 'blurr'
    ? 'Blurr Creative' : 'Particle For Men';

  const [method, setMethod] = useState('email');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [invoiceUrl, setInvoiceUrl] = useState('');
  const [step, setStep] = useState(initialStep);
  const [sent, setSent] = useState(false);
  const [showPrint, setShowPrint] = useState(false);
  const [netDays, setNetDays] = useState(30);
  const [invoiceType, setInvoiceType] = useState('Israeli');
  const [messageText, setMessageText] = useState('');
  const [invoiceLocale, setInvoiceLocale] = useState(() => {
    try { return localStorage.getItem('cp_invoice_locale') || 'en'; } catch { return 'en'; }
  }); // 'en' | 'he'
  const [item, setItem] = useState(null);
  const [production, setProduction] = useState(null);
  const [dealerType, setDealerType] = useState(null);
  const [supplierFound, setSupplierFound] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    async function load() {
      const [items, prod, allSuppliers] = await Promise.all([
        Promise.resolve(getLineItems(productionId)),
        Promise.resolve(getProduction(productionId)),
        Promise.resolve(getSuppliers()),
      ]);
      const safeItems = Array.isArray(items) ? items : [];
      const found = safeItems.find(i => i.id === lineItemId) || null;
      setItem(found);
      setProduction(prod || null);

      if (found) {
        const supplier = (Array.isArray(allSuppliers) ? allSuppliers : []).find(
          s => s.full_name && found.full_name && s.full_name.toLowerCase() === found.full_name.toLowerCase()
        );
        const dt = supplier?.dealer_type || found.dealer_type || null;
        setDealerType(dt);

        // Auto-fill phone and email from supplier record
        if (supplier) {
          if (supplier.phone) setPhone(supplier.phone);
          if (supplier.email) setEmail(supplier.email);
          setSupplierFound(true);
        }

        // Set invoice type based on dealer type
        if (dt === 'osek_patur') setInvoiceType('receipt');
        else if (dt === 'osek_murshe' || dt === 'ltd') setInvoiceType('tax_invoice_receipt');
        else setInvoiceType('Israeli');

        const savedLocale = (() => { try { return localStorage.getItem('cp_invoice_locale') || 'en'; } catch { return 'en'; } })();
        setInvoiceLocale(savedLocale);
        setMessageText(INVOICE_TEMPLATE(
          productionId,
          found.actual_spent || found.planned_budget,
          lineItemId,
          brandName,
          savedLocale
        ));
      }
      setLoaded(true);
    }
    load();
  }, [lineItemId, productionId, brandName]);

  if (!loaded) return null;
  if (!item) return null;

  function handleWhatsApp() {
    if (!phone) { alert('Enter phone number first'); return; }
    const cleanPhone = phone.replace(/\D/g, '');
    window.open(`https://wa.me/${cleanPhone}?text=${encodeURIComponent(messageText)}`, '_blank');
    setSent(true);
  }

  function handleEmail() {
    const prodName = production?.project_name || productionId;
    const itemName = item?.item || lineItemId;
    const subject = encodeURIComponent(`Invoice Request — ${prodName} - ${itemName}`);
    // Open Gmail compose directly instead of default mail client
    const gmailUrl = `https://mail.google.com/mail/?view=cm&to=${encodeURIComponent(email)}&su=${subject}&body=${encodeURIComponent(messageText)}`;
    window.open(gmailUrl, '_blank');
    setSent(true);
  }

  async function handleReceived() {
    const dueDate = new Date(); dueDate.setDate(dueDate.getDate() + netDays);
    const paymentDue = dueDate.toISOString();
    const resolvedType = dealerType === 'osek_patur' ? 'receipt' : invoiceType;
    const invoice = {
      id: generateId('inv'),
      line_item_id: lineItemId,
      production_id: productionId,
      file_url: invoiceUrl,
      amount: item.actual_spent || item.planned_budget,
      date_received: nowISOString(),
      payment_due: paymentDue,
      net_days: netDays,
      invoice_type: resolvedType,
      dealer_type: dealerType,
      status: 'received',
      mismatch: false,
    };
    await Promise.resolve(createInvoice(invoice));
    await Promise.resolve(updateLineItem(lineItemId, {
      invoice_status: 'Received',
      invoice_url: invoiceUrl,
      payment_due: paymentDue,
      net_days: netDays,
      invoice_type: resolvedType,
      dealer_type: dealerType,
    }));
    addNotification('invoice_received', `Invoice received for ${item.item || 'line item'}`, productionId);
    onClose();
  }

  // Called externally (from Accounting / LedgerTab) when payment is confirmed for cheshbon_iska items
  // This is a standalone helper — not tied to modal state
  // (actual usage: Accounting.jsx + LedgerTab.jsx call createReceipt directly)

  const TABS = [
    { id: 'send',    label: '📤 Request Invoice' },
    { id: 'receive', label: '📥 Log Invoice' },
  ];

  return (
    <>
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal-panel" onClick={e => e.stopPropagation()}>
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-lg font-black" style={{ color: 'var(--brand-primary)' }}>
              Invoice
            </h2>
            <button onClick={onClose}><X size={18} className="text-gray-400" /></button>
          </div>

          <div className="flex items-center gap-2 mb-4 flex-wrap">
            <span className="text-sm font-semibold text-gray-600">
              {item.item || 'Line Item'} — {item.full_name || ''}
            </span>
            {dealerType && DEALER_BADGE[dealerType] && (
              <span
                className="text-xs font-semibold px-2 py-0.5 rounded-full"
                style={{ background: DEALER_BADGE[dealerType].color + '18', color: DEALER_BADGE[dealerType].color, border: `1px solid ${DEALER_BADGE[dealerType].color}40` }}
              >
                {DEALER_BADGE[dealerType].label}
              </span>
            )}
            {supplierFound && (
              <span
                className="text-xs font-semibold px-2 py-0.5 rounded-full"
                style={{ background: '#dcfce7', color: '#16a34a', border: '1px solid #bbf7d0' }}
              >
                &#10003; Supplier found
              </span>
            )}
          </div>

          {/* Step Toggle */}
          <div className="flex gap-2 mb-5">
            {TABS.map(t => (
              <button
                key={t.id}
                onClick={() => setStep(t.id)}
                className={`flex-1 py-2 rounded-lg text-sm font-semibold border transition-all ${
                  step === t.id
                    ? 'border-transparent text-white'
                    : 'border-gray-200 text-gray-500 bg-white'
                }`}
                style={step === t.id ? { background: 'var(--brand-accent)' } : {}}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* ── REQUEST TAB ── */}
          {step === 'send' && (
            <div>
              {/* Method Selector */}
              <div className="flex gap-2 mb-4">
                {['whatsapp', 'email', 'both'].map(m => (
                  <button
                    key={m}
                    onClick={() => setMethod(m)}
                    className={`flex-1 py-2 rounded-lg text-xs font-bold uppercase border transition-all ${
                      method === m ? 'border-transparent text-white' : 'border-gray-200 text-gray-500'
                    }`}
                    style={method === m ? { background: 'var(--brand-accent)' } : {}}
                  >
                    {m === 'whatsapp' ? '📱 WhatsApp' : m === 'email' ? '✉️ Email' : '⚡ Both'}
                  </button>
                ))}
              </div>

              {(method === 'whatsapp' || method === 'both') && (
                <div className="mb-3">
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Phone (with country code)</label>
                  <input
                    className="brand-input"
                    value={phone}
                    onChange={e => setPhone(e.target.value)}
                    placeholder="+972501234567"
                  />
                </div>
              )}

              {(method === 'email' || method === 'both') && (
                <div className="mb-3">
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Email</label>
                  <input
                    type="email"
                    className="brand-input"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="supplier@example.com"
                  />
                </div>
              )}

              {/* Language toggle */}
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs text-gray-500">Template language:</span>
                <button
                  type="button"
                  onClick={() => {
                    setInvoiceLocale('en');
                    try { localStorage.setItem('cp_invoice_locale', 'en'); } catch {}
                    setMessageText(INVOICE_TEMPLATE(productionId, item?.actual_spent || item?.planned_budget, lineItemId, brandName, 'en'));
                  }}
                  className={`px-2 py-1 rounded text-xs font-semibold border transition-colors ${invoiceLocale === 'en' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300'}`}
                >
                  🇺🇸 English
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setInvoiceLocale('he');
                    try { localStorage.setItem('cp_invoice_locale', 'he'); } catch {}
                    setMessageText(INVOICE_TEMPLATE(productionId, item?.actual_spent || item?.planned_budget, lineItemId, brandName, 'he'));
                  }}
                  className={`px-2 py-1 rounded text-xs font-semibold border transition-colors ${invoiceLocale === 'he' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300'}`}
                >
                  🇮🇱 עברית
                </button>
              </div>

              {/* Editable message textarea */}
              <textarea
                className="brand-input text-xs mb-4 resize-y"
                rows={8}
                value={messageText}
                onChange={e => setMessageText(e.target.value)}
                style={{ fontFamily: 'inherit', lineHeight: 1.5, direction: invoiceLocale === 'he' ? 'rtl' : 'ltr' }}
              />

              {sent && (
                <div className="text-xs text-green-600 bg-green-50 border border-green-200 rounded-lg p-2 mb-3">
                  Request sent! ✓
                </div>
              )}

              <div className="flex gap-2">
                {(method === 'whatsapp' || method === 'both') && (
                  <button onClick={handleWhatsApp} className="btn-cta flex-1 flex items-center justify-center gap-1">
                    <MessageCircle size={13} /> WhatsApp
                  </button>
                )}
                {(method === 'email' || method === 'both') && (
                  <button onClick={handleEmail} className="btn-cta flex-1 flex items-center justify-center gap-1">
                    <Mail size={13} /> Email
                  </button>
                )}
              </div>

              {sent && (
                <button
                  onClick={() => setStep('receive')}
                  className="btn-secondary w-full mt-3 text-sm"
                >
                  Request sent? → Log the Invoice now
                </button>
              )}
            </div>
          )}

          {/* ── LOG INVOICE TAB ── */}
          {step === 'receive' && (
            <div>
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1.5">
                  Invoice Link
                </label>
                <input
                  className="brand-input text-sm"
                  value={invoiceUrl}
                  onChange={e => setInvoiceUrl(e.target.value)}
                  placeholder="Paste Google Drive or Dropbox link…"
                  autoFocus
                />
                <p className="text-xs text-gray-400 mt-1">
                  Paste a link, or upload the file directly:
                </p>
                <div className="mt-2">
                  <FileUploadButton
                    category="invoices"
                    subfolder={`${new Date().getFullYear()}/${productionId}${production?.project_name ? ' ' + production.project_name : ''}`}
                    fileName={`Invoice - ${item.full_name || 'Supplier'} - ${item.item || 'Item'}.pdf`}
                    accept="application/pdf,image/*,.doc,.docx,.xls,.xlsx"
                    label="Upload Invoice"
                    onUploaded={(data) => {
                      const link = data?.drive?.viewLink || data?.dropbox?.link || '';
                      if (link) setInvoiceUrl(link);
                    }}
                  />
                </div>
              </div>

              {/* Payment Proof Upload */}
              <div className="mt-3">
                <label className="block text-sm font-bold text-gray-700 mb-1.5">
                  Payment Proof <span className="text-xs font-normal text-gray-400">(optional)</span>
                </label>
                <FileUploadButton
                  category="payment-proofs"
                  subfolder={`${new Date().getFullYear()}/${productionId}${production?.project_name ? ' ' + production.project_name : ''}`}
                  fileName={`Proof - ${item.full_name || 'Supplier'} - ${item.item || 'Item'}.pdf`}
                  accept="application/pdf,image/*"
                  label="Upload Payment Proof"
                  onUploaded={(data) => {
                    const link = data?.drive?.viewLink || data?.dropbox?.link || '';
                    if (link) {
                      // Store in notes for now (payment_proof_url field may not exist yet)
                      const existingNotes = item.notes || '';
                      const proofNote = `[Payment Proof: ${link}]`;
                      if (!existingNotes.includes('[Payment Proof:')) {
                        updateLineItem(lineItemId, { notes: existingNotes ? existingNotes + '\n' + proofNote : proofNote });
                      }
                    }
                  }}
                />
              </div>

              <div className="bg-gray-50 rounded-xl p-3 mt-3 text-xs text-gray-500">
                <div><strong>Amount on record:</strong> ${(parseFloat(item.actual_spent) || parseFloat(item.planned_budget) || 0).toLocaleString()}</div>
              </div>

              {/* Net+ days + Invoice type */}
              <div className="grid grid-cols-2 gap-3 mt-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Net + Days</label>
                  <input
                    type="number"
                    min={0}
                    className="brand-input"
                    value={netDays}
                    onChange={e => setNetDays(Math.max(0, +e.target.value))}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Invoice Type</label>
                  {dealerType === 'osek_patur' ? (
                    <div className="brand-input text-xs bg-gray-50 text-gray-500 flex items-center">
                      קבלה (Receipt only)
                    </div>
                  ) : (dealerType === 'osek_murshe' || dealerType === 'ltd') ? (
                    <select className="brand-input" value={invoiceType} onChange={e => setInvoiceType(e.target.value)}>
                      <option value="cheshbon_iska">חשבון עסקה</option>
                      <option value="tax_invoice_receipt">חשבונית מס/קבלה (Immediate)</option>
                      <option value="tax_invoice">חשבונית מס (Deferred)</option>
                    </select>
                  ) : (
                    <select className="brand-input" value={invoiceType} onChange={e => setInvoiceType(e.target.value)}>
                      <option value="cheshbon_iska">חשבון עסקה</option>
                      <option value="tax_invoice_receipt">חשבונית מס/קבלה</option>
                      <option value="sachar_omanim">שכר אומנים</option>
                      <option value="American">American Invoice</option>
                      <option value="receipt">קבלה (Receipt)</option>
                      <option value="proforma">Proforma</option>
                      <option value="Other">Other</option>
                    </select>
                  )}
                </div>
              </div>

              {(invoiceType === 'cheshbon_iska' || (dealerType === 'osek_murshe' && invoiceType !== 'tax_invoice_receipt')) && invoiceType === 'cheshbon_iska' && (
                <p className="text-xs text-orange-600 bg-orange-50 border border-orange-200 rounded-lg p-2 mt-2">
                  ⚠️ חשבון עסקה — a חשבונית מס/קבלה receipt will be required once payment is made.
                </p>
              )}

              <div className="text-xs text-gray-400 mt-2">
                Payment due:{' '}
                <strong className="text-gray-600">
                  {(() => { const d = new Date(); d.setDate(d.getDate() + netDays); return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }); })()}
                </strong>
              </div>

              <button
                onClick={handleReceived}
                className="btn-cta w-full mt-4 flex items-center justify-center gap-2"
              >
                <Send size={13} /> Save — Mark Invoice Received
              </button>

              <button
                onClick={() => setShowPrint(true)}
                className="btn-secondary w-full mt-2 flex items-center justify-center gap-2"
              >
                <Printer size={14} /> Print / Save as PDF
              </button>
            </div>
          )}
        </div>
      </div>

      {showPrint && createPortal(
        <PrintInvoiceModal
          item={item}
          production={production}
          productionId={productionId}
          brandName={brandName}
          onClose={() => setShowPrint(false)}
        />,
        document.body
      )}
    </>
  );
}

/* ─── Print Invoice Modal ─────────────────────────────────────────── */

function PrintInvoiceModal({ item, production, productionId, brandName, onClose }) {
  const today = new Date();
  const dateIssued = today.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const dateDue = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000)
    .toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const amount = (parseFloat(item.actual_spent) || parseFloat(item.planned_budget) || 0).toLocaleString();

  return (
    <div className="print-invoice-root" style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: '#fff', width: '100%', maxWidth: 680, borderRadius: 12, boxShadow: '0 20px 60px rgba(0,0,0,0.25)', overflow: 'hidden' }}>

        {/* Toolbar — hidden on print */}
        <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 20px', borderBottom: '1px solid #e5e7eb', background: '#f9fafb' }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>Invoice Request Document</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => window.print()}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', background: 'var(--brand-accent, #0808f8)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
            >
              <Printer size={14} /> Print / Save as PDF
            </button>
            <button
              onClick={onClose}
              style={{ padding: '7px 12px', background: '#fff', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 13, color: '#6b7280', cursor: 'pointer' }}
            >
              Close
            </button>
          </div>
        </div>

        {/* Invoice Document */}
        <div style={{ padding: '36px 48px', fontFamily: 'Georgia, serif', color: '#1a1a1a' }}>

          {/* Brand Header */}
          <div style={{ borderBottom: '3px solid var(--brand-primary, #0808f8)', paddingBottom: 16, marginBottom: 24 }}>
            <div style={{ fontSize: 26, fontWeight: 900, letterSpacing: '-0.5px', color: 'var(--brand-primary, #0808f8)', fontFamily: 'Arial, sans-serif' }}>
              {brandName}
            </div>
            <div style={{ fontSize: 11, letterSpacing: 3, textTransform: 'uppercase', color: '#6b7280', marginTop: 4, fontFamily: 'Arial, sans-serif' }}>
              Invoice Request
            </div>
          </div>

          {/* Ref / Dates */}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 28, fontFamily: 'Arial, sans-serif' }}>
            <div>
              <div style={{ fontSize: 11, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>Reference No.</div>
              <div style={{ fontSize: 14, fontWeight: 700, fontFamily: 'monospace', color: '#111' }}>{item.id}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 2 }}>Date Issued: <strong style={{ color: '#374151' }}>{dateIssued}</strong></div>
              <div style={{ fontSize: 11, color: '#9ca3af' }}>Payment Due: <strong style={{ color: '#374151' }}>{dateDue}</strong></div>
            </div>
          </div>

          {/* Bill To / Production */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginBottom: 28, fontFamily: 'Arial, sans-serif' }}>
            <div style={{ background: '#f9fafb', borderRadius: 8, padding: '14px 16px' }}>
              <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 1.5, color: '#9ca3af', marginBottom: 8 }}>Bill To</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#111', marginBottom: 4 }}>{item.full_name || '—'}</div>
              {item.item && <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 2 }}>{item.item}</div>}
              {item.business_type && <div style={{ fontSize: 11, color: '#9ca3af' }}>{item.business_type}</div>}
            </div>
            <div style={{ background: '#f9fafb', borderRadius: 8, padding: '14px 16px' }}>
              <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 1.5, color: '#9ca3af', marginBottom: 8 }}>Production</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#111', marginBottom: 4 }}>{production?.project_name || '—'}</div>
              <div style={{ fontSize: 12, color: '#6b7280', fontFamily: 'monospace' }}>{productionId}</div>
            </div>
          </div>

          {/* Amount Table */}
          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 24, fontFamily: 'Arial, sans-serif' }}>
            <thead>
              <tr style={{ background: 'var(--brand-primary, #0808f8)' }}>
                <th style={{ padding: '10px 14px', textAlign: 'left', color: '#fff', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 }}>Description</th>
                <th style={{ padding: '10px 14px', textAlign: 'right', color: '#fff', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 }}>Amount</th>
              </tr>
            </thead>
            <tbody>
              <tr style={{ background: '#f9fafb' }}>
                <td style={{ padding: '12px 14px', fontSize: 13, color: '#374151' }}>
                  {item.item || 'Professional Services'} — {item.type || 'Production'}
                  {item.notes ? <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 3 }}>{item.notes}</div> : null}
                </td>
                <td style={{ padding: '12px 14px', textAlign: 'right', fontSize: 13, color: '#374151' }}>${amount}</td>
              </tr>
              <tr style={{ borderTop: '2px solid #e5e7eb' }}>
                <td style={{ padding: '12px 14px', fontWeight: 800, fontSize: 14, fontFamily: 'Arial, sans-serif' }}>Total Due</td>
                <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 800, fontSize: 16, color: 'var(--brand-primary, #0808f8)' }}>${amount}</td>
              </tr>
            </tbody>
          </table>

          {/* Footer */}
          <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: 16, fontSize: 11, color: '#9ca3af', fontFamily: 'Arial, sans-serif', lineHeight: 1.7 }}>
            <strong style={{ color: '#6b7280' }}>Payment Terms:</strong> Net 30 days from invoice date. Please reference <strong style={{ fontFamily: 'monospace', color: '#374151' }}>{item.id}</strong> on your invoice to ensure timely processing.
          </div>

        </div>
      </div>
    </div>
  );
}
