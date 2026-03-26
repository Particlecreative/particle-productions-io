import { useState, useEffect, useRef, useMemo } from 'react';
import {
  X, ExternalLink, Download, FileSignature, CheckCircle, Clock, Send,
  MessageCircle, Mail, Copy, Link2, Plus, AlertCircle, Upload, File,
  FolderOpen, ChevronLeft, ChevronRight, Eye, Edit3, PenTool, Printer,
} from 'lucide-react';
import {
  upsertContract, getContract, generateContractSignatures,
  getContractSignatures, uploadToDrive,
} from '../../lib/dataService';
import { getDownloadUrl } from '../../lib/invoiceUtils';
import { formatIST, nowISOString } from '../../lib/timezone';
import { useAuth } from '../../context/AuthContext';
import { useNotifications } from '../../context/NotificationsContext';
import clsx from 'clsx';
import jsPDF from 'jspdf';

// ── Constants ────────────────────────────────────────────────────
const HELLOSIGN_CAST = 'https://app.hellosign.com/prep-and-send/b0b7d49634c1963b10b86f62ed80aced3d9d9eae/recipients';
const HELLOSIGN_CREW = 'https://app.hellosign.com/prep-and-send/bc5114dd429e77ad9f54c5ae74a0f23f81cfc166/recipients';
const CAST_TYPES = ['Cast', 'Actor', 'Model', 'Talent', 'Actress'];

const PARTICLE_COMPANY = {
  name: 'Particle Aesthetic Science Ltd.',
  address: 'King George 48, Tel Aviv',
};

const STEPS = [
  { id: 1, label: 'Provider Details' },
  { id: 2, label: 'Contract Details' },
  { id: 3, label: 'Preview PDF' },
  { id: 4, label: 'Send for Signature' },
  { id: 5, label: 'Signing Status' },
];

