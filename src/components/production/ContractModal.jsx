import { useState, useEffect, useRef, useMemo } from 'react';
import {
  X, Download, FileSignature, CheckCircle, Clock, Send,
  MessageCircle, Mail, Copy, Link2, Plus, AlertCircle, Upload, File,
  FolderOpen, ChevronLeft, ChevronRight, Eye, Edit3, PenTool, Printer,
} from 'lucide-react';
import {
  upsertContract, getContract, generateContractSignatures,
  getContractSignatures, uploadToDrive, getSuppliers,
} from '../../lib/dataService';
import { getDownloadUrl } from '../../lib/invoiceUtils';
import { formatIST, nowISOString } from '../../lib/timezone';
import { useAuth } from '../../context/AuthContext';
import { useNotifications } from '../../context/NotificationsContext';
import clsx from 'clsx';
// jsPDF loaded lazily to avoid Vite TDZ errors that crash ContractSign canvas

// ── Constants ────────────────────────────────────────────────────
// Only "Crew" type uses Crew template. Everything else (Cast, Actor, Model, Talent, Equipment, etc.) uses Cast template.
const CREW_TYPES = ['Crew'];

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
function StepIndicator({ currentStep, onStepClick, maxReachedStep, signerIsCreator }) {
  return (
    <div className="flex items-center gap-0 mb-5">
      {STEPS.map((step, i) => {
        const isActive = step.id === currentStep;
        const isDone = step.id < currentStep;
        const isClickable = step.id <= maxReachedStep;
        const label = step.id === 4
          ? (signerIsCreator ? 'Send to Supplier' : 'Send to Signer')
          : step.label;
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
              <span className="hidden sm:inline">{label}</span>
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

// ── Event Timeline — Dropbox Sign style ─────────────────────────
function EventTimeline({ events }) {
  if (!events || events.length === 0) return null;
  const icons = { viewed: '👁', created: '📄', sent: '📤', signed: '✍️', completed: '✓', regenerated: '🔄', generated: '⚙️', uploaded: '📎' };
  const labels = { viewed: 'VIEWED', created: 'CREATED', sent: 'SENT', signed: 'SIGNED', completed: 'COMPLETED', regenerated: 'UPDATED', generated: 'GENERATED', uploaded: 'UPLOADED' };
  return (
    <div className="mt-5 pt-4 border-t border-gray-200">
      <div className="text-sm font-semibold text-gray-700 mb-3">Document History</div>
      <div className="divide-y divide-gray-100">
        {events.map((evt, i) => {
          const badge = labels[evt.type] || evt.type?.toUpperCase() || '';
          const icon = icons[evt.type] || '•';
          let detail = '';
          if (evt.type === 'viewed') detail = `Viewed by ${evt.name || 'Unknown'}${evt.email ? ' (' + evt.email + ')' : ''}`;
          else if (evt.type === 'created') detail = 'Contract created';
          else if (evt.type === 'sent') detail = 'Sent for signature';
          else if (evt.type === 'signed') detail = `Signed by ${evt.name || evt.role || 'Party'}${evt.email ? ' (' + evt.email + ')' : ''}`;
          else if (evt.type === 'completed') detail = 'The document has been completed.';
          else if (evt.type === 'generated') detail = 'Signing links generated';
          else if (evt.type === 'uploaded') detail = 'File uploaded to Drive';
          else detail = evt.name || '';
          const evtDate = evt.at ? new Date(evt.at) : null;
          const dateStr = evtDate ? evtDate.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' }) : '';
          const timeStr = evtDate ? evtDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, timeZoneName: 'short' }) : '';
          return (
            <div key={i} className="flex items-start gap-3 py-3">
              <div className="flex flex-col items-center w-14 shrink-0">
                <span className="text-base">{icon}</span>
                <span className="text-[8px] font-bold tracking-wider text-gray-400 mt-0.5">{badge}</span>
              </div>
              <div className="w-24 shrink-0">
                <div className="text-xs font-bold text-gray-800">{dateStr}</div>
                <div className="text-[10px] text-gray-400">{timeStr}</div>
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs text-gray-700">{detail}</div>
                {evt.ip && <div className="text-[10px] text-gray-400 mt-0.5">IP: {evt.ip}</div>}
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
      {signingLinks.provider && (
          <div className="flex items-center justify-between bg-white rounded-lg px-3 py-2.5 border border-purple-100">
            <div className="min-w-0 flex-1">
              <div className="text-[10px] font-bold text-purple-500 uppercase">Service Provider</div>
              <div className="text-sm font-semibold text-gray-800 truncate">{signingLinks.provider.name}</div>
              <div className="text-xs text-gray-500 truncate">{signingLinks.provider.email}</div>
            </div>
            <div className="flex items-center gap-2 shrink-0 ml-3">
              <button
                type="button"
                onClick={() => { navigator.clipboard.writeText(signingLinks.provider.url); onCopy?.('Signing link copied!'); }}
                className="text-xs text-purple-600 hover:text-purple-800 px-2 py-1 rounded border border-purple-200 hover:bg-purple-50 flex items-center gap-1"
              >
                <Copy size={10} /> Copy
              </button>
            </div>
          </div>
      )}
    </div>
  );
}

// ── Logo fetch helper ────────────────────────────────────────────
// Hardcoded Particle logo (WebP ~3.6KB base64). Paste content from /tmp/particle_logo_b64.txt below.
// jsPDF cannot render WebP; the PDF header uses text fallback. This base64 is for in-app HTML preview.
const PARTICLE_LOGO_BASE64 = 'data:image/webp;base64,UklGRpYKAABXRUJQVlA4TIoKAAAv70MWELcgFkzmL90Xw/zPP0G2Ld4JXoJJmmo7BjUAABzbBwCAt9uW6ta2bSsIoUbHWFgdBfX//1e5ORAg8JjPiP5PAP3/gsb6uKeUUvTW/CuQYeefMSURkZRSDN6ab5LxCZ8nx31g2+jC/Vqs2vwzwT4KiuYU7HeInxkFI/cgoN2corcdYuhDV3xqNT69XVoyscuumjUqbQ/sU3Btctyei0ru2SP21HfDPFE68p29T547Ewtk05MXms4p2FYYXY7VBChdc/aZUeO+tvaC0vYsoaepF1ZQXtbbA3C4njBKhmE452gnzyVUK+7LYayPSTIAZEl7sOaDB659DAAgD+5GLJLNSAAQx/PmBFWL/17Y54GCx9O+ibg6jgAgj04wyj4HA5DHpFlB9eK+Essjo7hEpojr4xAAwl1IhcCjAYibME5oMvHXwSZcfKDG5xgAjw5YlI7jAUSerT8Zrfrvgk34PMuRUpL8UaV+ELCb5qQY7IBAeKo4oeHI3wPe8aFEvxj61Vj3OqrCMggQbsyhfBoR5GWirKBp4W/Bn4xfU2AqyC5VdIwCxLQlF8COCLBO0x+0npevgNnxPkdLxX098KOA1JTDlWlM8jJJD3Tw5wvAgveboQulomxGAc+W5BLYIYHwFD1wqaS4hRDCFpNcgp/psxlvE9OVDjX7XmQpf6SPRaQYbDsPXCtjgjRDDxTPyVtDHxvrUznYOZJyP3ibPV17VJV64ahis6x+LyGmFZaL4MYEfn4eKJ2cobLrq1Repu4Hbw+maxl12/t5y0GH0MoT2l2VTY+8rdu9SmRTR52ioY42tqJsDoYuZCdFIDxITD1e8Xajq31l4aaIWFTZtMFQ80uD0CNLtfNLhzA5LEVyMHS1kxJI88b5TaDLU2XptsgcGvg2omojzppsBoDI67KZG0HJaKhCfpXAc9ZYcA50fa4s3xexaFITDK0wUdAgDAF5FfzUPFBQLFW6SAHYSdtxDnT9gtr5vshqwC1EVSAikzXZDAG9VGlmGAUTU7XmVUDm7IFzoAptdeuN0aHxDTC0QuegwXMMWAUzMVJgo6qDDmHGGOdENbrq3J0FTWwgqdwbkzXgIaCkcvPioA9UedBlM2H7SXg2rEbqc9AKvfeqfQy8apsX0QWqPqgQ58vh7Gg2SIP6ROV+IdHADsGi+jstDupADQYVeLrkFGk+RMO1OWiFfneqNARGJdMiqkRNvlRxthwACFeyVmdvLTUmKvsBJQ3sCJBo8qxYaIXbMKKBmSw5BaqUq1tGwlbmoI30qVWlEcGsRJWjRq0qzJUFAOFaqDrqg78lUfFHlDSwI3BMUtZEapbVcxVPgapNlR2dCJ1Y6npAG+lzq5IRSHO0QsvttDoJjDPXs1W2DQVXxaJiBSUN/ACIJk9K1ET6yrjTX6rXVmbv7dCYqiK0kbSsymY4ZFIODX9n9tNaEeWqhO4NWqqZoRVW0UuDcH/QpjkxUCa6dHFu5Xn445o0pfKJag5V+XuzmqOqqAqk56zJ5u4W1d85sRp3xSPjHHkWGrWFLACkqkyuie9t06SaGFrhAhQ0CHfnVH5OvIbL8YHf/ffBn3xVFCoKdG+i2WqKKkclTdZkc3NJZedkUxxUXvDpz9dhP9m6jFQjfG8PaNeKFmiFygYN4r0xtJnmJCn+lnvg42y+Delk6iJbjaNb+4GaK0oqV8hkDfjWDlWclEPhizGU4duQAWSqfatko1v7A3Wieh20QqW9Kt1ZhHqdFFGsxZxGvg0AkKqjo4qD7sxE6F1FonLFSDSwt2US1EKTkhW22KaB+S7w6W99RioQvi+zPjMKcj0O2kTlnSrdFD8y9G5WUMlLxd+F5RTrI5bLhKknu6vUhxDjkVE2Ur2i4gsoaWA74bhSa1fnn7ugpNB3wXwXbCtk9ouSoa50ketx0Ea60qpSJ3ropkUq8Rqh7xBRuMRT6x3aqFoWFV9CSYN1ECJN0lrMaOKXYWmIWIqlhYZDuJ4HtJGutSoZAzHzcih8MXop+MvALRE5KZIcdbA/C1XLouKLKGngR0CY5mVXbOWMfBToG/G3GSL7yoocLXWxO4HqjdAGunpRZXN/wjQxm+IoRywfBJoDy02aMnSShojIhv3I77w11MneBKqXoY7hctEg3J4wzYxXwJQjfr2TlSaBqaMCILf1PgPI1M/OeKo46hrM5uYS09RYzXoBEbsteku9nYMdALg9AwBpTMRSxYwehlvLnro7GkaTLun0HGwn1549bUOyGao5diHzjSWm2aGkyOYrs5629raTG5C0UNUWfYy3lSz1eDiCAuErE0/SXjotoyHBUOVHJ8C3lDdLfR4Oq8nmC/PEW26NAUBoJPLuF6reoZfpfvJmqdvDQVmB0M7qlHaeHngfWnOn2DFJFe8xBrcyNSndgL0dLDRPQQNuhTOUcZoYv+bWjpPtWKBbdOhnas3bi30J4XkyqqOVBC1Pk/wG25YFAKHRk47ANmbp6lAAYqaJkgbPNh7QRpolhw9TW/EUR8+hp6lz9CqANE9WhZ8WVqh5mo5PYFtinHnwWLoC1zlzFMBzmiipYOtbsirQLDE+Ti3FU6TBe6Cv0jliKYDHNLEuL7UtGVox0+Q/g2vH4cyDx+ht6BwtuQDWWaKgAn7qshlqR9O0K7Jpxcgp0uBF1ZGqV2XTOVpL5GWWjOjwqOkP9JHm6VBgb+WJMw8eQytM1b80CL2jUADCk0S2AHauxezQC08U1L4Nh3OgwYsqR/WbrMmmd7QVwGEmiUIBiKtjFRR0NHF5aYHzSWjwGFqhFoMGoXuUCiDOEqUCwLFcZxNKBpo5CNfHgjOP3q5yTZisydw9IwXwmCUjJYDdXmMTih40VaKDcG0sOHsaPAutUJtBg9g94lwAfpKIpQggjksZn1BWuK3NNWnbsCVXV9CHgs8Yo//tKADhulhw3mj0ROUaMVkD2z1aSsBOErGUAZC81S0+obQwtdVoaqPx9NtWAsI1seB80Og5aIVa9arUP/IlMk8SsZQ6pz04e16dj0dGeWGaLFsE2dVjM86HGT5R2WZINLD9o1AAYiaJWC6oVphmy+QiwLOWJ94ehkbPQRupXadKN0CvAkizRHy0JkzTRVshiK3BHnh7GBo+UXFDlDSwN2COAnjOEtHW1m5owjgXAiJfZZ54/zI0fA9oI7VsVekGiKUAHtNEThry1OT4USgGRL7CPDLee+r1nbCouClKGrgboCUXwM80Eb9aEUuTZqQckFwpm/CrWJqAB7SR2rYqMTdAa4m8TBORkyaCoVkjzhcAeXeLhl3M+H0zNAEMNTdGSYNwBxQKQHieiIJUl5ianQFa8hXnnJ7BrdY65597xqfJUs9vJKoCtc6qbO6AtgI4zEQRB6kqWWp4CmiRi4onS32/D4ZWuDl6aRBugVIB7DNFRE5qybulpueA+FUgu+V1TbLU+/uIKkftc9ZkcwtGCuA5V0T2JRWkYKjxSSByosjBEBG7VCp5Q/1fnHLpl1NTD63Tcg0hKZcGiFNJO1lEZLfjipw8U/vTQLS+8m8pGPrV2C3lz3LaVkP/0mxs2A9dPqK3hr6Oy+pDcKshtbGrCyEE5xamf5Vmu7rw3rmF6f/+/0+t';

// ── PDF Generation — Full Legal Text ─────────────────────────────
async function generateContractPDF(data) {
  const { default: jsPDF } = await import('jspdf');
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 20;
  const contentWidth = pageWidth - margin * 2;
  let y = 20;
  const isCast = data.isCastType || false;

  function addPageIfNeeded(needed = 12) {
    if (y + needed > 275) {
      doc.addPage();
      y = 20;
    }
  }

  function drawWrappedText(text, x, startY, maxWidth, lineHeight = 5.5) {
    const lines = doc.splitTextToSize(text || '', maxWidth);
    lines.forEach(line => {
      addPageIfNeeded(lineHeight);
      doc.text(line, x, startY);
      startY += lineHeight;
    });
    return startY;
  }

  function sectionHeading(number, title) {
    addPageIfNeeded(14);
    y += 4;
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(3, 11, 46);
    doc.text(`${number}. ${title}`, margin, y);
    y += 7;
    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(30, 30, 30);
  }

  function subHeading(number, title) {
    addPageIfNeeded(10);
    y += 2;
    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 30, 30);
    doc.text(`${number} ${title}`, margin + 4, y);
    y += 5.5;
    doc.setFont('helvetica', 'normal');
  }

  // ── Header / Letterhead ──
  doc.setFillColor(3, 11, 46);
  doc.rect(0, 0, pageWidth, 35, 'F');
  // Logo in PDF: jsPDF doesn't support WebP, so try addImage but always fall back to navy text.
  // Use 50mm x 10mm (5:1 ratio for ~250x50px logo) at position (14, 10).
  let logoRendered = false;
  if (data.logoBase64) {
    try { doc.addImage(data.logoBase64, 'WEBP', 14, 10, 50, 10); logoRendered = true; } catch { /* WebP not supported, fall through */ }
    if (!logoRendered) {
      try { doc.addImage(data.logoBase64, 'PNG', 14, 10, 50, 10); logoRendered = true; } catch { /* PNG attempt also failed */ }
    }
  }
  if (!logoRendered) {
    // Text fallback — "PARTICLE" in white on the navy header
    doc.setTextColor(255, 255, 255); doc.setFontSize(20); doc.setFont('helvetica', 'bold');
    doc.text('PARTICLE', margin, 18); doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.text('for men', margin + 52, 18);
  }
  doc.setTextColor(255, 255, 255); doc.setFontSize(9); doc.setFont('helvetica', 'normal');
  doc.text(PARTICLE_COMPANY.name, pageWidth - margin, 14, { align: 'right' });
  doc.text(PARTICLE_COMPANY.address, pageWidth - margin, 20, { align: 'right' });
  if (data.effective_date) doc.text(`Date: ${data.effective_date}`, pageWidth - margin, 26, { align: 'right' });

  y = 45;
  doc.setTextColor(3, 11, 46);

  // ── Title ──
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('SERVICES AGREEMENT', pageWidth / 2, y, { align: 'center' });
  y += 10;

  // ── Preamble ──
  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(30, 30, 30);

  const providerIdClause = isCast
    ? `${data.provider_name || '[Please complete]'}, ID/Passport number ${data.provider_id_number || '[Please complete]'}, with a principal place of business at ${data.provider_address || '[Please complete]'} ("Service Provider"),`
    : `${data.provider_name || '[Please complete]'} [ID/Passport number ${data.provider_id_number || '[Please complete]'}], with a principal place of business at ${data.provider_address || '[Please complete]'} ("Service Provider"),`;

  const preamble = `This Services Agreement ("Agreement") is made and entered into on ${data.effective_date || '[Please complete]'} ("Effective Date"), by and between Particle Aesthetic Science Ltd., a company registered in Israel, with a principal place of business at King George 48, Tel Aviv ("Company"), and ${providerIdClause}`;
  y = drawWrappedText(preamble, margin, y, contentWidth);
  y += 3;

  y = drawWrappedText('WHEREAS, Service Provider has the skills, resources, know-how and ability required to provide the Services and create the Deliverables (each as defined below); and', margin, y, contentWidth);
  y += 2;
  y = drawWrappedText('WHEREAS, based on Service Provider\'s representations hereunder, the parties desire that Service Provider provide the Services as an independent contractor of Company upon the terms and conditions hereinafter specified;', margin, y, contentWidth);
  y += 2;
  y = drawWrappedText('NOW, THEREFORE, the parties hereby agree as follows:', margin, y, contentWidth);
  y += 3;

  // ── Section 1: DEFINITIONS ──
  sectionHeading('1', 'DEFINITIONS');
  y = drawWrappedText('For purposes of this Agreement (including any and all amendments made to or incorporated herein now or in the future), the following capitalized terms shall have the following meaning:', margin, y, contentWidth);
  y += 2;

  if (isCast) {
    y = drawWrappedText('"Content" shall mean any testimonials, data, personal stories and details, names, locations, videos, photos, audio, and any breakdown, definition or partition of video, film or TV clips, including images, sound footage and segments, recorded performance, interviews, likeness and voice of the Service Provider as embodied therein, and any and all other information which may be provided by the Service Provider to Company in connection with the Services.', margin, y, contentWidth);
  } else {
    y = drawWrappedText('"Deliverables" shall mean all deliverables provided or produced as a result of the work performed under this Agreement or in connection therewith, including, without limitation, any work products, composition, photographs, videos, information, specifications, documentation, content, designs, audio, and any breakdown, definition or partition of video, film or clips, images, sound footage and segments, recorded performance, including as set forth in Exhibit A, all in any media or form whatsoever.', margin, y, contentWidth);
  }
  y += 2;
  y = drawWrappedText('"Intellectual Property Rights" shall mean all worldwide, whether registered or not (i) patents, patent applications and patent rights; (ii) rights associated with works of authorship, including copyrights, copyrights applications, copyrights restrictions; (iii) rights relating to the protection of trade secrets and confidential information; (iv) trademarks, logos, service marks, brands, trade names, domain names, goodwill and the right to publicity; (v) rights analogous to those set forth herein and any other proprietary rights relating to intangible property; (vi) all other intellectual and industrial property rights (of every kind and nature throughout the world and however designated) whether arising by operation of law, contract, license, or otherwise; and (vii) all registrations, initial applications, renewals, extensions, continuations, divisions or reissues thereof now or hereafter in force (including any rights in any of the foregoing).', margin, y, contentWidth);
  y += 2;

  if (!isCast) {
    y = drawWrappedText('"Services" shall have the meaning ascribed to it in Section 2 below.', margin, y, contentWidth);
    y += 2;
    y = drawWrappedText('"Specifications" shall mean Company\'s specifications for the Deliverables attached hereto as Exhibit A or as otherwise provided to Service Provider by Company from time to time.', margin, y, contentWidth);
    y += 2;
  }

  // ── Section 2: SERVICES ──
  sectionHeading('2', 'SERVICES');
  if (isCast) {
    y = drawWrappedText('Service Provider shall provide Company with modeling services all in accordance with the Company\'s instructions, including the instructions set forth in Exhibit A attached hereto and to Company\'s full satisfaction ("Services"). Service Provider shall be liable for full compliance with the terms and conditions of this Agreement and for any negligent acts and omissions in connection therewith.', margin, y, contentWidth);
  } else {
    y = drawWrappedText('Service Provider shall provide Company with the services and deliver the Company the Deliverables all as detailed in Exhibit A, and all in accordance with the milestones and timelines set forth therein and in accordance with Company\'s instructions and to its full satisfaction ("Services"). Service Provider shall be liable for full compliance with the terms and conditions of this Agreement and for any negligent acts and omissions in connection therewith. Service Provider is and shall remain solely responsible and liable for obtaining, paying for, repairing and maintaining all the equipment, hardware and services required for providing the Services.', margin, y, contentWidth);
  }
  y += 2;

  // ── Section 3: COMPENSATION ──
  sectionHeading('3', 'COMPENSATION');
  subHeading('3.1', 'Consideration.');
  y = drawWrappedText('In consideration for the Services provided herein, Company shall pay Service Provider the fees set forth in Exhibit B attached hereto in accordance with the milestones therein. Such payments shall be the full and final consideration of Service Provider and no additional payments shall be made including without limitation payments for overtime or other. Payments shall be made net thirty (30) days after Company\'s receipt of an undisputed invoice. Company may deduct and withhold from any payments made hereunder all sums which it then may be required to deduct or withhold pursuant to any applicable statute, law, regulation or order of any jurisdiction whatsoever.', margin, y, contentWidth);
  y += 2;
  subHeading('3.2', 'Taxes.');
  y = drawWrappedText('The consideration hereunder shall include all taxes, levies and charges however designated and levied by any state, local, or government agency (including sales taxes and VAT). Service Provider shall have sole responsibility for the payment of all of taxes, levies and charges.', margin, y, contentWidth);
  y += 2;
  subHeading('3.3', 'Expenses.');
  y = drawWrappedText('Except for expenses pre-approved in writing by Company, which will be paid against an itemized invoice, Service Provider shall bear all of its expenses arising from the performance or obligations under this Agreement.', margin, y, contentWidth);
  y += 2;

  // ── Section 4: PROPRIETARY RIGHTS / WAIVER AND CONSENT ──
  if (isCast) {
    sectionHeading('4', 'WAIVER AND CONSENT');
    y = drawWrappedText('Company exclusively own and shall continue to own all right title and interest in and to the Content, Company Confidential Information (defined below) and any modifications, enhancements, improvements and derivatives thereof and all Intellectual Property Rights thereto (including without limitation, performing rights, rights to publicity and copyrights), upon creation thereof ("Company IPR"). Without derogating from the generality of the foregoing, Company may use and otherwise exploit the Content in any media and/or platform whatsoever (including, without limitation, websites, social media, marketing materials and streaming platforms), including, without limitation, reproduce, display, exhibit, publish, publicly make available, transmit, distribute, broadcast, create derivative works, edit, change, use in advertisements or any other marketing materials, in Company\'s current or future products, services or features, and/or otherwise use and/or exploit the Content as Company deems appropriate at its sole discretion without any restrictions. Service Provider hereby agrees to automatically assign to Company all right, title and interest in and to the Company IPR upon creation thereof.', margin, y, contentWidth);
    y += 2;
    y = drawWrappedText('Service Provider unconditionally and irrevocably waives, releases and forever discharges any rights, claims, charges or demands whatsoever, in the past, present or future, whether under contract, law, equity or otherwise, in respect of the Company IPR and PII (as defined below) and/or any use thereof, including, without limitation, in connection with invasion of privacy, defamation, right of publicity, performing rights, moral rights, right to receive compensation or royalties including any compensation under Section 134 the Israeli Patent Law-1967 or other applicable laws, or any liability, damages and expenses of any kind or all analogous/similar rights throughout the world or any other cause of action in respect of the Company IPR or its use. Service Provider undertakes not to contest Company\'s rights to the Company IPR. Service Provider acknowledges that nothing herein shall obligate Company to use the Content or any part thereof.', margin, y, contentWidth);
    y += 2;
    y = drawWrappedText('Company may collect, process and retain the Service Provider\'s personally identifiable information ("PII") derived in connection with the Services. Such PII may be made available by the Company to third parties, including without limitation, to Company\'s affiliates, shareholders, partners, agents, contractors and advisors, whether local or foreign, all as part of the Content, in order to further the purposes herein. Company may also transfer PII as part of the Content to third parties in connection with a reorganization, merger, share purchase or sale of substantially all of Company\'s assets. Service Provider hereby confirms that it is not legally required to provide its PII and such PII is provided at the Service Provider\'s volition.', margin, y, contentWidth);
  } else {
    sectionHeading('4', 'PROPRIETARY RIGHTS');
    y = drawWrappedText('The Specifications, Deliverables, Company Confidential Information (defined below) and any and all modifications, enhancements and derivatives thereof and all Intellectual Property Rights thereto ("Company IPR") are and shall be owned exclusively by Company upon their creation and shall be deemed works for hire by Service Provider for Company. Without derogating from the foregoing, any and all content or material provided by Company constitutes Company IPR. Service Provider hereby assigns and agrees to assign to Company exclusive ownership and all right, title and interest the Company IPR. Service Provider hereby waives all right, title and interest in and to the Company IPR, including moral rights and any right to compensation or royalties including pursuant to Section 134 to the Israel Patent Law \u2013 1967. Service Provider agrees to assist Company in every proper way to obtain for Company and enforce any Intellectual Property Rights in the Company IPR in any and all countries. Service Provider hereby irrevocably designates and appoints Company and its authorized officers and agents as Service Provider\'s agent and attorney in fact, coupled with an interest to act for and on Service Providers behalf and in Service Provider\'s stead to do all lawfully permitted acts to further the prosecution and issuance of Company IPR or any other right or protection relating to any Company IPR, with the same legal force and effect as if executed by Service Provider itself. Service Provider shall ensure that all of its employees and contractors sign terms no less restrictive and no less protective of Company and Company IPR as the terms set forth in this agreement, including without limitation assignment and waiver of all right, title and interest in and to the Company IPR to the Company in a form preapproved by the Company, and shall provide Company all such signed terms upon execution.', margin, y, contentWidth);
  }
  y += 2;

  // ── Section 5: CONFIDENTIALITY ──
  sectionHeading('5', 'CONFIDENTIALITY');
  if (isCast) {
    y = drawWrappedText('This Agreement, the provision of the Services, Company IPR and all information related to the Company, its affiliates, its and their shareholders, employees, directors and agents and/or to their business, products and services are confidential information of Company ("Confidential Information"). Service Provider agrees to protect the Confidential Information with the highest degree of care and keep confidential and not disclose, disseminate, allow access to or use any Confidential Information except as required for the provision of the Services.', margin, y, contentWidth);
  } else {
    y = drawWrappedText('This Agreement, the provision of the Services, Company IPR and all data and information related to the Company, its affiliates, its and their shareholders, employees, directors and agents and/or to their business, products and services are confidential information of Company ("Confidential Information"). Service Provider agrees to protect the Confidential Information with the highest degree of care and keep confidential and not disclose, disseminate, allow access to or use any Confidential Information except as required for the provision of the Services and creation of the Deliverables.', margin, y, contentWidth);
  }
  y += 2;

  // ── Section 6: WARRANTIES AND REPRESENTATIONS ──
  sectionHeading('6', 'WARRANTIES AND REPRESENTATIONS');
  if (isCast) {
    y = drawWrappedText('Service Provider hereby warrants and represents that: (i) it has the requisite professional qualifications, knowledge, know-how, expertise, skill, talent and experience required in order to perform the Services in a professional and efficient manner; (ii) there are no limitations, obligations or restrictions whatsoever which restrict or prevent Service Provider from fulfilling all of its obligations or grant the rights granted to Company under this Agreement; (iii) it will perform its obligations under this Agreement in compliance with all applicable laws, rules and regulations; and (iv) it has and shall continue to obtain all applicable consents, permits, licenses, certifications and authorizations in connection with the Services.', margin, y, contentWidth);
  } else {
    y = drawWrappedText('Service Provider hereby warrants and represents that: (i) it has the requisite professional qualifications, knowledge, know-how, expertise, skill, talent and experience required in order to perform the Services and provide the Deliverables in a professional and efficient manner and shall perform the Services and provide the Deliverables using highest industry standards; (ii) there are no limitations, obligations or restrictions whatsoever which restrict or prevent Service Provider from fulfilling all of its obligations or grant the rights granted to Company under this Agreement; (iii) it will perform its obligations under this Agreement in compliance with all applicable laws, rules, professional standards, certifications and regulations; (iv) the Services and Deliverables: (a) shall be fit for their intended purpose, (b) do not and will not infringe any right of any third party including Intellectual Property Rights or right to privacy, (c) shall strictly comply with the Specifications; and (v) it has and shall continue to obtain all applicable consents, permits, licenses, certifications and authorizations in connection with the Services and Deliverables.', margin, y, contentWidth);
  }
  y += 2;

  // ── Section 7: INDEMNIFICATION ──
  sectionHeading('7', 'INDEMNIFICATION');
  y = drawWrappedText('Service Provider shall indemnify, hold harmless, and at Company\'s first request, defend Company, its affiliates and their officers, directors, agents and employees, against all claims, liabilities, damages, losses and expenses, including attorneys\' fees, arising out of or in any way connected with or based on: (i) Service Provider\'s breach of any of its representations and warranties herein; and/or (ii) a determination by a competent authority that is contrary to Section 9.3 below.', margin, y, contentWidth);
  y += 2;

  // ── Section 8: TERM AND TERMINATION ──
  sectionHeading('8', 'TERM AND TERMINATION');
  subHeading('8.1', 'Term of Agreement.');
  y = drawWrappedText('This Agreement shall be effective from the Effective Date and shall remain in effect for the duration of the Services, unless earlier terminated as provided hereunder ("Term"). The Term may be extended by the Company at its sole discretion.', margin, y, contentWidth);
  y += 2;
  subHeading('8.2', 'Termination for Convenience.');
  if (isCast) {
    y = drawWrappedText('Company may terminate this Agreement at any time for convenience upon written notice to the Service Provider.', margin, y, contentWidth);
  } else {
    y = drawWrappedText('Company may terminate this Agreement at any time for convenience upon five (5) days written notice to the Service Provider.', margin, y, contentWidth);
  }
  y += 2;
  subHeading('8.3', 'Termination for Cause.');
  y = drawWrappedText('Notwithstanding the above, this Agreement may be terminated by either party upon written notice to the other party if such other party breaches a material term or condition of this Agreement and fails to completely cure such breach within fourteen (14) days after receipt of said notice of such breach.', margin, y, contentWidth);
  y += 2;
  subHeading('8.4', 'Consequences.');
  if (isCast) {
    y = drawWrappedText('Upon termination or expiration of this Agreement, Service Provider shall at Company\'s option, either deliver to Company or delete/destroy all Confidential Information in its possession or under its control, in any media or form whatsoever. The provisions of Sections 1, 4, 5, 6, 7, 8.4 and 9 shall survive termination or expiration of this Agreement and shall remain in full force and effect in perpetuity.', margin, y, contentWidth);
  } else {
    y = drawWrappedText('Upon termination or expiration of this Agreement, Service Provider shall promptly Deliver to Company all Deliverables (whether completed or not) and at Company\'s option, either deliver to Company or delete/destroy all Confidential Information in its possession or under its control, in any media or form whatsoever. The provisions of Sections 1, 4, 5, 6, 7, 8.4 and 9 shall survive termination or expiration of this Agreement and shall remain in full force and effect in perpetuity.', margin, y, contentWidth);
  }
  y += 2;

  // ── Section 9: MISCELLANEOUS ──
  sectionHeading('9', 'MISCELLANEOUS');

  if (!isCast) {
    subHeading('9.1', 'Subcontracting.');
    y = drawWrappedText('The obligation of Service Provider hereunder may not be subcontracted by Service Provider, in whole or in part without the written consent of Company and any such subcontracting without Company\'s written approval shall be deemed null and void.', margin, y, contentWidth);
    y += 2;
  }

  subHeading(isCast ? '9.1' : '9.2', 'Assignment.');
  y = drawWrappedText('Service Provider may not assign or transfer any of its rights or obligations hereunder to any third party without the prior written consent of Company. Company may assign its rights or obligations hereunder at its sole discretion. Any assignment without Company\'s prior written consent shall be deemed null and void.', margin, y, contentWidth);
  y += 2;

  subHeading(isCast ? '9.2' : '9.3', 'Independent Contractors.');
  if (isCast) {
    y = drawWrappedText('It is hereby clarified that Service Provider is an independent contractor of Company under this Agreement and nothing herein shall be construed to create a joint venture, partnership or an employer/employee relationship. Service Provider may not make any representations, warranties, covenants or undertakings on behalf of Company and may not represent Company.', margin, y, contentWidth);
  } else {
    y = drawWrappedText('It is hereby clarified that Service Provider is an independent contractor of Company under this Agreement and nothing herein shall be construed to create a joint venture, partnership or an employer/employee relationship. Service Provider may not make any representations, warranties, covenants or undertakings on behalf of Company and may not represent Company. Neither Service Provider nor its employees are entitled to any of the benefits or rights to which employees of Company are entitled, and Service Provider shall be solely responsible for all of its employees and agents and its labor costs and expenses arising in connection therewith.', margin, y, contentWidth);
  }
  y += 2;

  subHeading(isCast ? '9.3' : '9.4', 'No Waiver.');
  y = drawWrappedText('All waivers must be in writing. A waiver by either of the parties hereto shall not be construed to be a waiver of any succeeding breach thereof or of any covenant, condition, or agreement herein contained.', margin, y, contentWidth);
  y += 2;

  subHeading(isCast ? '9.4' : '9.5', 'Governing Law.');
  y = drawWrappedText('This Agreement, including the validity, interpretation, or performance of this Agreement and any of its terms or provisions, and the rights and obligations of the parties under this Agreement shall be exclusively governed by, construed and interpreted in accordance with the laws of the State of Israel without regards to the choice of law provisions thereof. Any action arising out of or in any way connected with this Agreement shall be brought exclusively in the courts of Tel Aviv, Israel and the parties hereby submit themselves to its exclusive jurisdiction.', margin, y, contentWidth);
  y += 2;

  subHeading(isCast ? '9.5' : '9.6', 'Entire Agreement.');
  y = drawWrappedText('This Agreement and its Exhibits constitute the entire agreement between the parties. No change, waiver, or discharge hereof shall be valid unless it is in writing and is executed by the party against whom such change, waiver, or discharge is sought to be enforced.', margin, y, contentWidth);
  y += 2;

  subHeading(isCast ? '9.6' : '9.7', 'Amendment.');
  y = drawWrappedText('This Agreement may only be amended by an instrument in writing signed by each of the parties hereto.', margin, y, contentWidth);
  y += 2;

  subHeading(isCast ? '9.7' : '9.8', 'Notices.');
  y = drawWrappedText('All notices and other communications given or made pursuant hereto shall be in writing and shall be deemed to have been duly given or made as of the date delivered or transmitted, and shall be effective upon receipt, if delivered personally, sent by air courier, or sent by electronic transmission, with confirmation received.', margin, y, contentWidth);
  y += 2;

  subHeading(isCast ? '9.8' : '9.9', 'Deduction/Set-Off.');
  y = drawWrappedText('Company may at any time deduct or set-off any or all amounts which it deems it has already paid to Company.', margin, y, contentWidth);
  y += 2;

  if (!isCast) {
    subHeading('9.10', 'No Exclusivity.');
    y = drawWrappedText('This Agreement does not prevent Company from receiving services same or similar to the Services from any third party.', margin, y, contentWidth);
    y += 2;

    subHeading('9.11', 'Insurance.');
    y = drawWrappedText('The Service Provider shall maintain at its sole expense insurance coverages that sufficiently cover all obligations and liabilities in Service Provider\'s performance of the Services. Service Provider will provide Company with a certificate of insurance evidencing such coverage immediately upon Company\'s request.', margin, y, contentWidth);
    y += 2;
  }

  // ── Section 10: IN WITNESS THEREOF ──
  sectionHeading('10', 'IN WITNESS THEREOF');
  y = drawWrappedText('Company and Service Provider have caused this Agreement to be signed and delivered by their duly authorized officers, all as of the last date set forth below.', margin, y, contentWidth);
  y += 6;

  // ── Signature Blocks ──
  addPageIfNeeded(60);
  doc.setFillColor(248, 250, 252);
  doc.rect(margin, y - 4, contentWidth, 55, 'F');
  doc.setDrawColor(200, 200, 200);
  doc.rect(margin, y - 4, contentWidth, 55, 'S');

  const halfWidth = (contentWidth - 10) / 2;
  doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(3, 11, 46);
  doc.text('Particle Aesthetic Science Ltd.', margin + 3, y + 2);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5);
  doc.text(`By: ____________________`, margin + 3, y + 10);
  doc.text(`Title: ___________________`, margin + 3, y + 17);
  doc.text(`Date: ___________________`, margin + 3, y + 24);

  const rightX = margin + halfWidth + 10;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
  doc.text(data.provider_name || '[Service Provider]', rightX, y + 2);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5);
  doc.text(`By: ________________________`, rightX, y + 10);
  doc.text(isCast ? `ID/Passport Number: __________` : `Title: _______________________`, rightX, y + 17);
  doc.text(`Date: _______________________`, rightX, y + 24);

  y += 32;

  // ── EXHIBIT A ──
  y += 10;
  addPageIfNeeded(30);
  doc.setFillColor(240, 243, 255);
  doc.rect(margin, y - 4, contentWidth, 10, 'F');
  doc.setFontSize(11); doc.setFont('helvetica', 'bold'); doc.setTextColor(37, 99, 235);
  doc.text('Exhibit A', margin + 3, y + 3);
  y += 14;
  doc.setTextColor(30, 30, 30); doc.setFontSize(8.5); doc.setFont('helvetica', 'normal');
  if (data.exhibit_a) {
    y = drawWrappedText(data.exhibit_a, margin, y, contentWidth);
  } else {
    doc.text('[To be completed - description of services, deliverables, specifications, timeline and milestones]', margin, y);
    y += 6;
  }
  y += 10;

  // ── EXHIBIT B ──
  addPageIfNeeded(30);
  doc.setFillColor(240, 253, 244);
  doc.rect(margin, y - 4, contentWidth, 10, 'F');
  doc.setFontSize(11); doc.setFont('helvetica', 'bold'); doc.setTextColor(22, 163, 74);
  doc.text('Exhibit B', margin + 3, y + 3);
  y += 14;
  doc.setTextColor(30, 30, 30); doc.setFontSize(8.5); doc.setFont('helvetica', 'normal');

  const currSymbol = data.currency === 'ILS' ? '\u20AA' : data.currency === 'EUR' ? '\u20AC' : data.currency === 'GBP' ? '\u00A3' : '$';
  const exhibitBIntro = `In consideration for Service Provider's Services, Service Provider shall be paid the following amounts:`;
  y = drawWrappedText(exhibitBIntro, margin, y, contentWidth);
  y += 3;
  if (data.fee_amount) {
    doc.setFont('helvetica', 'bold');
    doc.text(`Fee: ${currSymbol}${Number(data.fee_amount).toLocaleString()}`, margin, y);
    doc.setFont('helvetica', 'normal');
    y += 7;
  }
  if (data.payment_terms) {
    y = drawWrappedText(`Payment Terms: ${data.payment_terms}`, margin, y, contentWidth);
    y += 3;
  }
  if (data.payment_method) {
    y = drawWrappedText(`Payment Method: ${data.payment_method}`, margin, y, contentWidth);
    y += 3;
  }
  if (data.exhibit_b) {
    y = drawWrappedText(data.exhibit_b, margin, y, contentWidth);
  }

  // ── Footer ──
  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(7); doc.setTextColor(150, 150, 150);
    doc.text(`${PARTICLE_COMPANY.name} | ${PARTICLE_COMPANY.address} | Page ${i} of ${pageCount}`, pageWidth / 2, 290, { align: 'center' });
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

  // Who signs on behalf of Particle
  const [companySigner, setCompanySigner] = useState(
    existing?.company_signer || 'omer' // 'omer' | 'tomer' | 'custom'
  );
  const [customSignerName, setCustomSignerName] = useState(existing?.company_signer_name || '');
  const [customSignerEmail, setCustomSignerEmail] = useState(existing?.company_signer_email || '');
  const [customSignerTitle, setCustomSignerTitle] = useState(existing?.company_signer_title || '');

  // Creator signature (when Omer signs in Step 3)
  const [creatorSignature, setCreatorSignature] = useState(null);
  const creatorCanvasRef = useRef(null);
  const [creatorStrokes, setCreatorStrokes] = useState([]);
  const [creatorCurrentStroke, setCreatorCurrentStroke] = useState([]);
  const [creatorHasSignature, setCreatorHasSignature] = useState(false);

  // Derived values
  const signerIsCreator = companySigner === 'omer'; // Omer signs in Step 3, no external link
  const companySignerName = companySigner === 'omer' ? 'Omer Barak'
    : companySigner === 'tomer' ? 'Tomer Wilf Lezmy'
    : customSignerName;
  const companySignerEmail = companySigner === 'omer' ? 'omer@particleformen.com'
    : companySigner === 'tomer' ? 'tomer@particleformen.com'
    : customSignerEmail;
  const companySignerTitle = companySigner === 'omer' ? 'Creative Producer'
    : companySigner === 'tomer' ? 'Head of Creative Production'
    : customSignerTitle;


  // ── Step navigation ──
  const [currentStep, setCurrentStep] = useState(1);
  const [maxReachedStep, setMaxReachedStep] = useState(1);

  // ── Supplier lookup for auto-fill ──
  const matchedSupplier = useMemo(() => {
    if (!lineItem?.full_name) return null;
    try {
      const all = getSuppliers();
      return all.find(s =>
        s.name?.toLowerCase() === lineItem.full_name.toLowerCase() ||
        s.contact_name?.toLowerCase() === lineItem.full_name.toLowerCase()
      ) || null;
    } catch { return null; }
  }, [lineItem?.full_name]);

  // ── Step 1: Provider Details ──
  const [providerName, setProviderName] = useState(existing?.provider_name || lineItem?.full_name || '');
  const [providerEmail, setProviderEmail] = useState(existing?.provider_email || lineItem?.supplier_email || '');
  const [providerIdNumber, setProviderIdNumber] = useState(
    existing?.provider_id_number || lineItem?.id_number || matchedSupplier?.id_number || ''
  );
  const [providerAddress, setProviderAddress] = useState(
    existing?.provider_address || lineItem?.address || matchedSupplier?.address || ''
  );
  const [providerPhone, setProviderPhone] = useState(
    existing?.provider_phone || lineItem?.phone || matchedSupplier?.phone || ''
  );
  const [sendSuccess, setSendSuccess] = useState('');

  // ── Effective Date (editable) ──
  const [effectiveDate, setEffectiveDate] = useState(() => {
    if (existing?.effective_date) return existing.effective_date;
    return new Date().toISOString().slice(0, 10); // YYYY-MM-DD default to today
  });

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

  // ── Step 3: PDF Preview / Editable Preview ──
  const [pdfDataUrl, setPdfDataUrl] = useState(null);
  const [editMode, setEditMode] = useState(false);

  // Editable contract sections (pre-filled, user can edit before PDF generation)
  const [editableIntro, setEditableIntro] = useState('');
  const [editableBody, setEditableBody] = useState('');
  const [editableExhibitA, setEditableExhibitA] = useState('');
  const [editableExhibitB, setEditableExhibitB] = useState('');
  const editIntroRef = useRef(null);
  const editBodyRef = useRef(null);
  const editExhibitARef = useRef(null);
  const editExhibitBRef = useRef(null);

  // ── Step 4 & 5: Signing ──
  const [status, setStatus] = useState(existing?.status || 'pending');
  const [events, setEvents] = useState(existing?.events || []);
  const [signingLinks, setSigningLinks] = useState(null);
  const [signatures, setSignatures] = useState([]);
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState('');
  const [copyMsg, setCopyMsg] = useState('');
  const [autoGenTriggered, setAutoGenTriggered] = useState(false);

  // ── Logo for PDF (hardcoded base64, no fetch needed) ──
  const [logoBase64] = useState(PARTICLE_LOGO_BASE64);
  const [tomerSignature, setTomerSignature] = useState(null);
  useEffect(() => {
    // Load Tomer's saved signature from localStorage
    const saved = localStorage.getItem('cp_tomer_signature');
    if (saved) setTomerSignature(saved);
  }, []);

  // ── Legacy fields ──
  const [pdfUrl, setPdfUrl] = useState(existing?.pdf_url || '');
  const [externalUrl, setExternalUrl] = useState(existing?.drive_url || existing?.dropbox_url || '');


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
        const cStatus = data?.contract?.status;
        if (cStatus === 'signed' || cStatus === 'sent' || cStatus === 'awaiting_hocp' || data?.signatures?.length > 0) {
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
    const next = Math.min(currentStep + 1, 5);
    if (next === 3) {
      // Populate editable sections and generate PDF preview when entering step 3
      populateEditableSections();
      handleGeneratePdfPreview();
    }
    setCurrentStep(next);
    setMaxReachedStep(Math.max(maxReachedStep, next));
  }

  function goBack() {
    setCurrentStep(Math.max(currentStep - 1, 1));
  }

  function goToStep(step) {
    if (step === 3 || step === 4) {
      populateEditableSections();
      handleGeneratePdfPreview();
    }
    setCurrentStep(step);
    setMaxReachedStep(Math.max(maxReachedStep, step));
  }

  // ── Creator Signature Canvas Helpers ──
  function initCreatorCanvas() {
    const canvas = creatorCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  }

  function handleCreatorPointerDown(e) {
    e.preventDefault();
    const canvas = creatorCanvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    const x = (clientX - rect.left) * (canvas.width / rect.width);
    const y = (clientY - rect.top) * (canvas.height / rect.height);
    setCreatorCurrentStroke([{ x, y }]);
    const ctx = canvas.getContext('2d');
    ctx.beginPath();
    ctx.moveTo(x, y);
  }

  function handleCreatorPointerMove(e) {
    if (creatorCurrentStroke.length === 0) return;
    e.preventDefault();
    const canvas = creatorCanvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    const x = (clientX - rect.left) * (canvas.width / rect.width);
    const y = (clientY - rect.top) * (canvas.height / rect.height);
    setCreatorCurrentStroke(prev => [...prev, { x, y }]);
    const ctx = canvas.getContext('2d');
    ctx.lineTo(x, y);
    ctx.stroke();
    setCreatorHasSignature(true);
  }

  function handleCreatorPointerUp() {
    if (creatorCurrentStroke.length > 0) {
      setCreatorStrokes(prev => [...prev, creatorCurrentStroke]);
      setCreatorCurrentStroke([]);
    }
  }

  function clearCreatorSignature() {
    const canvas = creatorCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setCreatorStrokes([]);
    setCreatorCurrentStroke([]);
    setCreatorHasSignature(false);
    setCreatorSignature(null);
  }

  // ── Populate editable sections ──
  function populateEditableSections() {
    const formattedDate = effectiveDate
      ? new Date(effectiveDate + 'T00:00:00').toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
      : new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

    const isCast = !CREW_TYPES.includes(lineItem?.type);

    const providerIdClause = isCast
      ? `${providerName || '[Please complete]'}, ID/Passport number ${providerIdNumber || '[Please complete]'}, with a principal place of business at ${providerAddress || '[Please complete]'} ("Service Provider"),`
      : `${providerName || '[Please complete]'} [ID/Passport number ${providerIdNumber || '[Please complete]'}], with a principal place of business at ${providerAddress || '[Please complete]'} ("Service Provider"),`;

    const introText = `This Services Agreement ("Agreement") is made and entered into on ${formattedDate} ("Effective Date"), by and between Particle Aesthetic Science Ltd., a company registered in Israel, with a principal place of business at King George 48, Tel Aviv ("Company"), and ${providerIdClause}\n\nWHEREAS, Service Provider has the skills, resources, know-how and ability required to provide the Services and create the Deliverables (each as defined below); and\n\nWHEREAS, based on Service Provider's representations hereunder, the parties desire that Service Provider provide the Services as an independent contractor of Company upon the terms and conditions hereinafter specified;\n\nNOW, THEREFORE, the parties hereby agree as follows:`;
    setEditableIntro(introText);

    let bodyText;
    if (isCast) {
      bodyText = `1. DEFINITIONS\n\nFor purposes of this Agreement (including any and all amendments made to or incorporated herein now or in the future), the following capitalized terms shall have the following meaning:\n\n"Content" shall mean any testimonials, data, personal stories and details, names, locations, videos, photos, audio, and any breakdown, definition or partition of video, film or TV clips, including images, sound footage and segments, recorded performance, interviews, likeness and voice of the Service Provider as embodied therein, and any and all other information which may be provided by the Service Provider to Company in connection with the Services.\n\n"Intellectual Property Rights" shall mean all worldwide, whether registered or not (i) patents, patent applications and patent rights; (ii) rights associated with works of authorship, including copyrights, copyrights applications, copyrights restrictions; (iii) rights relating to the protection of trade secrets and confidential information; (iv) trademarks, logos, service marks, brands, trade names, domain names, goodwill and the right to publicity; (v) rights analogous to those set forth herein and any other proprietary rights relating to intangible property; (vi) all other intellectual and industrial property rights (of every kind and nature throughout the world and however designated) whether arising by operation of law, contract, license, or otherwise; and (vii) all registrations, initial applications, renewals, extensions, continuations, divisions or reissues thereof now or hereafter in force (including any rights in any of the foregoing).\n\n2. SERVICES\n\nService Provider shall provide Company with modeling services all in accordance with the Company's instructions, including the instructions set forth in Exhibit A attached hereto and to Company's full satisfaction ("Services"). Service Provider shall be liable for full compliance with the terms and conditions of this Agreement and for any negligent acts and omissions in connection therewith.\n\n3. COMPENSATION\n\n3.1 Consideration. In consideration for the Services provided herein, Company shall pay Service Provider the fees set forth in Exhibit B attached hereto in accordance with the milestones therein. Such payments shall be the full and final consideration of Service Provider and no additional payments shall be made including without limitation payments for overtime or other. Payments shall be made net thirty (30) days after Company's receipt of an undisputed invoice. Company may deduct and withhold from any payments made hereunder all sums which it then may be required to deduct or withhold pursuant to any applicable statute, law, regulation or order of any jurisdiction whatsoever.\n\n3.2 Taxes. The consideration hereunder shall include all taxes, levies and charges however designated and levied by any state, local, or government agency (including sales taxes and VAT). Service Provider shall have sole responsibility for the payment of all of taxes, levies and charges.\n\n3.3 Expenses. Except for expenses pre-approved in writing by Company, which will be paid against an itemized invoice, Service Provider shall bear all of its expenses arising from the performance or obligations under this Agreement.\n\n4. WAIVER AND CONSENT\n\nCompany exclusively own and shall continue to own all right title and interest in and to the Content, Company Confidential Information (defined below) and any modifications, enhancements, improvements and derivatives thereof and all Intellectual Property Rights thereto (including without limitation, performing rights, rights to publicity and copyrights), upon creation thereof ("Company IPR"). Without derogating from the generality of the foregoing, Company may use and otherwise exploit the Content in any media and/or platform whatsoever (including, without limitation, websites, social media, marketing materials and streaming platforms), including, without limitation, reproduce, display, exhibit, publish, publicly make available, transmit, distribute, broadcast, create derivative works, edit, change, use in advertisements or any other marketing materials, in Company's current or future products, services or features, and/or otherwise use and/or exploit the Content as Company deems appropriate at its sole discretion without any restrictions. Service Provider hereby agrees to automatically assign to Company all right, title and interest in and to the Company IPR upon creation thereof.\n\nService Provider unconditionally and irrevocably waives, releases and forever discharges any rights, claims, charges or demands whatsoever, in the past, present or future, whether under contract, law, equity or otherwise, in respect of the Company IPR and PII (as defined below) and/or any use thereof, including, without limitation, in connection with invasion of privacy, defamation, right of publicity, performing rights, moral rights, right to receive compensation or royalties including any compensation under Section 134 the Israeli Patent Law-1967 or other applicable laws, or any liability, damages and expenses of any kind or all analogous/similar rights throughout the world or any other cause of action in respect of the Company IPR or its use. Service Provider undertakes not to contest Company's rights to the Company IPR. Service Provider acknowledges that nothing herein shall obligate Company to use the Content or any part thereof.\n\nCompany may collect, process and retain the Service Provider's personally identifiable information ("PII") derived in connection with the Services. Such PII may be made available by the Company to third parties, including without limitation, to Company's affiliates, shareholders, partners, agents, contractors and advisors, whether local or foreign, all as part of the Content, in order to further the purposes herein. Company may also transfer PII as part of the Content to third parties in connection with a reorganization, merger, share purchase or sale of substantially all of Company's assets. Service Provider hereby confirms that it is not legally required to provide its PII and such PII is provided at the Service Provider's volition.\n\n5. CONFIDENTIALITY\n\nThis Agreement, the provision of the Services, Company IPR and all information related to the Company, its affiliates, its and their shareholders, employees, directors and agents and/or to their business, products and services are confidential information of Company ("Confidential Information"). Service Provider agrees to protect the Confidential Information with the highest degree of care and keep confidential and not disclose, disseminate, allow access to or use any Confidential Information except as required for the provision of the Services.\n\n6. WARRANTIES AND REPRESENTATIONS\n\nService Provider hereby warrants and represents that: (i) it has the requisite professional qualifications, knowledge, know-how, expertise, skill, talent and experience required in order to perform the Services in a professional and efficient manner; (ii) there are no limitations, obligations or restrictions whatsoever which restrict or prevent Service Provider from fulfilling all of its obligations or grant the rights granted to Company under this Agreement; (iii) it will perform its obligations under this Agreement in compliance with all applicable laws, rules and regulations; and (iv) it has and shall continue to obtain all applicable consents, permits, licenses, certifications and authorizations in connection with the Services.\n\n7. INDEMNIFICATION\n\nService Provider shall indemnify, hold harmless, and at Company's first request, defend Company, its affiliates and their officers, directors, agents and employees, against all claims, liabilities, damages, losses and expenses, including attorneys' fees, arising out of or in any way connected with or based on: (i) Service Provider's breach of any of its representations and warranties herein; and/or (ii) a determination by a competent authority that is contrary to Section 9.3 below.\n\n8. TERM AND TERMINATION\n\n8.1 Term of Agreement. This Agreement shall be effective from the Effective Date and shall remain in effect for the duration of the Services, unless earlier terminated as provided hereunder ("Term"). The Term may be extended by the Company at its sole discretion.\n\n8.2 Termination for Convenience. Company may terminate this Agreement at any time for convenience upon written notice to the Service Provider.\n\n8.3 Termination for Cause. Notwithstanding the above, this Agreement may be terminated by either party upon written notice to the other party if such other party breaches a material term or condition of this Agreement and fails to completely cure such breach within fourteen (14) days after receipt of said notice of such breach.\n\n8.4 Consequences. Upon termination or expiration of this Agreement, Service Provider shall at Company's option, either deliver to Company or delete/destroy all Confidential Information in its possession or under its control, in any media or form whatsoever. The provisions of Sections 1, 4, 5, 6, 7, 8.4 and 9 shall survive termination or expiration of this Agreement and shall remain in full force and effect in perpetuity.\n\n9. MISCELLANEOUS\n\n9.1 Assignment. Service Provider may not assign or transfer any of its rights or obligations hereunder to any third party without the prior written consent of Company. Company may assign its rights or obligations hereunder at its sole discretion. Any assignment without Company's prior written consent shall be deemed null and void.\n\n9.2 Independent Contractors. It is hereby clarified that Service Provider is an independent contractor of Company under this Agreement and nothing herein shall be construed to create a joint venture, partnership or an employer/employee relationship. Service Provider may not make any representations, warranties, covenants or undertakings on behalf of Company and may not represent Company.\n\n9.3 No Waiver. All waivers must be in writing. A waiver by either of the parties hereto shall not be construed to be a waiver of any succeeding breach thereof or of any covenant, condition, or agreement herein contained.\n\n9.4 Governing Law. This Agreement shall be exclusively governed by, construed and interpreted in accordance with the laws of the State of Israel. Any action arising out of or in any way connected with this Agreement shall be brought exclusively in the courts of Tel Aviv, Israel.\n\n9.5 Entire Agreement. This Agreement and its Exhibits constitute the entire agreement between the parties.\n\n9.6 Amendment. This Agreement may only be amended by an instrument in writing signed by each of the parties hereto.\n\n9.7 Notices. All notices shall be in writing and shall be deemed duly given upon receipt, if delivered personally, sent by air courier, or sent by electronic transmission.\n\n9.8 Deduction/Set-Off. Company may at any time deduct or set-off any or all amounts which it deems it has already paid to Company.`;
    } else {
      bodyText = `1. DEFINITIONS\n\nFor purposes of this Agreement (including any and all amendments made to or incorporated herein now or in the future), the following capitalized terms shall have the following meaning:\n\n"Deliverables" shall mean all deliverables provided or produced as a result of the work performed under this Agreement or in connection therewith, including, without limitation, any work products, composition, photographs, videos, information, specifications, documentation, content, designs, audio, and any breakdown, definition or partition of video, film or clips, images, sound footage and segments, recorded performance, including as set forth in Exhibit A, all in any media or form whatsoever.\n\n"Intellectual Property Rights" shall mean all worldwide, whether registered or not (i) patents, patent applications and patent rights; (ii) rights associated with works of authorship, including copyrights, copyrights applications, copyrights restrictions; (iii) rights relating to the protection of trade secrets and confidential information; (iv) trademarks, logos, service marks, brands, trade names, domain names, goodwill and the right to publicity; (v) rights analogous to those set forth herein and any other proprietary rights relating to intangible property; (vi) all other intellectual and industrial property rights (of every kind and nature throughout the world and however designated) whether arising by operation of law, contract, license, or otherwise; and (vii) all registrations, initial applications, renewals, extensions, continuations, divisions or reissues thereof now or hereafter in force (including any rights in any of the foregoing).\n\n"Services" shall have the meaning ascribed to it in Section 2 below.\n\n"Specifications" shall mean Company's specifications for the Deliverables attached hereto as Exhibit A or as otherwise provided to Service Provider by Company from time to time.\n\n2. SERVICES\n\nService Provider shall provide Company with the services and deliver the Company the Deliverables all as detailed in Exhibit A, and all in accordance with the milestones and timelines set forth therein and in accordance with Company's instructions and to its full satisfaction ("Services"). Service Provider shall be liable for full compliance with the terms and conditions of this Agreement and for any negligent acts and omissions in connection therewith. Service Provider is and shall remain solely responsible and liable for obtaining, paying for, repairing and maintaining all the equipment, hardware and services required for providing the Services.\n\n3. COMPENSATION\n\n3.1 Consideration. In consideration for the Services provided herein, Company shall pay Service Provider the fees set forth in Exhibit B attached hereto in accordance with the milestones therein. Such payments shall be the full and final consideration of Service Provider and no additional payments shall be made including without limitation payments for overtime or other. Payments shall be made net thirty (30) days after Company's receipt of an undisputed invoice. Company may deduct and withhold from any payments made hereunder all sums which it then may be required to deduct or withhold pursuant to any applicable statute, law, regulation or order of any jurisdiction whatsoever.\n\n3.2 Taxes. The consideration hereunder shall include all taxes, levies and charges however designated and levied by any state, local, or government agency (including sales taxes and VAT). Service Provider shall have sole responsibility for the payment of all of taxes, levies and charges.\n\n3.3 Expenses. Except for expenses pre-approved in writing by Company, which will be paid against an itemized invoice, Service Provider shall bear all of its expenses arising from the performance or obligations under this Agreement.\n\n4. PROPRIETARY RIGHTS\n\nThe Specifications, Deliverables, Company Confidential Information (defined below) and any and all modifications, enhancements and derivatives thereof and all Intellectual Property Rights thereto ("Company IPR") are and shall be owned exclusively by Company upon their creation and shall be deemed works for hire by Service Provider for Company. Without derogating from the foregoing, any and all content or material provided by Company constitutes Company IPR. Service Provider hereby assigns and agrees to assign to Company exclusive ownership and all right, title and interest the Company IPR. Service Provider hereby waives all right, title and interest in and to the Company IPR, including moral rights and any right to compensation or royalties including pursuant to Section 134 to the Israel Patent Law - 1967. Service Provider agrees to assist Company in every proper way to obtain for Company and enforce any Intellectual Property Rights in the Company IPR in any and all countries. Service Provider hereby irrevocably designates and appoints Company and its authorized officers and agents as Service Provider's agent and attorney in fact, coupled with an interest to act for and on Service Providers behalf and in Service Provider's stead to do all lawfully permitted acts to further the prosecution and issuance of Company IPR or any other right or protection relating to any Company IPR, with the same legal force and effect as if executed by Service Provider itself. Service Provider shall ensure that all of its employees and contractors sign terms no less restrictive and no less protective of Company and Company IPR as the terms set forth in this agreement.\n\n5. CONFIDENTIALITY\n\nThis Agreement, the provision of the Services, Company IPR and all data and information related to the Company, its affiliates, its and their shareholders, employees, directors and agents and/or to their business, products and services are confidential information of Company ("Confidential Information"). Service Provider agrees to protect the Confidential Information with the highest degree of care and keep confidential and not disclose, disseminate, allow access to or use any Confidential Information except as required for the provision of the Services and creation of the Deliverables.\n\n6. WARRANTIES AND REPRESENTATIONS\n\nService Provider hereby warrants and represents that: (i) it has the requisite professional qualifications, knowledge, know-how, expertise, skill, talent and experience required in order to perform the Services and provide the Deliverables in a professional and efficient manner and shall perform the Services and provide the Deliverables using highest industry standards; (ii) there are no limitations, obligations or restrictions whatsoever which restrict or prevent Service Provider from fulfilling all of its obligations or grant the rights granted to Company under this Agreement; (iii) it will perform its obligations under this Agreement in compliance with all applicable laws, rules, professional standards, certifications and regulations; (iv) the Services and Deliverables: (a) shall be fit for their intended purpose, (b) do not and will not infringe any right of any third party including Intellectual Property Rights or right to privacy, (c) shall strictly comply with the Specifications; and (v) it has and shall continue to obtain all applicable consents, permits, licenses, certifications and authorizations in connection with the Services and Deliverables.\n\n7. INDEMNIFICATION\n\nService Provider shall indemnify, hold harmless, and at Company's first request, defend Company, its affiliates and their officers, directors, agents and employees, against all claims, liabilities, damages, losses and expenses, including attorneys' fees, arising out of or in any way connected with or based on: (i) Service Provider's breach of any of its representations and warranties herein; and/or (ii) a determination by a competent authority that is contrary to Section 9.3 below.\n\n8. TERM AND TERMINATION\n\n8.1 Term of Agreement. This Agreement shall be effective from the Effective Date and shall remain in effect for the duration of the Services, unless earlier terminated as provided hereunder ("Term"). The Term may be extended by the Company at its sole discretion.\n\n8.2 Termination for Convenience. Company may terminate this Agreement at any time for convenience upon five (5) days written notice to the Service Provider.\n\n8.3 Termination for Cause. Notwithstanding the above, this Agreement may be terminated by either party upon written notice to the other party if such other party breaches a material term or condition of this Agreement and fails to completely cure such breach within fourteen (14) days after receipt of said notice of such breach.\n\n8.4 Consequences. Upon termination or expiration of this Agreement, Service Provider shall promptly Deliver to Company all Deliverables (whether completed or not) and at Company's option, either deliver to Company or delete/destroy all Confidential Information in its possession or under its control, in any media or form whatsoever. The provisions of Sections 1, 4, 5, 6, 7, 8.4 and 9 shall survive termination or expiration of this Agreement and shall remain in full force and effect in perpetuity.\n\n9. MISCELLANEOUS\n\n9.1 Subcontracting. The obligation of Service Provider hereunder may not be subcontracted by Service Provider, in whole or in part without the written consent of Company and any such subcontracting without Company's written approval shall be deemed null and void.\n\n9.2 Assignment. Service Provider may not assign or transfer any of its rights or obligations hereunder to any third party without the prior written consent of Company. Company may assign its rights or obligations hereunder at its sole discretion. Any assignment without Company's prior written consent shall be deemed null and void.\n\n9.3 Independent Contractors. It is hereby clarified that Service Provider is an independent contractor of Company under this Agreement and nothing herein shall be construed to create a joint venture, partnership or an employer/employee relationship. Service Provider may not make any representations, warranties, covenants or undertakings on behalf of Company and may not represent Company. Neither Service Provider nor its employees are entitled to any of the benefits or rights to which employees of Company are entitled, and Service Provider shall be solely responsible for all of its employees and agents and its labor costs and expenses arising in connection therewith.\n\n9.4 No Waiver. All waivers must be in writing. A waiver by either of the parties hereto shall not be construed to be a waiver of any succeeding breach thereof or of any covenant, condition, or agreement herein contained.\n\n9.5 Governing Law. This Agreement shall be exclusively governed by, construed and interpreted in accordance with the laws of the State of Israel. Any action arising out of or in any way connected with this Agreement shall be brought exclusively in the courts of Tel Aviv, Israel.\n\n9.6 Entire Agreement. This Agreement and its Exhibits constitute the entire agreement between the parties.\n\n9.7 Amendment. This Agreement may only be amended by an instrument in writing signed by each of the parties hereto.\n\n9.8 Notices. All notices shall be in writing and shall be deemed duly given upon receipt, if delivered personally, sent by air courier, or sent by electronic transmission.\n\n9.9 Deduction/Set-Off. Company may at any time deduct or set-off any or all amounts which it deems it has already paid to Company.\n\n9.10 No Exclusivity. This Agreement does not prevent Company from receiving services same or similar to the Services from any third party.\n\n9.11 Insurance. The Service Provider shall maintain at its sole expense insurance coverages that sufficiently cover all obligations and liabilities in Service Provider's performance of the Services.`;
    }
    setEditableBody(bodyText);

    setEditableExhibitA(exhibitA);

    const currencyName = currency === 'ILS' ? 'ILS' : currency === 'EUR' ? 'EUR' : currency === 'GBP' ? 'GBP' : 'USD';
    const bParts = [];
    if (feeAmount) bParts.push(`Total Fee: ${Number(feeAmount).toLocaleString()} ${currencyName}`);
    if (paymentTerms) bParts.push(`Payment Terms: ${paymentTerms}`);
    if (paymentMethod) bParts.push(`Payment Method: ${paymentMethod}`);
    if (exhibitB) bParts.push(exhibitB);
    setEditableExhibitB(bParts.join('\n\n'));
  }

  // ── Build document history for PDF ──
  function buildDocumentHistory() {
    const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
    const history = [];
    const created = events.find(e => e.type === 'created');
    if (created) history.push({ label: 'Contract Created', date: fmtDate(created.at) });
    const sent = events.find(e => e.type === 'sent');
    if (sent) history.push({ label: `Sent to ${providerName}`, date: fmtDate(sent.at) });
    events.filter(e => e.type === 'signed').forEach(se => {
      const who = se.role === 'hocp' ? 'Particle (HOCP)' : (se.name || 'Provider');
      history.push({ label: `Signed by ${who}`, date: fmtDate(se.at) });
    });
    const completed = events.find(e => e.type === 'completed');
    if (completed) history.push({ label: 'Completed', date: fmtDate(completed.at) });
    return history;
  }

  // ── PDF Preview Generation ──
  async function handleGeneratePdfPreview() {
    const formattedDate = effectiveDate
      ? new Date(effectiveDate + 'T00:00:00').toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
      : new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

    const doc = await generateContractPDF({
      effective_date: formattedDate,
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
      hocp_name: companySignerName,
      logoBase64,
      documentHistory: buildDocumentHistory(),
      isCastType: !CREW_TYPES.includes(lineItem?.type),
    });

    const dataUrl = doc.output('datauristring');
    setPdfDataUrl(dataUrl);
  }

  // ── Generate E-Sign Links ──
  async function handleGenerate() {
    if (!providerName.trim()) return;
    if (!providerEmail.trim()) return;

    setGenerating(true);
    setGenerateError('');
    try {
      // Save contract data first
      upsertContract({
        production_id: contractKey,
        provider_name: providerName,
        provider_email: providerEmail,
        provider_phone: providerPhone,
        exhibit_a: exhibitA,
        exhibit_b: exhibitB,
        fee_amount: feeAmount,
        currency,
        payment_terms: paymentTerms,
        payment_method: paymentMethod,
        provider_id_number: providerIdNumber,
        provider_address: providerAddress,
        effective_date: effectiveDate,
        contract_pdf_base64: pdfDataUrl || '',
        status: 'pending',
        contract_type: !CREW_TYPES.includes(lineItem?.type) ? 'cast' : 'crew',
      });

      // If creator signs in Step 3, capture signature
      let creatorSigBase64 = null;
      if (signerIsCreator && creatorCanvasRef.current) {
        creatorSigBase64 = creatorCanvasRef.current.toDataURL('image/png');
      }

      const result = await generateContractSignatures(contractKey, {
        provider_name: providerName,
        provider_email: providerEmail,
        hocp_name: companySignerName,
        hocp_email: companySignerEmail,
        exhibit_a: exhibitA,
        exhibit_b: exhibitB,
        fee_amount: feeAmount,
        payment_terms: paymentTerms,
        currency,
        contract_type: !CREW_TYPES.includes(lineItem?.type) ? 'cast' : 'crew',
        effective_date: effectiveDate,
        company_signer: companySigner,
        company_signer_name: companySignerName,
        company_signer_email: companySignerEmail,
        company_signer_title: companySignerTitle,
        require_hocp_signature: !signerIsCreator, // true when Tomer/custom signs externally
        creator_signature: creatorSigBase64,
      });

      if (result?.signing_links) {
        setSigningLinks(result.signing_links);
        setStatus(signerIsCreator ? 'sent' : 'awaiting_signer');
        const newEvents = [...events, { type: signerIsCreator ? 'sent' : 'awaiting_signer', at: new Date().toISOString() }];
        setEvents(newEvents);
      }
    } catch (e) {
      const msg = e?.message || 'Failed to generate signing links. Make sure the backend is running.';
      setGenerateError(msg);
    } finally {
      setGenerating(false);
    }
  }

  // ── Send contract via Gmail API ──
  async function handleSendContract() {
    const now = nowISOString();
    const providerLink = signingLinks?.provider?.url || '';
    const token = localStorage.getItem('cp_auth_token');
    const API = import.meta.env.VITE_API_URL || '';

    const toEmail = providerEmail;
    const toName = providerName || 'Service Provider';

    try {
      const res = await fetch(`${API}/api/gmail/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          to: toEmail,
          skipDefaultCc: false,
          subject: `Services Agreement - ${production.project_name}`,
          htmlBody: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; color: #333;">
              <div style="border-bottom: 3px solid #030b2e; padding-bottom: 12px; margin-bottom: 20px;">
                <h2 style="color: #030b2e; margin: 0;">Services Agreement</h2>
                <p style="color: #666; font-size: 13px; margin: 4px 0 0;">${production.project_name}</p>
              </div>
              <p>Dear ${toName},</p>
              <p>We are pleased to share the Services Agreement for <strong>${production.project_name}</strong> between Particle Aesthetic Science Ltd. and ${providerName}.</p>
              <p>Please review the contract details carefully and sign by clicking the button below:</p>
              <p style="margin: 28px 0; text-align: center;">
                <a href="${providerLink}" style="background: #030b2e; color: white; padding: 14px 36px; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 15px;">
                  Review & Sign Contract
                </a>
              </p>
              <p style="color: #666; font-size: 13px;">Once both parties have signed, you will automatically receive a fully executed copy of the agreement via email.</p>
              <p style="color: #888; font-size: 12px; margin-top: 8px;">If the button doesn't work, copy this link:<br/><a href="${providerLink}" style="color: #0808f8;">${providerLink}</a></p>
              <hr style="border: none; border-top: 1px solid #eee; margin: 28px 0 16px;" />
              <p style="color: #030b2e; font-weight: 600; font-size: 13px; margin-bottom: 2px;">Particle Creative Production Team</p>
              <p style="color: #aaa; font-size: 11px; margin: 0;">Particle Aesthetic Science Ltd. · King George 48, Tel Aviv</p>
            </div>
          `,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to send email');
      }
    } catch (err) {
      // Fallback: still mark as sent but warn user
      setSendSuccess(`Warning: Email may not have sent (${err.message}). Contract marked as sent.`);
    }

    const newEvents = [...events, { type: 'sent', at: now }];
    upsertContract({
      production_id: contractKey,
      provider_name: providerName,
      provider_email: providerEmail,
      provider_phone: providerPhone,
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

    // Slack notification — contract sent via email
    fetch(`${API}/api/contracts/notify-slack`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        message: `Contract sent via email: [${production.id}] ${production.project_name} - ${providerName}`,
        link: providerLink || `${window.location.origin}/production/${production.id}`,
      }),
    }).catch(() => {});

    setSendSuccess(`Contract sent to ${providerName}!`);
    setTimeout(() => setSendSuccess(''), 5000);

    // Move to signing status step
    setCurrentStep(5);
    setMaxReachedStep(5);
  }

  // ── Download PDF ──
  async function handleDownloadPdf() {
    const formattedDate = effectiveDate
      ? new Date(effectiveDate + 'T00:00:00').toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
      : new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

    const doc = await generateContractPDF({
      effective_date: formattedDate,
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
      hocp_name: companySignerName,
      logoBase64,
      documentHistory: buildDocumentHistory(),
      isCastType: !CREW_TYPES.includes(lineItem?.type),
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
          signerIsCreator={signerIsCreator}
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
                  <div className="text-[10px] text-gray-400">Signer (Particle)</div>
                  <div className="font-semibold text-gray-700 text-xs">{companySignerName || 'Select below'}</div>
                  <div className="text-[10px] text-gray-400">{companySignerEmail}</div>
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
                    style={!providerIdNumber ? { backgroundColor: '#fefce8', borderColor: '#fbbf24' } : undefined}
                    value={providerIdNumber}
                    onChange={e => setProviderIdNumber(e.target.value)}
                    placeholder="ID or passport number"
                    disabled={isSigned}
                  />
                  {!providerIdNumber && (
                    <div className="text-[10px] text-amber-600 mt-0.5">Provider will fill this when signing</div>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                    Address
                  </label>
                  <input
                    className="brand-input"
                    style={!providerAddress ? { backgroundColor: '#fefce8', borderColor: '#fbbf24' } : undefined}
                    value={providerAddress}
                    onChange={e => setProviderAddress(e.target.value)}
                    placeholder="Provider address"
                    disabled={isSigned}
                  />
                  {!providerAddress && (
                    <div className="text-[10px] text-amber-600 mt-0.5">Provider will fill this when signing</div>
                  )}
                </div>
              </div>
            </div>

            {/* Who signs on behalf of Particle? */}
            <div className="mt-5 p-4 bg-indigo-50 border border-indigo-200 rounded-xl">
              <div className="text-sm font-bold text-indigo-800 mb-3 flex items-center gap-1.5">
                <PenTool size={13} /> Who signs on behalf of Particle?
              </div>
              <div className="space-y-2">
                {[
                  { id: 'omer', label: 'Omer Barak', sub: 'Creative Producer — signs in Step 3 (no external link)', email: 'omer@particleformen.com' },
                  { id: 'tomer', label: 'Tomer Wilf Lezmy', sub: 'HOCP — receives signing link via email', email: 'tomer@particleformen.com' },
                  { id: 'custom', label: 'Someone else', sub: 'Enter name and email below' },
                ].map(opt => (
                  <label key={opt.id} className={clsx(
                    'flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all',
                    companySigner === opt.id
                      ? 'border-indigo-400 bg-white shadow-sm'
                      : 'border-transparent hover:bg-white/50'
                  )}>
                    <input
                      type="radio"
                      name="companySigner"
                      value={opt.id}
                      checked={companySigner === opt.id}
                      onChange={() => setCompanySigner(opt.id)}
                      className="mt-1 accent-indigo-600"
                      disabled={isSigned}
                    />
                    <div>
                      <div className="text-sm font-semibold text-gray-800">{opt.label}</div>
                      <div className="text-[10px] text-gray-500">{opt.sub}</div>
                      {opt.email && <div className="text-[10px] text-indigo-500 mt-0.5">{opt.email}</div>}
                    </div>
                  </label>
                ))}
                {companySigner === 'custom' && (
                  <div className="grid grid-cols-2 gap-2 mt-2 pl-8">
                    <input className="brand-input text-sm" placeholder="Full name" value={customSignerName} onChange={e => setCustomSignerName(e.target.value)} disabled={isSigned} />
                    <input className="brand-input text-sm" placeholder="Email" type="email" value={customSignerEmail} onChange={e => setCustomSignerEmail(e.target.value)} disabled={isSigned} />
                    <input className="brand-input text-sm col-span-2" placeholder="Title (e.g., Production Manager)" value={customSignerTitle} onChange={e => setCustomSignerTitle(e.target.value)} disabled={isSigned} />
                  </div>
                )}
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

            {/* Effective Date */}
            <div className="mb-5">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-2 h-2 rounded-full bg-gray-400" />
                <label className="text-sm font-bold text-gray-700">Effective Date</label>
              </div>
              <input
                type="date"
                className="brand-input"
                style={{ maxWidth: 220 }}
                value={effectiveDate}
                onChange={e => setEffectiveDate(e.target.value)}
                disabled={isSigned}
              />
              <div className="text-[10px] text-gray-400 mt-0.5">Date this agreement takes effect</div>
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
                    <div className="flex items-center gap-1">
                      <select
                        className="brand-input text-xs"
                        style={{ width: 64, padding: '6px 4px', flexShrink: 0 }}
                        value={currency}
                        onChange={e => setCurrency(e.target.value)}
                        disabled={isSigned}
                      >
                        <option value="USD">$</option>
                        <option value="ILS">&#8362;</option>
                        <option value="EUR">&euro;</option>
                        <option value="GBP">&pound;</option>
                      </select>
                      <input
                        type="number"
                        className="brand-input"
                        style={{ flex: 1, minWidth: 0 }}
                        value={feeAmount}
                        onChange={e => setFeeAmount(e.target.value)}
                        placeholder="0.00"
                        disabled={isSigned}
                      />
                    </div>
                    {feeAmount && (
                      <div className="text-[10px] text-green-600 mt-0.5 font-semibold">
                        {Number(feeAmount).toLocaleString()} {currency === 'ILS' ? 'ILS' : currency === 'EUR' ? 'EUR' : currency === 'GBP' ? 'GBP' : 'USD'}
                      </div>
                    )}
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
                onClick={goNext}
                disabled={!canProceedStep2}
                className={clsx(
                  'flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold transition-colors',
                  canProceedStep2
                    ? 'bg-blue-600 hover:bg-blue-700 text-white'
                    : 'bg-gray-100 text-gray-400 cursor-default'
                )}
              >
                <Eye size={14} /> Preview Contract <ChevronRight size={14} />
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
              <div className="text-sm font-bold text-gray-700">Contract Preview</div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setEditMode(!editMode)}
                  className={clsx(
                    'text-xs flex items-center gap-1 px-2.5 py-1 rounded border transition-colors',
                    editMode
                      ? 'bg-amber-50 border-amber-400 text-amber-700 font-bold'
                      : 'border-gray-200 text-gray-600 hover:text-gray-800 hover:bg-gray-50'
                  )}
                >
                  <Edit3 size={10} /> {editMode ? 'Editing ON' : 'Edit Text'}
                </button>
                <button
                  onClick={() => { setEditMode(false); handleGeneratePdfPreview(); }}
                  className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1 px-2 py-1 rounded border border-blue-200 hover:bg-blue-50"
                >
                  <Eye size={10} /> Refresh PDF
                </button>
                <button
                  onClick={handleDownloadPdf}
                  className="text-xs text-gray-600 hover:text-gray-800 flex items-center gap-1 px-2 py-1 rounded border border-gray-200 hover:bg-gray-50"
                >
                  <Download size={10} /> Download PDF
                </button>
              </div>
            </div>

            {/* Editable Effective Date in preview */}
            <div className="flex items-center gap-3 mb-3 bg-gray-50 rounded-lg px-3 py-2 border border-gray-200">
              <label className="text-xs font-semibold text-gray-500 whitespace-nowrap">Effective Date:</label>
              <input
                type="date"
                className="brand-input text-sm"
                style={{ maxWidth: 180, padding: '4px 8px' }}
                value={effectiveDate}
                onChange={e => {
                  setEffectiveDate(e.target.value);
                  // Auto-refresh preview after date change
                  setTimeout(() => handleGeneratePdfPreview(), 100);
                }}
                disabled={isSigned}
              />
              <span className="text-xs text-gray-400">
                {effectiveDate ? new Date(effectiveDate + 'T00:00:00').toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : 'Not set'}
              </span>
            </div>

            {editMode && (
              <div className="text-[10px] text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5 mb-3">
                Edit mode is ON. Modify the text below, then click &ldquo;Refresh PDF&rdquo; or &ldquo;Download PDF&rdquo; to generate the final document.
              </div>
            )}

            {/* Editable Contract Sections */}
            <div className="border border-gray-200 rounded-xl overflow-hidden mb-4" style={{ maxHeight: 520, overflowY: 'auto' }}>
              {/* Letterhead */}
              <div className="bg-[#030b2e] text-white px-5 py-3">
                <div className="flex items-center justify-between">
                  <div>
                    {logoBase64
                      ? <img src={logoBase64} alt="Particle" style={{ maxWidth: 250, maxHeight: 50, objectFit: 'contain' }} />
                      : <div className="text-lg font-bold tracking-wider">PARTICLE <span className="text-xs font-normal">for men</span></div>
                    }
                  </div>
                  <div className="text-right text-xs">
                    <div>{PARTICLE_COMPANY.name}</div>
                    <div>{PARTICLE_COMPANY.address}</div>
                    <div>Date: {effectiveDate ? new Date(effectiveDate + 'T00:00:00').toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : 'Not set'}</div>
                  </div>
                </div>
              </div>

              <div className="p-5">
                {/* Title */}
                <div className="text-center text-base font-bold text-[#030b2e] mb-4">SERVICES AGREEMENT</div>

                {/* Intro section */}
                <div
                  ref={editIntroRef}
                  contentEditable={editMode}
                  suppressContentEditableWarning
                  onBlur={e => setEditableIntro(e.currentTarget.innerText)}
                  className={clsx(
                    'text-sm text-gray-700 whitespace-pre-wrap mb-4 p-2 rounded outline-none',
                    editMode && 'border-2 border-amber-300 bg-amber-50/30 focus:border-amber-500'
                  )}
                >
                  {editableIntro}
                </div>

                {production.project_name && (
                  <div className="text-sm font-bold text-[#030b2e] mb-3">Production: {production.project_name}</div>
                )}

                {/* Agreement Body — Full Contract Text */}
                <div
                  ref={editBodyRef}
                  contentEditable={editMode}
                  suppressContentEditableWarning
                  onBlur={e => setEditableBody(e.currentTarget.innerText)}
                  className={clsx(
                    'text-xs text-gray-700 whitespace-pre-wrap mb-4 p-2 rounded outline-none leading-relaxed',
                    editMode && 'border-2 border-amber-300 bg-amber-50/30 focus:border-amber-500'
                  )}
                  style={{ maxHeight: editMode ? 'none' : undefined, fontSize: '11px', lineHeight: '1.6' }}
                >
                  {editableBody}
                </div>

                {/* Exhibit A */}
                <div className="bg-blue-50 border-l-4 border-blue-400 px-3 py-2 mb-4">
                  <div className="text-sm font-bold text-blue-700 mb-1">EXHIBIT A -- Services & Instructions</div>
                  <div
                    ref={editExhibitARef}
                    contentEditable={editMode}
                    suppressContentEditableWarning
                    onBlur={e => {
                      setEditableExhibitA(e.currentTarget.innerText);
                      setExhibitA(e.currentTarget.innerText);
                    }}
                    className={clsx(
                      'text-sm text-gray-700 whitespace-pre-wrap p-1 rounded outline-none',
                      editMode && 'border-2 border-amber-300 bg-white focus:border-amber-500'
                    )}
                  >
                    {editableExhibitA}
                  </div>
                </div>

                {/* Exhibit B */}
                <div className="bg-green-50 border-l-4 border-green-400 px-3 py-2 mb-4">
                  <div className="text-sm font-bold text-green-700 mb-1">EXHIBIT B -- Fees & Payment</div>
                  <div
                    ref={editExhibitBRef}
                    contentEditable={editMode}
                    suppressContentEditableWarning
                    onBlur={e => setEditableExhibitB(e.currentTarget.innerText)}
                    className={clsx(
                      'text-sm text-gray-700 whitespace-pre-wrap p-1 rounded outline-none',
                      editMode && 'border-2 border-amber-300 bg-white focus:border-amber-500'
                    )}
                  >
                    {editableExhibitB}
                  </div>
                </div>

                {/* Signature Blocks */}
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mt-4">
                  <div className="text-sm font-bold text-[#030b2e] mb-3">SIGNATURES</div>
                  <div className="grid grid-cols-2 gap-6 text-xs text-gray-600">
                    <div>
                      <div className="font-semibold mb-1">For the Company:</div>
                      <div>{PARTICLE_COMPANY.name}</div>
                      <div>Name: {companySignerName}</div>
                      <div>Title: {companySignerTitle}</div>
                      <div>Date: {effectiveDate || new Date().toISOString().slice(0, 10)}</div>
                      {tomerSignature ? (
                        <img src={tomerSignature} alt="Signature" className="h-12 mt-2" />
                      ) : (
                        <>
                          <div className="border-b border-gray-400 mt-4 mb-1" />
                          <div className="text-[10px] text-gray-400">Signature</div>
                        </>
                      )}
                    </div>
                    <div>
                      <div className="font-semibold mb-1">Service Provider:</div>
                      <div>{providerName || '___________'}</div>
                      <div>ID: {providerIdNumber || '___________'}</div>
                      <div className="border-b border-gray-400 mt-4 mb-1" />
                      <div className="text-[10px] text-gray-400">Signature</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Contract summary */}
            <div className="bg-gray-50 rounded-xl p-3 mb-4 text-xs">
              <div className="grid grid-cols-2 gap-2">
                <div><span className="text-gray-400">Provider:</span> <strong>{providerName}</strong></div>
                <div><span className="text-gray-400">Email:</span> <strong>{providerEmail}</strong></div>
                <div><span className="text-gray-400">Fee:</span> <strong>{currency} {Number(feeAmount).toLocaleString()}</strong></div>
                <div><span className="text-gray-400">Production:</span> <strong>{production.project_name}</strong></div>
              </div>
            </div>

            {/* Creator signature canvas (when Omer signs in Step 3) */}
            {signerIsCreator && (
              <div className="mt-6 p-4 bg-indigo-50 border border-indigo-200 rounded-xl">
                <div className="text-sm font-bold text-indigo-800 mb-2 flex items-center gap-2">
                  <PenTool size={14} /> Sign as {companySignerName}
                </div>
                <div className="text-[10px] text-indigo-600 mb-3">
                  Your signature will be embedded in the contract before sending to the supplier.
                </div>
                <div className="relative border-2 border-dashed border-indigo-300 rounded-xl bg-white overflow-hidden">
                  <canvas
                    ref={creatorCanvasRef}
                    width={600}
                    height={200}
                    className="w-full cursor-crosshair touch-none block"
                    style={{ height: 120 }}
                    onMouseDown={handleCreatorPointerDown}
                    onMouseMove={handleCreatorPointerMove}
                    onMouseUp={handleCreatorPointerUp}
                    onMouseLeave={handleCreatorPointerUp}
                    onTouchStart={handleCreatorPointerDown}
                    onTouchMove={handleCreatorPointerMove}
                    onTouchEnd={handleCreatorPointerUp}
                  />
                  <div className="absolute bottom-6 left-6 right-6 border-b border-dashed border-gray-300 pointer-events-none" />
                  {!creatorHasSignature && (
                    <div className="absolute bottom-2 left-6 text-[10px] text-gray-300 pointer-events-none">Draw your signature above</div>
                  )}
                </div>
                <div className="flex gap-2 mt-2">
                  <button type="button" onClick={clearCreatorSignature}
                    className="text-xs px-3 py-1 rounded border border-gray-200 text-gray-500 hover:bg-gray-50">
                    Clear
                  </button>
                </div>
              </div>
            )}

            {/* Navigation */}
            <div className="flex gap-3 mt-4">
              <button onClick={goBack} className="btn-secondary flex items-center gap-1">
                <ChevronLeft size={14} /> Back
              </button>
              <div className="flex-1" />
              <button
                onClick={() => {
                  setEditMode(false);
                  if (!signingLinks) handleGenerate();
                  goNext();
                }}
                disabled={signerIsCreator && !creatorHasSignature}
                className={clsx(
                  'flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold transition-colors',
                  (signerIsCreator && !creatorHasSignature)
                    ? 'bg-gray-200 text-gray-400 cursor-default'
                    : 'bg-purple-600 hover:bg-purple-700 text-white'
                )}
              >
                <Send size={14} /> {signerIsCreator ? 'Sign & Send to Supplier' : 'Proceed to Send'} <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════
            STEP 4: Send for Signature
        ═══════════════════════════════════════════════════ */}
        {currentStep === 4 && (
          <div>
            {/* Auto-generate signing links if not yet done */}
            {!signingLinks && !generating && !generateError && !autoGenTriggered && providerName.trim() && providerEmail.trim() && (() => {
              // Use ref to prevent multiple triggers
              if (!autoGenTriggered) {
                setAutoGenTriggered(true);
                setTimeout(() => handleGenerate(), 100);
              }
              return (
                <div className="flex items-center justify-center py-8">
                  <div className="w-6 h-6 border-2 border-purple-300 border-t-purple-600 rounded-full animate-spin mr-3" />
                  <span className="text-sm text-gray-500">Preparing signing link...</span>
                </div>
              );
            })()}

            {generating && (
              <div className="flex items-center justify-center py-8">
                <div className="w-6 h-6 border-2 border-purple-300 border-t-purple-600 rounded-full animate-spin mr-3" />
                <span className="text-sm text-gray-500">Generating signing link...</span>
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

            {/* Success toast */}
            {sendSuccess && (
              <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-xl px-4 py-3 mb-4 text-sm text-green-700 font-semibold">
                <CheckCircle size={16} className="text-green-600" />
                {sendSuccess}
              </div>
            )}

            {/* ── Status Dashboard ── */}
            {signingLinks && signerIsCreator && (
              <>
                {/* Creator already signed in Step 3 — show confirmation */}
                <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center">
                      <CheckCircle size={16} className="text-green-600" />
                    </div>
                    <div>
                      <div className="text-[10px] font-bold text-green-500 uppercase tracking-wide">Company Signature</div>
                      <div className="text-sm font-semibold text-green-800">Signed by {companySignerName}</div>
                      <div className="text-[10px] text-green-600">Signature embedded in contract</div>
                    </div>
                  </div>
                </div>

                {/* Supplier signing — send link */}
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-4">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
                      <Send size={16} className="text-blue-600" />
                    </div>
                    <div>
                      <div className="text-[10px] font-bold text-blue-500 uppercase tracking-wide">Supplier Signature</div>
                      <div className="text-sm font-semibold text-blue-800">Send to {providerName}</div>
                      <div className="text-[10px] text-blue-600">{providerEmail}</div>
                    </div>
                  </div>
                  {signingLinks.provider && (
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => { navigator.clipboard.writeText(signingLinks.provider.url); handleCopyMsg('Signing link copied!'); }}
                        className="text-xs px-3 py-1.5 rounded-lg border border-blue-200 text-blue-600 hover:bg-blue-100 flex items-center gap-1.5"
                      >
                        <Copy size={10} /> Copy Link
                      </button>
                      <button
                        onClick={handleSendContract}
                        className="text-xs px-3 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 flex items-center gap-1.5"
                      >
                        <Mail size={10} /> Send via Email
                      </button>
                      {providerPhone ? (
                        <button
                          onClick={() => {
                            const text = `Hi ${providerName},\n\nPlease sign the contract for ${production.project_name}:\n${signingLinks.provider.url}\n\nThank you!`;
                            const phone = providerPhone.replace(/[^0-9+]/g, '');
                            window.open(`https://wa.me/${phone}?text=${encodeURIComponent(text)}`, '_blank');
                          }}
                          className="text-xs px-3 py-1.5 rounded-lg bg-green-600 text-white hover:bg-green-700 flex items-center gap-1.5"
                        >
                          <MessageCircle size={10} /> WhatsApp
                        </button>
                      ) : (
                        <div className="flex items-center gap-1">
                          <input
                            type="tel"
                            className="brand-input text-xs"
                            style={{ width: 140, padding: '4px 8px' }}
                            placeholder="Phone for WhatsApp"
                            value={providerPhone}
                            onChange={e => setProviderPhone(e.target.value)}
                          />
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="text-[10px] text-gray-400 text-center mb-4">
                  Once the supplier signs, the contract will be fully executed and saved.
                </div>
              </>
            )}

            {signingLinks && !signerIsCreator && (
              <>
                {/* Phase 1: Company signer */}
                {(() => {
                  const hocpSig = signatures.find(s => s.signer_role === 'hocp');
                  const hocpSigned = hocpSig?.signed_at;
                  return (
                    <div className={clsx(
                      'rounded-xl p-4 mb-4 border',
                      hocpSigned ? 'bg-green-50 border-green-200' : 'bg-orange-50 border-orange-200'
                    )}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className={clsx(
                            'w-8 h-8 rounded-full flex items-center justify-center',
                            hocpSigned ? 'bg-green-100' : 'bg-orange-100'
                          )}>
                            {hocpSigned
                              ? <CheckCircle size={16} className="text-green-600" />
                              : <Clock size={16} className="text-orange-500" />
                            }
                          </div>
                          <div>
                            <div className="text-[10px] font-bold uppercase tracking-wide" style={{ color: hocpSigned ? '#16a34a' : '#ea580c' }}>
                              Step 1 of 2: Company Signature
                            </div>
                            <div className="text-sm font-semibold text-gray-800">{companySignerName}</div>
                            <div className="text-[10px] text-gray-500">{companySignerEmail}</div>
                            {hocpSigned && <div className="text-[10px] text-green-600">Signed {formatIST(hocpSig.signed_at)}</div>}
                          </div>
                        </div>
                        <span className={clsx(
                          'text-[10px] font-bold px-2 py-0.5 rounded-full',
                          hocpSigned ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'
                        )}>
                          {hocpSigned ? 'SIGNED' : 'WAITING'}
                        </span>
                      </div>
                      {!hocpSigned && signingLinks.hocp && (
                        <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-orange-200">
                          <button
                            onClick={() => { navigator.clipboard.writeText(signingLinks.hocp.url); handleCopyMsg('Signer link copied!'); }}
                            className="text-xs px-3 py-1.5 rounded-lg border border-orange-200 text-orange-600 hover:bg-orange-100 flex items-center gap-1.5"
                          >
                            <Copy size={10} /> Copy Link
                          </button>
                          <button
                            onClick={() => {
                              const mailLink = `mailto:${companySignerEmail}?subject=${encodeURIComponent(`Sign: ${production.project_name} Contract`)}&body=${encodeURIComponent(`Please sign the contract:\n${signingLinks.hocp.url}`)}`;
                              window.open(mailLink, '_blank');
                            }}
                            className="text-xs px-3 py-1.5 rounded-lg border border-orange-200 text-orange-600 hover:bg-orange-100 flex items-center gap-1.5"
                          >
                            <Mail size={10} /> Email Signer
                          </button>
                        </div>
                      )}
                      {!hocpSigned && (
                        <div className="text-[10px] text-orange-500 mt-2">
                          Next: Once {companySignerName} signs, the contract will auto-send to {providerName}.
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* Phase 2: Supplier */}
                <div className={clsx(
                  'rounded-xl p-4 mb-4 border',
                  signatures.find(s => s.signer_role === 'hocp')?.signed_at
                    ? 'bg-blue-50 border-blue-200'
                    : 'bg-gray-50 border-gray-200 opacity-60'
                )}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={clsx(
                        'w-8 h-8 rounded-full flex items-center justify-center',
                        signatures.find(s => s.signer_role === 'hocp')?.signed_at ? 'bg-blue-100' : 'bg-gray-100'
                      )}>
                        <Send size={16} className={signatures.find(s => s.signer_role === 'hocp')?.signed_at ? 'text-blue-600' : 'text-gray-400'} />
                      </div>
                      <div>
                        <div className="text-[10px] font-bold uppercase tracking-wide text-blue-500">
                          Step 2 of 2: Supplier Signature
                        </div>
                        <div className="text-sm font-semibold text-gray-800">{providerName}</div>
                        <div className="text-[10px] text-gray-500">{providerEmail}</div>
                      </div>
                    </div>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">PENDING</span>
                  </div>
                  {signatures.find(s => s.signer_role === 'hocp')?.signed_at && signingLinks.provider && (
                    <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-blue-200">
                      <button
                        onClick={() => { navigator.clipboard.writeText(signingLinks.provider.url); handleCopyMsg('Supplier link copied!'); }}
                        className="text-xs px-3 py-1.5 rounded-lg border border-blue-200 text-blue-600 hover:bg-blue-100 flex items-center gap-1.5"
                      >
                        <Copy size={10} /> Copy Link
                      </button>
                      <button
                        onClick={handleSendContract}
                        className="text-xs px-3 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 flex items-center gap-1.5"
                      >
                        <Mail size={10} /> Send via Email
                      </button>
                      {providerPhone ? (
                        <button
                          onClick={() => {
                            const text = `Hi ${providerName},\n\nPlease sign the contract for ${production.project_name}:\n${signingLinks.provider.url}\n\nThank you!`;
                            const phone = providerPhone.replace(/[^0-9+]/g, '');
                            window.open(`https://wa.me/${phone}?text=${encodeURIComponent(text)}`, '_blank');
                          }}
                          className="text-xs px-3 py-1.5 rounded-lg bg-green-600 text-white hover:bg-green-700 flex items-center gap-1.5"
                        >
                          <MessageCircle size={10} /> WhatsApp
                        </button>
                      ) : (
                        <input
                          type="tel"
                          className="brand-input text-xs"
                          style={{ width: 140, padding: '4px 8px' }}
                          placeholder="Phone for WhatsApp"
                          value={providerPhone}
                          onChange={e => setProviderPhone(e.target.value)}
                        />
                      )}
                    </div>
                  )}
                </div>
              </>
            )}

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
            {/* Overall contract status badge */}
            {isSigned ? (
              <div className="flex items-center gap-3 bg-green-50 border border-green-300 rounded-xl px-4 py-3 mb-4">
                <span className="text-lg">&#9989;</span>
                <div>
                  <div className="text-sm font-bold text-green-800">Signed & Completed</div>
                  <div className="text-xs text-green-600">All parties have signed this contract.</div>
                </div>
              </div>
            ) : existing?.sent_at ? (
              <div className="flex items-center gap-3 bg-yellow-50 border border-yellow-300 rounded-xl px-4 py-3 mb-4">
                <span className="text-lg" style={{ animation: 'pulse 2s ease-in-out infinite' }}>&#128993;</span>
                <div>
                  <div className="text-sm font-bold text-yellow-800">Pending Signature</div>
                  <div className="text-xs text-yellow-700">
                    Sent to {providerName} on {formatIST(existing.sent_at)} — awaiting signature.
                  </div>
                </div>
                <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }`}</style>
              </div>
            ) : null}

            {/* ── Full Progress: Both Signer Statuses ── */}
            <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-2">Signing Progress</div>

            {/* Company Signer Status */}
            {(() => {
              const hocpSig = signatures.find(s => s.signer_role === 'hocp');
              const hocpSigned = signerIsCreator ? true : hocpSig?.signed_at;
              return (
                <div className={clsx(
                  'flex items-center justify-between p-3 rounded-xl border mb-3',
                  hocpSigned ? 'bg-green-50 border-green-200' : 'bg-orange-50 border-orange-200'
                )}>
                  <div className="flex items-center gap-3">
                    <div className={clsx(
                      'w-8 h-8 rounded-full flex items-center justify-center',
                      hocpSigned ? 'bg-green-100' : 'bg-orange-100'
                    )}>
                      {hocpSigned
                        ? <CheckCircle size={16} className="text-green-600" />
                        : <Clock size={16} className="text-orange-500" />
                      }
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-gray-800">Company — {companySignerName}</div>
                      <div className="text-xs text-gray-500">{companySignerEmail}</div>
                      {signerIsCreator && <div className="text-[10px] text-green-600">Signed in Step 3 (embedded)</div>}
                      {!signerIsCreator && hocpSig?.signed_at && <div className="text-[10px] text-green-600">Signed {formatIST(hocpSig.signed_at)}</div>}
                    </div>
                  </div>
                  <span className={clsx(
                    'text-[10px] font-bold px-2 py-0.5 rounded-full',
                    hocpSigned ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'
                  )}>
                    {hocpSigned ? 'SIGNED' : 'WAITING'}
                  </span>
                </div>
              );
            })()}

            {/* Provider/Supplier Status */}
            {(() => {
              const providerSig = signatures.find(s => s.signer_role === 'provider');
              const providerSigned = providerSig?.signed_at;
              return (
                <div className={clsx(
                  'flex items-center justify-between p-3 rounded-xl border mb-4',
                  providerSigned ? 'bg-green-50 border-green-200' : 'bg-orange-50 border-orange-200'
                )}>
                  <div className="flex items-center gap-3">
                    <div className={clsx(
                      'w-8 h-8 rounded-full flex items-center justify-center',
                      providerSigned ? 'bg-green-100' : 'bg-orange-100'
                    )}>
                      {providerSigned
                        ? <CheckCircle size={16} className="text-green-600" />
                        : <Clock size={16} className="text-orange-500" />
                      }
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-gray-800">Supplier — {providerName}</div>
                      <div className="text-xs text-gray-500">{providerEmail}</div>
                      {providerSigned && <div className="text-[10px] text-green-600">Signed {formatIST(providerSig.signed_at)}</div>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {!providerSigned && providerSig?.sign_url && (
                      <button
                        onClick={() => { navigator.clipboard.writeText(providerSig.sign_url); handleCopyMsg('Link copied!'); }}
                        className="text-xs text-purple-600 px-2 py-1 rounded border border-purple-200 hover:bg-purple-50 flex items-center gap-1"
                      >
                        <Copy size={10} /> Copy Link
                      </button>
                    )}
                    <span className={clsx(
                      'text-[10px] font-bold px-2 py-0.5 rounded-full',
                      providerSigned ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'
                    )}>
                      {providerSigned ? 'SIGNED' : 'WAITING'}
                    </span>
                  </div>
                </div>
              );
            })()}

            {/* No signatures at all */}
            {signatures.length === 0 && (
              <div className="text-center py-8 text-gray-400 mb-4">
                <Clock size={32} className="mx-auto mb-3" />
                <div className="text-sm font-semibold mb-1">No signatures yet</div>
                <div className="text-xs">Go to Step 4 to generate and send signing links.</div>
              </div>
            )}

            {/* Resend buttons — only when not yet signed */}
            {!isSigned && signingLinks?.provider && (
              <div className="flex gap-3 mb-4">
                <button
                  onClick={handleSendContract}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold bg-blue-600 hover:bg-blue-700 text-white transition-colors"
                >
                  <Mail size={14} /> Resend via Gmail
                </button>
                <button
                  onClick={() => {
                    const text = `Hi ${providerName},\n\nPlease sign the contract for ${production.project_name}:\n${signingLinks.provider.url}\n\nThank you!`;
                    const phone = providerPhone.replace(/[^0-9+]/g, '');
                    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(text)}`, '_blank');
                    const waToken2 = localStorage.getItem('cp_auth_token');
                    const waAPI2 = import.meta.env.VITE_API_URL || '';
                    fetch(`${waAPI2}/api/contracts/notify-slack`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${waToken2}` },
                      body: JSON.stringify({
                        message: `Contract resent via WhatsApp: [${production.id}] ${production.project_name} - ${providerName}`,
                        link: signingLinks?.provider?.url || `${window.location.origin}/production/${production.id}`,
                      }),
                    }).catch(() => {});
                  }}
                  disabled={!providerPhone.trim()}
                  className={clsx(
                    'flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-colors',
                    providerPhone.trim()
                      ? 'bg-green-600 hover:bg-green-700 text-white'
                      : 'bg-gray-100 text-gray-400 cursor-default'
                  )}
                >
                  <MessageCircle size={14} /> Resend via WhatsApp
                </button>
              </div>
            )}

            {/* Success toast */}
            {sendSuccess && (
              <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-xl px-4 py-3 mb-4 text-sm text-green-700 font-semibold">
                <CheckCircle size={16} className="text-green-600" />
                {sendSuccess}
              </div>
            )}

            {/* Saved documents — Google Drive & Dropbox links */}
            {isSigned && (existing?.drive_url || existing?.dropbox_url) && (
              <div className="bg-gray-50 rounded-xl p-3 mb-4">
                <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-2">Saved Documents</div>
                <div className="text-xs text-gray-500 mb-2">PDF saved to Google Drive & Dropbox</div>
                {existing?.drive_url && (
                  <div className="flex items-center gap-2 text-xs mb-1">
                    <FolderOpen size={12} className="text-blue-500" />
                    <a href={existing.drive_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline truncate flex-1">
                      Google Drive
                    </a>
                  </div>
                )}
                {existing?.dropbox_url && (
                  <div className="flex items-center gap-2 text-xs">
                    <FolderOpen size={12} className="text-green-500" />
                    <a href={existing.dropbox_url} target="_blank" rel="noopener noreferrer" className="text-green-600 hover:underline truncate flex-1">
                      Dropbox
                    </a>
                  </div>
                )}
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
