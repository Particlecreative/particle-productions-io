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
import jsPDF from 'jspdf';

// ── Constants ────────────────────────────────────────────────────
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
const PARTICLE_LOGO_URL = 'https://www.particleformen.com/wp-content/themes/particleformen/assets/images/particle-for-men-logo.png';
let _cachedLogoBase64 = null;

async function fetchLogoBase64() {
  if (_cachedLogoBase64) return _cachedLogoBase64;
  try {
    const response = await fetch(PARTICLE_LOGO_URL);
    const blob = await response.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => { _cachedLogoBase64 = reader.result; resolve(reader.result); };
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

// ── PDF Generation — Full Legal Text ─────────────────────────────
function generateContractPDF(data) {
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
  if (data.logoBase64) {
    try { doc.addImage(data.logoBase64, 'PNG', margin, 6, 40, 22); } catch {
      doc.setTextColor(255, 255, 255); doc.setFontSize(20); doc.setFont('helvetica', 'bold');
      doc.text('PARTICLE', margin, 18); doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.text('for men', margin + 52, 18);
    }
  } else {
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

  // ── Sandbox mode (Tomer only) ──
  const isTomer = user?.email?.toLowerCase() === 'tomer@particleformen.com';
  const [sandboxMode, setSandboxMode] = useState(false);

  // In sandbox: override provider to Tomer, skip CC, Slack → Tomer's DM only
  const effectiveProviderName = sandboxMode ? (user?.name || 'Tomer Wilf Lezmy') : providerName;
  const effectiveProviderEmail = sandboxMode ? 'tomer@particleformen.com' : providerEmail;

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

  // ── Logo for PDF ──
  const [logoBase64, setLogoBase64] = useState(null);
  const [tomerSignature, setTomerSignature] = useState(null);
  useEffect(() => {
    fetchLogoBase64().then(b64 => setLogoBase64(b64));
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

  // ── Populate editable sections ──
  function populateEditableSections() {
    const formattedDate = effectiveDate
      ? new Date(effectiveDate + 'T00:00:00').toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
      : new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

    const isCast = CAST_TYPES.includes(lineItem?.type);

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

    const currencySymbol = currency === 'ILS' ? '\u20AA' : currency === 'EUR' ? '\u20AC' : currency === 'GBP' ? '\u00A3' : '$';
    const bParts = [];
    if (feeAmount) bParts.push(`Total Fee: ${currencySymbol}${Number(feeAmount).toLocaleString()}`);
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
  function handleGeneratePdfPreview() {
    const formattedDate = effectiveDate
      ? new Date(effectiveDate + 'T00:00:00').toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
      : new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

    const doc = generateContractPDF({
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
      hocp_name: user?.name || 'Tomer Wilf Lezmy',
      logoBase64,
      documentHistory: buildDocumentHistory(),
      isCastType: CAST_TYPES.includes(lineItem?.type),
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
        currency,
        payment_terms: paymentTerms,
        payment_method: paymentMethod,
        provider_id_number: providerIdNumber,
        provider_address: providerAddress,
        effective_date: effectiveDate,
        contract_pdf_base64: pdfDataUrl || '',
        status: 'pending',
        contract_type: CAST_TYPES.includes(lineItem?.type) ? 'cast' : 'crew',
      });

      const result = await generateContractSignatures(contractKey, {
        provider_name: sandboxMode ? (user?.name || 'Tomer Wilf Lezmy') : providerName,
        provider_email: sandboxMode ? 'tomer@particleformen.com' : providerEmail,
        hocp_name: user?.name || 'Tomer Wilf Lezmy',
        hocp_email: user?.email || 'tomer@particleformen.com',
        sandbox: sandboxMode,
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

  // ── Send contract via Gmail API ──
  async function handleSendContract() {
    const now = nowISOString();
    const providerLink = signingLinks?.provider?.url || '';
    const token = localStorage.getItem('cp_auth_token');
    const API = import.meta.env.VITE_API_URL || '';

    const toEmail = sandboxMode ? 'tomer@particleformen.com' : providerEmail;
    const toName = sandboxMode ? (user?.name || 'Tomer') : providerName;
    const subjectPrefix = sandboxMode ? '🧪 [TEST] ' : '';

    try {
      const res = await fetch(`${API}/api/gmail/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          to: toEmail,
          skipDefaultCc: sandboxMode,
          subject: `${subjectPrefix}Contract for ${production.project_name} — ${toName}`,
          htmlBody: `
            <div style="font-family: Arial, sans-serif; max-width: 600px;">
              ${sandboxMode ? '<div style="background:#fef3c7;border:2px solid #f59e0b;padding:10px 16px;border-radius:8px;margin-bottom:16px;font-weight:bold;color:#92400e;">🧪 SANDBOX TEST — This is a test contract. No real signatures needed.</div>' : ''}
              <h2 style="color: #030b2e;">Contract Ready for Signature</h2>
              <p>Hi ${toName},</p>
              <p>A contract has been prepared for <strong>${production.project_name}</strong>.</p>
              <p>Please review and sign the contract by clicking the link below:</p>
              <p style="margin: 24px 0;">
                <a href="${providerLink}" style="background: #0808f8; color: white; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: bold;">
                  Review & Sign Contract
                </a>
              </p>
              <p style="color: #888; font-size: 13px;">If the button doesn't work, copy this link: ${providerLink}</p>
              <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
              <p style="color: #aaa; font-size: 11px;">Sent via CP Panel — Particle Aesthetic Science Ltd.</p>
            </div>
          `,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to send email');
      }
    } catch (err) {
      console.error('Gmail send failed:', err);
      // Fallback: still mark as sent but warn user
      setSendSuccess(`Warning: Email may not have sent (${err.message}). Contract marked as sent.`);
    }

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

    // Slack notification — contract sent via email
    fetch(`${API}/api/contracts/notify-slack`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        message: `\ud83d\udcc4 Contract sent via email: [${production.id}] ${production.project_name} \u2014 ${providerName}`,
        sandbox: sandboxMode,
        link: `${window.location.origin}/production/${production.id}`,
      }),
    }).catch(() => {});

    setSendSuccess(`Contract sent to ${providerName}!`);
    setTimeout(() => setSendSuccess(''), 5000);

    // Move to signing status step
    setCurrentStep(5);
    setMaxReachedStep(5);
  }

  // ── Download PDF ──
  function handleDownloadPdf() {
    const formattedDate = effectiveDate
      ? new Date(effectiveDate + 'T00:00:00').toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
      : new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

    const doc = generateContractPDF({
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
      hocp_name: user?.name || 'Tomer Wilf Lezmy',
      logoBase64,
      documentHistory: buildDocumentHistory(),
      isCastType: CAST_TYPES.includes(lineItem?.type),
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

        {/* Sandbox toggle — Tomer only */}
        {isTomer && (
          <div className="flex items-center justify-end mb-2">
            <button
              type="button"
              onClick={() => setSandboxMode(v => !v)}
              className={clsx(
                'inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full border transition-all',
                sandboxMode
                  ? 'bg-amber-100 border-amber-400 text-amber-800'
                  : 'bg-gray-50 border-gray-200 text-gray-400 hover:border-gray-300'
              )}
            >
              🧪 {sandboxMode ? 'Sandbox ON — sends to you only' : 'Test Mode'}
            </button>
          </div>
        )}
        {sandboxMode && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5 mb-3 text-xs text-amber-800">
            <strong>🧪 Sandbox Mode:</strong> Contract will be sent to <strong>tomer@particleformen.com</strong> only. No CC to Omer. Slack notification goes to your DM. You can test the full signing flow as both sides.
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
                        {currency === 'ILS' ? '\u20AA' : currency === 'EUR' ? '\u20AC' : currency === 'GBP' ? '\u00A3' : '$'}
                        {Number(feeAmount).toLocaleString()}
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
                      ? <img src={logoBase64} alt="Particle" style={{ height: 36 }} />
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
                      <div>Name: {user?.name || 'Tomer Wilf Lezmy'}</div>
                      <div>Title: Head of Creative Production</div>
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
            {/* Auto-generate signing links if not yet done */}
            {!signingLinks && !generating && !generateError && (() => {
              // Auto-trigger generation when arriving at step 4
              if (providerName.trim() && providerEmail.trim()) {
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

            {/* Service Provider signing link */}
            <SigningLinks signingLinks={signingLinks} onCopy={handleCopyMsg} productionName={production.project_name} />

            {signingLinks && (
              <>
                {/* Primary: Send Contract */}
                <button
                  onClick={handleSendContract}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold bg-blue-600 hover:bg-blue-700 text-white transition-colors mb-3"
                >
                  <Send size={14} />
                  Send Contract
                </button>

                {/* WhatsApp send — needs phone number */}
                {signingLinks.provider && (
                  <div className="mb-4">
                    {!providerPhone && (
                      <div className="flex items-center gap-2 mb-2">
                        <input
                          type="tel"
                          className="brand-input flex-1 text-sm"
                          placeholder="Provider phone (e.g. +972...)"
                          value={providerPhone}
                          onChange={e => setProviderPhone(e.target.value)}
                        />
                      </div>
                    )}
                    <button
                      onClick={() => {
                        const text = `Hi ${providerName},\n\nPlease sign the contract for ${production.project_name}:\n${signingLinks.provider.url}\n\nThank you!`;
                        const phone = providerPhone.replace(/[^0-9+]/g, '');
                        window.open(`https://wa.me/${phone}?text=${encodeURIComponent(text)}`, '_blank');
                        // Slack notification — contract sent via WhatsApp
                        const waToken = localStorage.getItem('cp_auth_token');
                        const waAPI = import.meta.env.VITE_API_URL || '';
                        fetch(`${waAPI}/api/contracts/notify-slack`, {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${waToken}` },
                          body: JSON.stringify({
                            message: `\ud83d\udcf1 Contract sent via WhatsApp: [${production.id}] ${production.project_name} \u2014 ${providerName}`,
                            sandbox: sandboxMode,
                            link: `${window.location.origin}/production/${production.id}`,
                          }),
                        }).catch(() => {});
                      }}
                      disabled={!providerPhone.trim()}
                      className={clsx(
                        'w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-colors',
                        providerPhone.trim()
                          ? 'bg-green-600 hover:bg-green-700 text-white'
                          : 'bg-gray-100 text-gray-400 cursor-default'
                      )}
                    >
                      <MessageCircle size={14} />
                      Send via WhatsApp
                    </button>
                    {providerPhone && (
                      <button
                        onClick={() => setProviderPhone('')}
                        className="text-[10px] text-gray-400 hover:text-gray-600 mt-1"
                      >
                        Change phone number
                      </button>
                    )}
                  </div>
                )}
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
            {/* Contract status badge */}
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

            {/* Provider signature status */}
            {(() => {
              const providerSig = signatures.find(s => s.signer_role === 'provider');
              if (providerSig) {
                return (
                  <div
                    className={clsx(
                      'flex items-center justify-between p-3 rounded-xl border mb-4',
                      providerSig.signed_at
                        ? 'bg-green-50 border-green-200'
                        : 'bg-orange-50 border-orange-200'
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <div className={clsx(
                        'w-8 h-8 rounded-full flex items-center justify-center',
                        providerSig.signed_at ? 'bg-green-100' : 'bg-orange-100'
                      )}>
                        {providerSig.signed_at ? <CheckCircle size={16} className="text-green-600" /> : <Clock size={16} className="text-orange-500" />}
                      </div>
                      <div>
                        <div className="text-sm font-semibold text-gray-800">Service Provider</div>
                        <div className="text-xs text-gray-500">{providerSig.signer_name} ({providerSig.signer_email})</div>
                        {providerSig.signed_at && (
                          <div className="text-[10px] text-green-600">Signed {formatIST(providerSig.signed_at)}</div>
                        )}
                      </div>
                    </div>
                    {!providerSig.signed_at && providerSig.sign_url && (
                      <button
                        onClick={() => { navigator.clipboard.writeText(providerSig.sign_url); handleCopyMsg('Link copied!'); }}
                        className="text-xs text-purple-600 px-2 py-1 rounded border border-purple-200 hover:bg-purple-50 flex items-center gap-1"
                      >
                        <Copy size={10} /> Copy Link
                      </button>
                    )}
                  </div>
                );
              }
              // No signatures at all
              if (signatures.length === 0) {
                return (
                  <div className="text-center py-8 text-gray-400 mb-4">
                    <Clock size={32} className="mx-auto mb-3" />
                    <div className="text-sm font-semibold mb-1">No signatures yet</div>
                    <div className="text-xs">Go to Step 4 to generate and send signing links.</div>
                  </div>
                );
              }
              return null;
            })()}

            {/* E-Signature link cards (same as Step 4) */}
            {!isSigned && signingLinks && (
              <SigningLinks signingLinks={signingLinks} onCopy={handleCopyMsg} productionName={production.project_name} />
            )}

            {/* Signed & Completed banner */}
            {isSigned && (
              <div className="bg-green-100 border border-green-300 rounded-xl p-4 text-center mb-4">
                <CheckCircle size={28} className="mx-auto mb-2 text-green-600" />
                <div className="text-sm font-bold text-green-800">Signed & Completed</div>
                <div className="text-xs text-green-600 mt-1">The contract has been signed and is complete.</div>
                {existing?.signed_at && (
                  <div className="text-[10px] text-green-500 mt-1">Signed on {formatIST(existing.signed_at)}</div>
                )}
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
                    // Slack notification — contract resent via WhatsApp
                    const waToken2 = localStorage.getItem('cp_auth_token');
                    const waAPI2 = import.meta.env.VITE_API_URL || '';
                    fetch(`${waAPI2}/api/contracts/notify-slack`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${waToken2}` },
                      body: JSON.stringify({
                        message: `\ud83d\udcf1 Contract resent via WhatsApp: [${production.id}] ${production.project_name} \u2014 ${providerName}`,
                        sandbox: sandboxMode,
                        link: `${window.location.origin}/production/${production.id}`,
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
