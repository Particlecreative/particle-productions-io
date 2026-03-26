import { useState } from 'react';
import { X, ExternalLink, Download, FileSignature, CheckCircle, Clock, Send } from 'lucide-react';
import { upsertContract, getContract } from '../../lib/dataService';
import { getDownloadUrl } from '../../lib/invoiceUtils';
import { formatIST, nowISOString } from '../../lib/timezone';
import { useAuth } from '../../context/AuthContext';
import { useNotifications } from '../../context/NotificationsContext';
import clsx from 'clsx';

const HELLOSIGN_CAST = 'https://app.hellosign.com/prep-and-send/b0b7d49634c1963b10b86f62ed80aced3d9d9eae/recipients';
const HELLOSIGN_CREW = 'https://app.hellosign.com/prep-and-send/bc5114dd429e77ad9f54c5ae74a0f23f81cfc166/recipients';
const CAST_TYPES = ['Cast', 'Actor', 'Model', 'Talent', 'Actress'];

// Pre-defined signer roles for Particle contracts
const SIGNER_ROLES = {
  creative_producer: { role: 'Creative Producer', defaultName: '', defaultEmail: '' },
  service_provider: { role: 'Service Provider', defaultName: '', defaultEmail: '' },
  particle_hocp: { role: 'Particle HOCP', defaultName: 'Omer Barak', defaultEmail: 'omer@particleformen.com' },
};

const STATUS_STEPS = [
  { id: 'pending', label: 'Pending', icon: Clock },
  { id: 'sent',    label: 'Sent',    icon: Send },
  { id: 'signed',  label: 'Signed',  icon: CheckCircle },
];