// ── Step Indicator ───────────────────────────────────────────────
function StepIndicator({ currentStep, onStepClick, maxReachedStep }) {
  return (
    <div className="flex items-center gap-0 mb-5">
      {STEPS.map((step, i) => {
        const isActive = step.id === currentStep;
        const isDone = step.id < currentStep;
        const isClickable = step.id <= maxReachedStep;
        return (
          <div key={step.id} className="flex items-center flex-1 last:flex-none">
            <button
              type="button"
              onClick={() => isClickable && onStepClick(step.id)}
              disabled={!isClickable}
              className={clsx(
                'flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-[10px] font-bold transition-all whitespace-nowrap',
                isActive ? 'bg-blue-600 text-white shadow-sm' :
                isDone   ? 'bg-green-100 text-green-700 hover:bg-green-200 cursor-pointer' :
                isClickable ? 'bg-gray-100 text-gray-500 hover:bg-gray-200 cursor-pointer' :
                'bg-gray-50 text-gray-300 cursor-default'
              )}
            >
              <span className={clsx(
                'w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black',
                isActive ? 'bg-white/20 text-white' :
                isDone ? 'bg-green-500 text-white' :
                'bg-gray-200 text-gray-400'
              )}>
                {isDone ? <CheckCircle size={10} /> : step.id}
              </span>
              <span className="hidden sm:inline">{step.label}</span>
            </button>
            {i < STEPS.length - 1 && (
              <div className={clsx('flex-1 h-0.5 mx-1', isDone ? 'bg-green-300' : 'bg-gray-200')} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Event Timeline ───────────────────────────────────────────────
function EventTimeline({ events }) {
  if (!events || events.length === 0) return null;
  const EVENT_ICONS = {
    created:   { icon: Plus,        color: '#6b7280', label: 'Contract Created' },
    sent:      { icon: Send,        color: '#2563eb', label: 'Contract Sent' },
    signed:    { icon: FileSignature, color: '#16a34a', label: 'Signed' },
    completed: { icon: CheckCircle, color: '#16a34a', label: 'All Parties Signed' },
    generated: { icon: Link2,       color: '#7c3aed', label: 'Signing Links Generated' },
    uploaded:  { icon: Upload,      color: '#0ea5e9', label: 'File Uploaded' },
  };
  return (
    <div className="mt-5 pt-4 border-t border-gray-100">
      <div className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3">Document History</div>
      <div className="space-y-2">
        {events.map((ev, i) => {
          const meta = EVENT_ICONS[ev.type] || { icon: Clock, color: '#9ca3af', label: ev.type };
          const Icon = meta.icon;
          return (
            <div key={i} className="flex items-start gap-3">
              <div className="shrink-0 w-6 h-6 rounded-full flex items-center justify-center" style={{ background: meta.color + '18' }}>
                <Icon size={12} style={{ color: meta.color }} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold text-gray-700">
                  {meta.label}
                  {ev.role && <span className="text-gray-400 font-normal ml-1">({ev.role === 'hocp' ? 'Particle HOCP' : 'Provider'})</span>}
                  {ev.name && <span className="text-gray-400 font-normal ml-1">- {ev.name}</span>}
                </div>
                {ev.at && <div className="text-[10px] text-gray-400">{formatIST(ev.at)}</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Signing Links Display ────────────────────────────────────────
function SigningLinks({ signingLinks, onCopy, productionName }) {
  if (!signingLinks) return null;
  return (
    <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 mb-4">
      <div className="flex items-center gap-2 mb-3">
        <Link2 size={14} className="text-purple-600" />
        <div className="text-sm font-bold text-purple-800">E-Signature Links</div>
      </div>
      {['provider', 'hocp'].map(role => {
        const link = signingLinks[role];
        if (!link) return null;
        return (
          <div key={role} className="flex items-center justify-between bg-white rounded-lg px-3 py-2.5 border border-purple-100 mb-2 last:mb-0">
            <div className="min-w-0 flex-1">
              <div className="text-[10px] font-bold text-purple-500 uppercase">
                {role === 'hocp' ? 'Particle HOCP' : 'Service Provider'}
              </div>
              <div className="text-sm font-semibold text-gray-800 truncate">{link.name}</div>
              <div className="text-xs text-gray-500 truncate">{link.email}</div>
            </div>
            <div className="flex items-center gap-2 shrink-0 ml-3">
              <button
                type="button"
                onClick={() => { navigator.clipboard.writeText(link.url); onCopy?.(`${role} link copied!`); }}
                className="text-xs text-purple-600 hover:text-purple-800 px-2 py-1 rounded border border-purple-200 hover:bg-purple-50 flex items-center gap-1"
              >
                <Copy size={10} /> Copy
              </button>
              <button
                type="button"
                onClick={() => {
                  const text = `Please sign the contract using this link:\n${link.url}`;
                  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
                }}
                className="text-xs text-green-600 hover:text-green-800 px-2 py-1 rounded border border-green-200 hover:bg-green-50 flex items-center gap-1"
              >
                <MessageCircle size={10} /> WhatsApp
              </button>
              <button
                type="button"
                onClick={() => {
                  const subject = encodeURIComponent(`Contract for ${productionName || 'Production'} — ${link.name}`);
                  const body = encodeURIComponent(
                    `Hi ${link.name},\n\nPlease review and sign the attached contract.\nClick here to sign: ${link.url}\n\nThank you.`
                  );
                  window.open(`https://mail.google.com/mail/?view=cm&to=${encodeURIComponent(link.email)}&su=${subject}&body=${body}`, '_blank');
                }}
                className="text-xs text-blue-600 hover:text-blue-800 px-2 py-1 rounded border border-blue-200 hover:bg-blue-50 flex items-center gap-1"
              >
                <Mail size={10} /> Email
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── PDF Generation ───────────────────────────────────────────────
function generateContractPDF(data) {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 20;
  const contentWidth = pageWidth - margin * 2;
  let y = 20;

  function addPageIfNeeded(needed = 30) {
    if (y + needed > 270) {
      doc.addPage();
      y = 20;
    }
  }

  function drawWrappedText(text, x, startY, maxWidth, lineHeight = 6) {
    const lines = doc.splitTextToSize(text || '', maxWidth);
    lines.forEach(line => {
      addPageIfNeeded(lineHeight);
      doc.text(line, x, startY);
      startY += lineHeight;
    });
    return startY;
  }

  // ── Header / Letterhead ──
  doc.setFillColor(3, 11, 46); // Particle dark navy
  doc.rect(0, 0, pageWidth, 35, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  doc.text('PARTICLE', margin, 18);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text('for men', margin + 52, 18);
  doc.setFontSize(9);
  doc.text(PARTICLE_COMPANY.name, pageWidth - margin, 14, { align: 'right' });
  doc.text(PARTICLE_COMPANY.address, pageWidth - margin, 20, { align: 'right' });
  if (data.effective_date) {
    doc.text(`Date: ${data.effective_date}`, pageWidth - margin, 26, { align: 'right' });
  }

  y = 45;
  doc.setTextColor(3, 11, 46);

  // ── Title ──
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('SERVICES AGREEMENT', pageWidth / 2, y, { align: 'center' });
  y += 12;

  // ── Effective Date ──
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`This Services Agreement (the "Agreement") is entered into as of ${data.effective_date || '___________'}`, margin, y);
  y += 8;
  doc.text('by and between:', margin, y);
  y += 10;

  // ── Parties ──
  doc.setFont('helvetica', 'bold');
  doc.text('Company:', margin, y);
  doc.setFont('helvetica', 'normal');
  doc.text(`${PARTICLE_COMPANY.name}, ${PARTICLE_COMPANY.address}`, margin + 30, y);
  y += 7;

  doc.setFont('helvetica', 'bold');
  doc.text('Provider:', margin, y);
  doc.setFont('helvetica', 'normal');
  const providerLine = [data.provider_name, data.provider_id_number ? `ID: ${data.provider_id_number}` : '', data.provider_address].filter(Boolean).join(', ');
  doc.text(providerLine || '___________', margin + 30, y);
  y += 7;

  if (data.provider_email) {
    doc.text(`Email: ${data.provider_email}`, margin + 30, y);
    y += 7;
  }
  y += 5;

  // ── Production Info ──
  if (data.production_name) {
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text(`Production: ${data.production_name}`, margin, y);
    y += 10;
  }

  // ── Agreement Body ──
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  const bodyText = `The Company hereby engages the Provider to perform the services described in Exhibit A below, subject to the terms and conditions set forth in this Agreement. The Provider shall perform the services in a professional and workmanlike manner, in accordance with industry standards and the Company's reasonable instructions.`;
  y = drawWrappedText(bodyText, margin, y, contentWidth);
  y += 5;

  const bodyText2 = `The Provider represents that they are an independent contractor, not an employee of the Company. The Provider shall be solely responsible for all taxes, insurance, and other obligations arising from the compensation received under this Agreement.`;
  y = drawWrappedText(bodyText2, margin, y, contentWidth);
  y += 5;

  const bodyText3 = `All intellectual property, creative works, and deliverables produced under this Agreement shall be the exclusive property of the Company. The Provider hereby assigns all rights, title, and interest in such works to the Company.`;
  y = drawWrappedText(bodyText3, margin, y, contentWidth);
  y += 5;

  const bodyText4 = `The Provider shall maintain strict confidentiality regarding all proprietary information, trade secrets, and business information of the Company, both during and after the term of this Agreement.`;
  y = drawWrappedText(bodyText4, margin, y, contentWidth);
  y += 10;

  // ── EXHIBIT A ──
  addPageIfNeeded(40);
  doc.setFillColor(240, 243, 255);
  doc.rect(margin, y - 4, contentWidth, 10, 'F');
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(37, 99, 235);
  doc.text('EXHIBIT A — Services & Instructions', margin + 3, y + 3);
  y += 14;

  doc.setTextColor(3, 11, 46);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  if (data.exhibit_a) {
    y = drawWrappedText(data.exhibit_a, margin, y, contentWidth);
  } else {
    doc.text('[No services description provided]', margin, y);
    y += 6;
  }
  y += 10;

  // ── EXHIBIT B ──
  addPageIfNeeded(40);
  doc.setFillColor(240, 253, 244);
  doc.rect(margin, y - 4, contentWidth, 10, 'F');
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(22, 163, 74);
  doc.text('EXHIBIT B — Fees & Payment', margin + 3, y + 3);
  y += 14;

  doc.setTextColor(3, 11, 46);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');

  if (data.fee_amount) {
    doc.setFont('helvetica', 'bold');
    doc.text(`Total Fee: ${data.currency || 'USD'} ${Number(data.fee_amount).toLocaleString()}`, margin, y);
    doc.setFont('helvetica', 'normal');
    y += 8;
  }

  if (data.payment_terms) {
    doc.text('Payment Terms:', margin, y);
    y += 6;
    y = drawWrappedText(data.payment_terms, margin, y, contentWidth);
  }

  if (data.payment_method) {
    y += 4;
    doc.text(`Payment Method: ${data.payment_method}`, margin, y);
    y += 6;
  }

  if (data.exhibit_b) {
    y += 2;
    y = drawWrappedText(data.exhibit_b, margin, y, contentWidth);
  }

  y += 15;

  // ── Signature Blocks ──
  addPageIfNeeded(60);
  doc.setFillColor(248, 250, 252);
  doc.rect(margin, y - 4, contentWidth, 55, 'F');
  doc.setDrawColor(200, 200, 200);
  doc.rect(margin, y - 4, contentWidth, 55, 'S');

  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(3, 11, 46);
  doc.text('SIGNATURES', margin + 3, y + 3);
  y += 12;

  const halfWidth = (contentWidth - 10) / 2;

  // Company signature block
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text('For the Company:', margin + 3, y);
  doc.setFont('helvetica', 'normal');
  y += 6;
  doc.text(PARTICLE_COMPANY.name, margin + 3, y);
  y += 6;
  doc.text(`Name: ${data.hocp_name || '___________'}`, margin + 3, y);
  y += 6;
  doc.setDrawColor(150, 150, 150);
  doc.line(margin + 3, y + 2, margin + halfWidth - 5, y + 2);
  doc.text('Signature', margin + 3, y + 8);
  y += 10;
  doc.text(`Date: ${data.effective_date || '___________'}`, margin + 3, y);

  // Provider signature block
  let yRight = y - 28;
  const rightX = margin + halfWidth + 10;
  doc.setFont('helvetica', 'bold');
  doc.text('Service Provider:', rightX, yRight);
  doc.setFont('helvetica', 'normal');
  yRight += 6;
  doc.text(data.provider_name || '___________', rightX, yRight);
  yRight += 6;
  doc.text(`ID: ${data.provider_id_number || '___________'}`, rightX, yRight);
  yRight += 6;
  doc.line(rightX, yRight + 2, rightX + halfWidth - 10, yRight + 2);
  doc.text('Signature', rightX, yRight + 8);
  yRight += 10;
  doc.text(`Date: ___________`, rightX, yRight);

  // ── Footer ──
  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(150, 150, 150);
    doc.text(
      `${PARTICLE_COMPANY.name} | ${PARTICLE_COMPANY.address} | Page ${i} of ${pageCount}`,
      pageWidth / 2, 290, { align: 'center' }
    );
  }

  return doc;
}

// ════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ════════════════════════════════════════════════════════════════════
export default function ContractModal({ production, lineItem, onClose }) {
  const { isEditor, user } = useAuth();
  const { addNotification } = useNotifications();
  const contractKey = lineItem ? `${production.id}_li_${lineItem.id}` : production.id;
  const fileInputRef = useRef(null);
  const pdfPreviewRef = useRef(null);

  const existing = getContract(contractKey);

  // ── Step navigation ──
  const [currentStep, setCurrentStep] = useState(1);
  const [maxReachedStep, setMaxReachedStep] = useState(1);

  // ── Step 1: Provider Details ──
  const [providerName, setProviderName] = useState(existing?.provider_name || lineItem?.full_name || '');
  const [providerEmail, setProviderEmail] = useState(existing?.provider_email || lineItem?.supplier_email || '');
  const [providerIdNumber, setProviderIdNumber] = useState(existing?.provider_id_number || lineItem?.id_number || '');
  const [providerAddress, setProviderAddress] = useState(existing?.provider_address || '');

  // ── Step 2: Exhibits ──
  const defaultExhibitA = useMemo(() => {
    const parts = [`Services for ${production.project_name || 'Production'}`];
    if (production.production_type) parts.push(production.production_type);
    if (production.planned_start && production.planned_end) {
      parts.push(`Timeline: ${production.planned_start} to ${production.planned_end}`);
    }
    if (production.shoot_dates?.length > 0) {
      parts.push(`Shoot dates: ${production.shoot_dates.join(', ')}`);
    }
    if (lineItem?.item) parts.push(`Role: ${lineItem.item}`);
    return parts.join('. ') + '.';
  }, [production, lineItem]);

  const [exhibitA, setExhibitA] = useState(existing?.exhibit_a || defaultExhibitA);
  const [feeAmount, setFeeAmount] = useState(existing?.fee_amount || lineItem?.planned_budget || '');
  const [currency, setCurrency] = useState(lineItem?.currency_code || 'USD');
  const [paymentTerms, setPaymentTerms] = useState(existing?.payment_terms || '50% upon signing, 50% upon delivery');
  const [paymentMethod, setPaymentMethod] = useState(lineItem?.payment_method || '');
  const [exhibitB, setExhibitB] = useState(existing?.exhibit_b || '');

  // ── Step 3: PDF Preview ──
  const [pdfDataUrl, setPdfDataUrl] = useState(null);

  // ── Step 4 & 5: Signing ──
  const [status, setStatus] = useState(existing?.status || 'pending');
  const [events, setEvents] = useState(existing?.events || []);
  const [signingLinks, setSigningLinks] = useState(null);
  const [signatures, setSignatures] = useState([]);
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState('');
  const [copyMsg, setCopyMsg] = useState('');

  // ── Legacy fields ──
  const [pdfUrl, setPdfUrl] = useState(existing?.pdf_url || '');
  const [externalUrl, setExternalUrl] = useState(existing?.drive_url || existing?.dropbox_url || '');
  const [showDropboxFallback, setShowDropboxFallback] = useState(false);

  // Load signatures if contract exists
  useEffect(() => {
    async function loadSigs() {
      try {
        const data = await getContractSignatures(contractKey);
        if (data?.signatures) setSignatures(data.signatures);
        if (data?.contract?.events) setEvents(data.contract.events);
        const unsigned = data?.signatures?.filter(s => !s.signed_at && s.sign_url);
        if (unsigned?.length > 0) {
          const links = {};
          unsigned.forEach(s => {
            links[s.signer_role] = { url: s.sign_url, name: s.signer_name, email: s.signer_email };
          });
          setSigningLinks(links);
        }
        // If contract has been generated/sent, jump to appropriate step
        if (data?.contract?.status === 'signed') {
          setCurrentStep(5);
          setMaxReachedStep(5);
        } else if (data?.signatures?.length > 0) {
          setCurrentStep(5);
          setMaxReachedStep(5);
        }
      } catch (e) { /* ignore */ }
    }
    loadSigs();
  }, [contractKey]);

  function handleCopyMsg(msg) {
    setCopyMsg(msg);
    setTimeout(() => setCopyMsg(''), 2000);
  }

  // ── Navigate steps ──
  function goNext() {
    if (currentStep === 3) {
      // Generate PDF preview before showing step 3
      handleGeneratePdfPreview();
    }
    const next = Math.min(currentStep + 1, 5);
    setCurrentStep(next);
    setMaxReachedStep(Math.max(maxReachedStep, next));
  }

  function goBack() {
    setCurrentStep(Math.max(currentStep - 1, 1));
  }

  function goToStep(step) {
    if (step === 3 || step === 4) {
      handleGeneratePdfPreview();
    }
    setCurrentStep(step);
    setMaxReachedStep(Math.max(maxReachedStep, step));
  }

  // ── PDF Preview Generation ──
  function handleGeneratePdfPreview() {
    const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    const effectiveDate = production.planned_start
      ? new Date(production.planned_start).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
      : today;

    const doc = generateContractPDF({
      effective_date: effectiveDate,
      provider_name: providerName,
      provider_email: providerEmail,
      provider_id_number: providerIdNumber,
      provider_address: providerAddress,
      production_name: production.project_name,
      exhibit_a: exhibitA,
      exhibit_b: exhibitB,
      fee_amount: feeAmount,
      currency,
      payment_terms: paymentTerms,
      payment_method: paymentMethod,
      hocp_name: user?.name || 'Tomer Wilf Lezmy',
    });

    const dataUrl = doc.output('datauristring');
    setPdfDataUrl(dataUrl);
  }

  // ── Generate E-Sign Links ──
  async function handleGenerate() {
    if (!providerName.trim()) return alert('Enter provider name first');
    if (!providerEmail.trim()) return alert('Enter provider email first');

    setGenerating(true);
    setGenerateError('');
    try {
      // Save contract data first
      upsertContract({
        production_id: contractKey,
        provider_name: providerName,
        provider_email: providerEmail,
        exhibit_a: exhibitA,
        exhibit_b: exhibitB,
        fee_amount: feeAmount,
        payment_terms: paymentTerms,
        provider_id_number: providerIdNumber,
        provider_address: providerAddress,
        contract_pdf_base64: pdfDataUrl || '',
        status: 'pending',
      });

      const result = await generateContractSignatures(contractKey, {
        provider_name: providerName,
        provider_email: providerEmail,
        hocp_name: user?.name || 'Tomer Wilf Lezmy',
        hocp_email: user?.email || 'tomer@particleformen.com',
        exhibit_a: exhibitA,
        exhibit_b: exhibitB,
        fee_amount: feeAmount,
        payment_terms: paymentTerms,
      });

      if (result?.signing_links) {
        setSigningLinks(result.signing_links);
        setStatus('pending');
        const newEvents = [...events, { type: 'generated', at: new Date().toISOString() }];
        setEvents(newEvents);
        addNotification('contract_generated', `E-sign links generated for ${production.project_name}`, production.id);
      }
    } catch (e) {
      const msg = e?.message || 'Failed to generate signing links. Make sure the backend is running.';
      setGenerateError(msg);
    } finally {
      setGenerating(false);
    }
  }

  // ── Send contract ──
  function handleSendContract() {
    const now = nowISOString();
    const newEvents = [...events, { type: 'sent', at: now }];
    upsertContract({
      production_id: contractKey,
      provider_name: providerName,
      provider_email: providerEmail,
      status: 'sent',
      sent_at: now,
      exhibit_a: exhibitA,
      exhibit_b: exhibitB,
      fee_amount: feeAmount,
      payment_terms: paymentTerms,
      events: newEvents,
    });
    setEvents(newEvents);
    setStatus('sent');
    addNotification('contract_sent', `Contract sent for ${production.project_name}`, production.id);

    // Open Gmail compose
    const providerLink = signingLinks?.provider?.url || '';
    const subject = encodeURIComponent(`Contract for ${production.project_name} — ${providerName}`);
    const body = encodeURIComponent(
      `Hi ${providerName},\n\nPlease review and sign the attached contract.\n\nClick here to sign: ${providerLink}\n\nThank you,\n${user?.name || 'Tomer Wilf Lezmy'}\nParticle Aesthetic Science Ltd.`
    );
    const gmailUrl = `https://mail.google.com/mail/?view=cm&to=${encodeURIComponent(providerEmail)}&su=${subject}&body=${body}`;
    window.open(gmailUrl, '_blank');

    // Move to signing status step
    setCurrentStep(5);
    setMaxReachedStep(5);
  }

  // ── Download PDF ──
  function handleDownloadPdf() {
    if (!pdfDataUrl) handleGeneratePdfPreview();
    const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    const effectiveDate = production.planned_start
      ? new Date(production.planned_start).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
      : today;

    const doc = generateContractPDF({
      effective_date: effectiveDate,
      provider_name: providerName,
      provider_email: providerEmail,
      provider_id_number: providerIdNumber,
      provider_address: providerAddress,
      production_name: production.project_name,
      exhibit_a: exhibitA,
      exhibit_b: exhibitB,
      fee_amount: feeAmount,
      currency,
      payment_terms: paymentTerms,
      payment_method: paymentMethod,
      hocp_name: user?.name || 'Tomer Wilf Lezmy',
    });
    doc.save(`Contract_${production.project_name}_${providerName}.pdf`);
  }

  const isSigned = status === 'signed';

  // ── Validation for step navigation ──
  const canProceedStep1 = providerName.trim() && providerEmail.trim();
  const canProceedStep2 = exhibitA.trim() && feeAmount;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-panel"
        style={{ maxHeight: '92vh', overflowY: 'auto', maxWidth: 680, width: '100%' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <FileSignature size={18} style={{ color: 'var(--brand-primary)' }} />
            <h2 className="text-lg font-black" style={{ color: 'var(--brand-primary)' }}>Contract</h2>
            {lineItem?.full_name && <span className="text-sm text-gray-400">— {lineItem.full_name}</span>}
          </div>
          <button onClick={onClose}><X size={18} className="text-gray-400" /></button>
        </div>

        {/* Toast */}
        {copyMsg && (
          <div className="text-xs text-green-600 bg-green-50 border border-green-200 rounded-lg px-3 py-1.5 mb-3 text-center">
            {copyMsg}
          </div>
        )}

        {/* Step Indicator */}
        <StepIndicator
          currentStep={currentStep}
          onStepClick={goToStep}
          maxReachedStep={maxReachedStep}
        />

        {/* ═══════════════════════════════════════════════════
            STEP 1: Service Provider Details
        ═══════════════════════════════════════════════════ */}
        {currentStep === 1 && (
          <div>
            {/* Particle info — read-only */}
            <div className="bg-gray-50 rounded-xl p-3 mb-4 text-sm">
              <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-2">Particle Details (Company)</div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-[10px] text-gray-400">Company</div>
                  <div className="font-semibold text-gray-700 text-xs">{PARTICLE_COMPANY.name}</div>
                  <div className="text-[10px] text-gray-400">{PARTICLE_COMPANY.address}</div>
                </div>
                <div>
                  <div className="text-[10px] text-gray-400">Signer (HOCP)</div>
                  <div className="font-semibold text-gray-700 text-xs">{user?.name || 'Tomer Wilf Lezmy'}</div>
                  <div className="text-[10px] text-gray-400">{user?.email || 'tomer@particleformen.com'}</div>
                </div>
              </div>
            </div>

            {/* Provider fields */}
            <div className="space-y-3 mb-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                  Service Provider Name *
                </label>
                <input
                  className="brand-input"
                  value={providerName}
                  onChange={e => setProviderName(e.target.value)}
                  placeholder="Full name of service provider"
                  disabled={isSigned}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                  Service Provider Email *
                </label>
                <input
                  type="email"
                  className="brand-input"
                  value={providerEmail}
                  onChange={e => setProviderEmail(e.target.value)}
                  placeholder="provider@example.com"
                  disabled={isSigned}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                    ID / Passport Number
                  </label>
                  <input
                    className="brand-input"
                    value={providerIdNumber}
                    onChange={e => setProviderIdNumber(e.target.value)}
                    placeholder="ID or passport number"
                    disabled={isSigned}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                    Address
                  </label>
                  <input
                    className="brand-input"
                    value={providerAddress}
                    onChange={e => setProviderAddress(e.target.value)}
                    placeholder="Provider address"
                    disabled={isSigned}
                  />
                </div>
              </div>
            </div>

            {/* Navigation */}
            <div className="flex gap-3 mt-4">
              <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
              <button
                onClick={goNext}
                disabled={!canProceedStep1}
                className={clsx(
                  'flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-colors',
                  canProceedStep1
                    ? 'bg-blue-600 hover:bg-blue-700 text-white'
                    : 'bg-gray-100 text-gray-400 cursor-default'
                )}
              >
                Next: Contract Details <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════
            STEP 2: Contract Details — Exhibit A + Exhibit B
        ═══════════════════════════════════════════════════ */}
        {currentStep === 2 && (
          <div>
            {/* Exhibit A */}
            <div className="mb-5">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-2 h-2 rounded-full bg-blue-500" />
                <label className="text-sm font-bold text-blue-800">Exhibit A — Services & Instructions</label>
              </div>
              <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 mb-2">
                <div className="text-[10px] font-semibold text-blue-500 uppercase tracking-wide mb-1">
                  Auto-filled suggestion (editable)
                </div>
                <textarea
                  className="w-full bg-white border border-blue-200 rounded-lg p-3 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-300 resize-y"
                  rows={5}
                  value={exhibitA}
                  onChange={e => setExhibitA(e.target.value)}
                  placeholder="Describe the services, timeline, locations, deliverables..."
                  disabled={isSigned}
                />
              </div>
            </div>

            {/* Exhibit B */}
            <div className="mb-5">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-2 h-2 rounded-full bg-green-500" />
                <label className="text-sm font-bold text-green-800">Exhibit B — Fees & Payment</label>
              </div>
              <div className="bg-green-50 border border-green-100 rounded-xl p-3">
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div>
                    <label className="block text-[10px] font-semibold text-green-600 uppercase tracking-wide mb-1">
                      Fee Amount *
                    </label>
                    <div className="flex gap-2">
                      <select
                        className="brand-input w-20 text-xs"
                        value={currency}
                        onChange={e => setCurrency(e.target.value)}
                        disabled={isSigned}
                      >
                        <option value="USD">USD</option>
                        <option value="ILS">ILS</option>
                        <option value="EUR">EUR</option>
                        <option value="GBP">GBP</option>
                      </select>
                      <input
                        type="number"
                        className="brand-input flex-1"
                        value={feeAmount}
                        onChange={e => setFeeAmount(e.target.value)}
                        placeholder="0.00"
                        disabled={isSigned}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold text-green-600 uppercase tracking-wide mb-1">
                      Payment Method
                    </label>
                    <input
                      className="brand-input"
                      value={paymentMethod}
                      onChange={e => setPaymentMethod(e.target.value)}
                      placeholder="Bank Transfer, PayPal..."
                      disabled={isSigned}
                    />
                  </div>
                </div>
                <div className="mb-3">
                  <label className="block text-[10px] font-semibold text-green-600 uppercase tracking-wide mb-1">
                    Payment Milestones
                  </label>
                  <textarea
                    className="w-full bg-white border border-green-200 rounded-lg p-3 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-green-300 resize-y"
                    rows={2}
                    value={paymentTerms}
                    onChange={e => setPaymentTerms(e.target.value)}
                    placeholder="e.g., 50% upon signing, 50% upon delivery"
                    disabled={isSigned}
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-green-600 uppercase tracking-wide mb-1">
                    Additional Notes
                  </label>
                  <textarea
                    className="w-full bg-white border border-green-200 rounded-lg p-3 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-green-300 resize-y"
                    rows={2}
                    value={exhibitB}
                    onChange={e => setExhibitB(e.target.value)}
                    placeholder="Any additional payment terms or conditions..."
                    disabled={isSigned}
                  />
                </div>
              </div>
            </div>

            {/* Navigation */}
            <div className="flex gap-3 mt-4">
              <button onClick={goBack} className="btn-secondary flex items-center gap-1">
                <ChevronLeft size={14} /> Back
              </button>
              <div className="flex-1" />
              <button
                onClick={() => { handleGeneratePdfPreview(); goNext(); }}
                disabled={!canProceedStep2}
                className={clsx(
                  'flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold transition-colors',
                  canProceedStep2
                    ? 'bg-blue-600 hover:bg-blue-700 text-white'
                    : 'bg-gray-100 text-gray-400 cursor-default'
                )}
              >
                <Eye size={14} /> Preview PDF <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════
            STEP 3: Preview PDF
        ═══════════════════════════════════════════════════ */}
        {currentStep === 3 && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm font-bold text-gray-700">Contract PDF Preview</div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => { setCurrentStep(2); }}
                  className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1 px-2 py-1 rounded border border-blue-200 hover:bg-blue-50"
                >
                  <Edit3 size={10} /> Edit Contract
                </button>
                <button
                  onClick={handleDownloadPdf}
                  className="text-xs text-gray-600 hover:text-gray-800 flex items-center gap-1 px-2 py-1 rounded border border-gray-200 hover:bg-gray-50"
                >
                  <Download size={10} /> Download PDF
                </button>
              </div>
            </div>

            {/* PDF Embed */}
            {pdfDataUrl ? (
              <div className="border border-gray-200 rounded-xl overflow-hidden mb-4" style={{ height: 450 }}>
                <iframe
                  ref={pdfPreviewRef}
                  src={pdfDataUrl}
                  className="w-full h-full"
                  title="Contract PDF Preview"
                />
              </div>
            ) : (
              <div className="flex items-center justify-center h-64 bg-gray-50 rounded-xl border border-gray-200 mb-4">
                <div className="text-center">
                  <File size={32} className="mx-auto mb-2 text-gray-300" />
                  <div className="text-sm text-gray-400">Generating preview...</div>
                  <button
                    onClick={handleGeneratePdfPreview}
                    className="mt-2 text-xs text-blue-600 hover:text-blue-800 underline"
                  >
                    Regenerate
                  </button>
                </div>
              </div>
            )}

            {/* Contract summary */}
            <div className="bg-gray-50 rounded-xl p-3 mb-4 text-xs">
              <div className="grid grid-cols-2 gap-2">
                <div><span className="text-gray-400">Provider:</span> <strong>{providerName}</strong></div>
                <div><span className="text-gray-400">Email:</span> <strong>{providerEmail}</strong></div>
                <div><span className="text-gray-400">Fee:</span> <strong>{currency} {Number(feeAmount).toLocaleString()}</strong></div>
                <div><span className="text-gray-400">Production:</span> <strong>{production.project_name}</strong></div>
              </div>
            </div>

            {/* Navigation */}
            <div className="flex gap-3 mt-4">
              <button onClick={goBack} className="btn-secondary flex items-center gap-1">
                <ChevronLeft size={14} /> Back
              </button>
              <div className="flex-1" />
              <button
                onClick={() => {
                  if (!signingLinks) handleGenerate();
                  goNext();
                }}
                className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold bg-purple-600 hover:bg-purple-700 text-white transition-colors"
              >
                <Send size={14} /> Proceed to Send <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════
            STEP 4: Send for Signature
        ═══════════════════════════════════════════════════ */}
        {currentStep === 4 && (
          <div>
            {/* Generate signing links if not yet done */}
            {!signingLinks && !generating && (
              <div className="bg-purple-50 border border-purple-200 rounded-xl p-5 mb-4 text-center">
                <FileSignature size={28} className="mx-auto mb-3 text-purple-500" />
                <div className="text-sm font-bold text-purple-800 mb-2">Generate Signing Links</div>
                <div className="text-xs text-purple-600 mb-4">
                  Create unique signing links for both the Service Provider and Particle HOCP.
                </div>
                <button
                  onClick={handleGenerate}
                  disabled={generating || !providerName.trim() || !providerEmail.trim()}
                  className="px-6 py-2.5 rounded-xl text-sm font-semibold bg-purple-600 hover:bg-purple-700 text-white transition-colors"
                >
                  Generate E-Sign Links
                </button>
              </div>
            )}

            {generating && (
              <div className="flex items-center justify-center py-8">
                <div className="w-6 h-6 border-2 border-purple-300 border-t-purple-600 rounded-full animate-spin mr-3" />
                <span className="text-sm text-gray-500">Generating signing links...</span>
              </div>
            )}

            {generateError && (
              <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-4 text-xs text-red-700">
                <AlertCircle size={13} className="shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold">Generation failed</div>
                  <div className="text-red-600">{generateError}</div>
                  <button onClick={() => setGenerateError('')} className="text-red-500 hover:text-red-700 underline mt-1">
                    Dismiss
                  </button>
                </div>
              </div>
            )}

            {/* Signing links */}
            <SigningLinks signingLinks={signingLinks} onCopy={handleCopyMsg} productionName={production.project_name} />

            {signingLinks && (
              <>
                {/* Send contract button */}
                <button
                  onClick={handleSendContract}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold bg-blue-600 hover:bg-blue-700 text-white transition-colors mb-4"
                >
                  <Mail size={14} />
                  Send Contract via Gmail
                </button>

                {/* WhatsApp quick send */}
                {signingLinks.provider && (
                  <button
                    onClick={() => {
                      const text = `Hi ${providerName},\n\nPlease sign the contract for ${production.project_name}:\n${signingLinks.provider.url}\n\nThank you!`;
                      window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
                    }}
                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold bg-green-600 hover:bg-green-700 text-white transition-colors mb-4"
                  >
                    <MessageCircle size={14} />
                    Send via WhatsApp
                  </button>
                )}
              </>
            )}

            {/* Dropbox Sign fallback */}
            <div className="border-t border-gray-100 pt-3 mt-3">
              <button
                onClick={() => setShowDropboxFallback(!showDropboxFallback)}
                className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1"
              >
                <ExternalLink size={10} />
                {showDropboxFallback ? 'Hide' : 'Use'} Dropbox Sign (legacy)
              </button>
              {showDropboxFallback && (
                <div className="mt-3 bg-gray-50 rounded-xl p-3">
                  <div className="text-xs text-gray-500 mb-2">
                    Template: {CAST_TYPES.includes(lineItem?.type) ? 'Cast' : 'Crew'}
                  </div>
                  <button
                    onClick={() => {
                      const url = CAST_TYPES.includes(lineItem?.type) ? HELLOSIGN_CAST : HELLOSIGN_CREW;
                      window.open(url, '_blank');
                    }}
                    className="w-full flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-semibold bg-gray-200 hover:bg-gray-300 text-gray-700 transition-colors"
                  >
                    <ExternalLink size={12} /> Open Dropbox Sign
                  </button>
                </div>
              )}
            </div>

            {/* Navigation */}
            <div className="flex gap-3 mt-4">
              <button onClick={goBack} className="btn-secondary flex items-center gap-1">
                <ChevronLeft size={14} /> Back
              </button>
              <div className="flex-1" />
              <button
                onClick={goNext}
                className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold bg-blue-600 hover:bg-blue-700 text-white transition-colors"
              >
                Signing Status <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════
            STEP 5: Signing Status
        ═══════════════════════════════════════════════════ */}
        {currentStep === 5 && (
          <div>
            {/* Signature status badges */}
            {signatures.length > 0 ? (
              <div className="space-y-3 mb-5">
                {signatures.map((sig, i) => (
                  <div
                    key={i}
                    className={clsx(
                      'flex items-center justify-between p-3 rounded-xl border',
                      sig.signed_at
                        ? 'bg-green-50 border-green-200'
                        : 'bg-orange-50 border-orange-200'
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <div className={clsx(
                        'w-8 h-8 rounded-full flex items-center justify-center',
                        sig.signed_at ? 'bg-green-100' : 'bg-orange-100'
                      )}>
                        {sig.signed_at ? <CheckCircle size={16} className="text-green-600" /> : <Clock size={16} className="text-orange-500" />}
                      </div>
                      <div>
                        <div className="text-sm font-semibold text-gray-800">
                          {sig.signer_role === 'hocp' ? 'Particle HOCP' : 'Service Provider'}
                        </div>
                        <div className="text-xs text-gray-500">{sig.signer_name} ({sig.signer_email})</div>
                        {sig.signed_at && (
                          <div className="text-[10px] text-green-600">Signed {formatIST(sig.signed_at)}</div>
                        )}
                      </div>
                    </div>
                    {!sig.signed_at && sig.sign_url && (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => { navigator.clipboard.writeText(sig.sign_url); handleCopyMsg('Link copied!'); }}
                          className="text-xs text-purple-600 px-2 py-1 rounded border border-purple-200 hover:bg-purple-50 flex items-center gap-1"
                        >
                          <Copy size={10} /> Copy Link
                        </button>
                      </div>
                    )}
                  </div>
                ))}

                {/* Overall status */}
                {signatures.every(s => s.signed_at) && (
                  <div className="bg-green-100 border border-green-300 rounded-xl p-4 text-center">
                    <CheckCircle size={28} className="mx-auto mb-2 text-green-600" />
                    <div className="text-sm font-bold text-green-800">Contract Fully Signed!</div>
                    <div className="text-xs text-green-600 mt-1">All parties have signed. The contract is complete.</div>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-8 text-gray-400">
                <Clock size={32} className="mx-auto mb-3" />
                <div className="text-sm font-semibold mb-1">No signatures yet</div>
                <div className="text-xs">Generate signing links in Step 4 to start the signature process.</div>
                <button
                  onClick={() => goToStep(4)}
                  className="mt-3 text-xs text-blue-600 hover:text-blue-800 underline"
                >
                  Go to Send for Signature
                </button>
              </div>
            )}

            {/* Signing links (if still pending) */}
            <SigningLinks signingLinks={signingLinks} onCopy={handleCopyMsg} productionName={production.project_name} />

            {/* PDF and external URLs */}
            {(pdfUrl || externalUrl) && (
              <div className="bg-gray-50 rounded-xl p-3 mb-4">
                <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-2">Documents</div>
                {pdfUrl && (
                  <div className="flex items-center gap-2 text-xs mb-1">
                    <File size={12} className="text-blue-500" />
                    <a href={pdfUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline truncate flex-1">{pdfUrl}</a>
                  </div>
                )}
                {externalUrl && externalUrl !== pdfUrl && (
                  <div className="flex items-center gap-2 text-xs">
                    <FolderOpen size={12} className="text-green-500" />
                    <a href={externalUrl} target="_blank" rel="noopener noreferrer" className="text-green-600 hover:underline truncate flex-1">{externalUrl}</a>
                  </div>
                )}
              </div>
            )}

            {/* Timestamps */}
            {(existing?.sent_at || existing?.signed_at) && (
              <div className="flex gap-4 text-xs text-gray-400 mb-4 bg-gray-50 rounded-xl px-4 py-2.5">
                {existing?.sent_at && <span>Sent: <strong className="text-gray-600">{formatIST(existing.sent_at)}</strong></span>}
                {existing?.signed_at && <span>Signed: <strong className="text-green-600">{formatIST(existing.signed_at)}</strong></span>}
              </div>
            )}

            {/* Download generated PDF */}
            <button
              onClick={handleDownloadPdf}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold bg-gray-100 hover:bg-gray-200 text-gray-700 transition-colors mb-3"
            >
              <Download size={14} /> Download Contract PDF
            </button>

            {/* Event Timeline */}
            <EventTimeline events={events} />

            {/* Navigation */}
            <div className="flex gap-3 mt-4">
              <button onClick={goBack} className="btn-secondary flex items-center gap-1">
                <ChevronLeft size={14} /> Back
              </button>
              <div className="flex-1" />
              <button onClick={onClose} className="btn-secondary">Close</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