function StatusBar({ status }) {
  const stepIdx = STATUS_STEPS.findIndex(s => s.id === status);
  return (
    <div className="flex items-center gap-0 mb-6">
      {STATUS_STEPS.map((step, i) => {
        const done = i <= stepIdx;
        const active = i === stepIdx;
        const Icon = step.icon;
        return (
          <div key={step.id} className="flex items-center flex-1 last:flex-none">
            <div className={clsx(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors',
              active ? 'bg-blue-600 text-white' :
              done   ? 'bg-green-100 text-green-700' :
              'bg-gray-100 text-gray-400'
            )}>
              <Icon size={12} />
              {step.label}
            </div>
            {i < STATUS_STEPS.length - 1 && (
              <div className={clsx('flex-1 h-0.5 mx-1', i < stepIdx ? 'bg-green-300' : 'bg-gray-200')} />
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function ContractModal({ production, lineItem, onClose }) {
  const { isEditor } = useAuth();
  const { addNotification } = useNotifications();
  const contractKey = lineItem ? `${production.id}_li_${lineItem.id}` : production.id;

  // Load fresh on every render to stay in sync
  const existing = getContract(contractKey);

  const [providerName, setProviderName] = useState(
    existing?.provider_name || lineItem?.full_name || ''
  );
  const [providerEmail, setProviderEmail] = useState(existing?.provider_email || '');
  const [pdfUrl, setPdfUrl] = useState(existing?.pdf_url || '');
  const [status, setStatus] = useState(existing?.status || 'pending');

  function handleSend() {
    const now = nowISOString();
    const updated = upsertContract({
      production_id: contractKey,
      provider_name: providerName,
      provider_email: providerEmail,
      status: 'sent',
      sent_at: now,
      pdf_url: pdfUrl || existing?.pdf_url || '',
    });
    addNotification('contract_sent', `Contract sent for ${production.project_name}`, production.id);
    setStatus('sent');
    const hellosignUrl = CAST_TYPES.includes(lineItem?.type) ? HELLOSIGN_CAST : HELLOSIGN_CREW;
    window.open(hellosignUrl, '_blank');
  }

  function handleMarkSigned() {
    const now = nowISOString();
    upsertContract({
      production_id: contractKey,
      provider_name: providerName,
      provider_email: providerEmail,
      status: 'signed',
      signed_at: now,
      pdf_url: pdfUrl,
    });
    addNotification('contract_signed', `Contract signed for ${production.project_name}`, production.id);
    setStatus('signed');
  }

  function handleSavePdf() {
    upsertContract({
      production_id: contractKey,
      pdf_url: pdfUrl,
    });
  }

  const dlUrl = getDownloadUrl(pdfUrl);
  const isSigned = status === 'signed';
  const isSent = status === 'sent';
  const isPending = status === 'pending';

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-panel" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <FileSignature size={18} style={{ color: 'var(--brand-primary)' }} />
            <h2 className="text-lg font-black" style={{ color: 'var(--brand-primary)' }}>Contract</h2>
            {lineItem?.full_name && (
              <span className="text-sm text-gray-400">— {lineItem.full_name}</span>
            )}
          </div>
          <button onClick={onClose}><X size={18} className="text-gray-400" /></button>
        </div>

        {/* Status flow indicator */}
        <StatusBar status={status} />

        {/* Timestamps */}
        {(existing?.sent_at || existing?.signed_at) && (
          <div className="flex gap-4 text-xs text-gray-400 mb-5 bg-gray-50 rounded-xl px-4 py-2.5">
            {existing?.sent_at && (
              <span>📤 Sent: <strong className="text-gray-600">{formatIST(existing.sent_at)}</strong></span>
            )}
            {existing?.signed_at && (
              <span>✅ Signed: <strong className="text-green-600">{formatIST(existing.signed_at)}</strong></span>
            )}
          </div>
        )}

        {/* Pre-filled Particle info */}
        <div className="bg-gray-50 rounded-xl p-4 mb-5 text-sm">
          <div className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">Pre-filled fields</div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <span className="text-gray-500 text-xs">Particle CP:</span>
              <div className="font-semibold">Omer Barak</div>
              <div className="text-xs text-gray-400">omer@particleformen.com</div>
            </div>
            <div>
              <span className="text-gray-500 text-xs">Particle:</span>
              <div className="font-semibold">Tomer Wilf Lezmy</div>
              <div className="text-xs text-gray-400">tomer@particleformen.com</div>
            </div>
          </div>
        </div>

        {/* Service Provider */}
        {isEditor && (
          <div className="space-y-4 mb-5">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                Service Provider Name
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
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                Service Provider Email
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
          </div>
        )}

        {!isEditor && (
          <div className="mb-5 text-sm text-gray-600">
            <div className="font-semibold">{providerName || '—'}</div>
            {providerEmail && <div className="text-xs text-gray-400">{providerEmail}</div>}
          </div>
        )}

        {/* Contract PDF Link — always visible */}
        <div className="mb-5">
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
            Contract PDF Link
            <span className="ml-1 font-normal text-gray-400 normal-case">(Google Drive or Dropbox)</span>
          </label>
          {isSigned && pdfUrl ? (
            <div className="flex items-center gap-3 p-3 bg-green-50 border border-green-200 rounded-xl">
              <CheckCircle size={14} className="text-green-600 shrink-0" />
              <span className="text-xs text-green-700 font-medium flex-1 truncate">{pdfUrl}</span>
              <a href={pdfUrl} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1 text-xs text-blue-600 hover:underline shrink-0">
                <ExternalLink size={12} /> View
              </a>
              {dlUrl && (
                <a href={dlUrl} download className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 shrink-0">
                  <Download size={12} /> Download
                </a>
              )}
            </div>
          ) : isEditor ? (
            <div className="flex gap-2">
              <input
                className="brand-input flex-1"
                value={pdfUrl}
                onChange={e => setPdfUrl(e.target.value)}
                placeholder="https://drive.google.com/…"
              />
              {pdfUrl && pdfUrl !== (existing?.pdf_url || '') && (
                <button onClick={handleSavePdf} className="btn-secondary text-xs px-3">Save</button>
              )}
            </div>
          ) : (
            <span className="text-gray-400 text-xs">{pdfUrl || '—'}</span>
          )}
        </div>

        {/* HelloSign signer details — copyable for easy fill */}
        {(isSent || isPending) && !isSigned && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-5 text-sm">
            <div className="flex items-center justify-between mb-3">
              <div className="font-bold text-blue-800">Copy these into Dropbox Sign:</div>
              <span className={clsx(
                'text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full',
                CAST_TYPES.includes(lineItem?.type)
                  ? 'bg-purple-100 text-purple-700'
                  : 'bg-amber-100 text-amber-700'
              )}>
                {CAST_TYPES.includes(lineItem?.type) ? 'Cast Template' : 'Crew Template'}
              </span>
            </div>
            <div className="grid grid-cols-1 gap-2.5">
              {[
                { label: 'Creative Producer', name: production?.producer || 'Omer Barak', email: 'omer@particleformen.com' },
                { label: 'Service Provider', name: providerName || '—', email: providerEmail || '—' },
                { label: 'Particle HOCP', name: 'Omer Barak', email: 'omer@particleformen.com' },
              ].map(s => (
                <div key={s.label} className="flex items-center justify-between bg-white rounded-lg px-3 py-2 border border-blue-100">
                  <div>
                    <div className="text-[10px] font-bold text-blue-500 uppercase">{s.label}</div>
                    <div className="text-sm font-semibold text-gray-800">{s.name}</div>
                    <div className="text-xs text-gray-500">{s.email}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => { navigator.clipboard.writeText(`${s.name}\n${s.email}`); }}
                    className="text-xs text-blue-500 hover:text-blue-700 px-2 py-1 rounded border border-blue-200 hover:bg-blue-50"
                  >
                    Copy
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Action buttons */}
        {isEditor && (
          <div className="flex gap-3 mt-2">
            <button onClick={onClose} className="btn-secondary flex-1">Close</button>

            {!isSigned && (
              <button
                onClick={handleSend}
                className="btn-cta flex-1 flex items-center justify-center gap-2"
              >
                <ExternalLink size={13} />
                {isSent ? 'Re-send Contract' : 'Send Contract'}
              </button>
            )}

            {isSent && (
              <button
                onClick={handleMarkSigned}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold bg-green-600 hover:bg-green-700 text-white transition-colors"
              >
                <CheckCircle size={13} />
                Mark Signed
              </button>
            )}
          </div>
        )}

        {!isEditor && (
          <div className="flex justify-end mt-2">
            <button onClick={onClose} className="btn-secondary">Close</button>
          </div>
        )}
      </div>
    </div>
  );
}
