import { useState, useEffect } from 'react';
import { X, ExternalLink, Download, FileSignature, CheckCircle, Clock, Send, MessageCircle, Mail, Copy, Link2, Plus, AlertCircle } from 'lucide-react';
import { upsertContract, getContract, generateContractSignatures, getContractSignatures } from '../../lib/dataService';
import { getDownloadUrl } from '../../lib/invoiceUtils';
import { formatIST, nowISOString } from '../../lib/timezone';
import { useAuth } from '../../context/AuthContext';
import { useNotifications } from '../../context/NotificationsContext';
import clsx from 'clsx';

const HELLOSIGN_CAST = 'https://app.hellosign.com/prep-and-send/b0b7d49634c1963b10b86f62ed80aced3d9d9eae/recipients';
const HELLOSIGN_CREW = 'https://app.hellosign.com/prep-and-send/bc5114dd429e77ad9f54c5ae74a0f23f81cfc166/recipients';
const CAST_TYPES = ['Cast', 'Actor', 'Model', 'Talent', 'Actress'];

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

// ── Event Timeline ──
function EventTimeline({ events }) {
  if (!events || events.length === 0) return null;

  const EVENT_ICONS = {
    created:   { icon: Plus,        color: '#6b7280', label: 'Contract Created' },
    sent:      { icon: Send,        color: '#2563eb', label: 'Contract Sent' },
    signed:    { icon: FileSignature, color: '#16a34a', label: 'Signed' },
    completed: { icon: CheckCircle, color: '#16a34a', label: 'All Parties Signed' },
    generated: { icon: Link2,       color: '#7c3aed', label: 'Signing Links Generated' },
  };

  return (
    <div className="mt-6 pt-5 border-t border-gray-100">
      <div className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3">Document History</div>
      <div className="space-y-2">
        {events.map((ev, i) => {
          const meta = EVENT_ICONS[ev.type] || { icon: Clock, color: '#9ca3af', label: ev.type };
          const Icon = meta.icon;
          return (
            <div key={i} className="flex items-start gap-3">
              <div
                className="shrink-0 w-6 h-6 rounded-full flex items-center justify-center"
                style={{ background: meta.color + '18' }}
              >
                <Icon size={12} style={{ color: meta.color }} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold text-gray-700">
                  {meta.label}
                  {ev.role && <span className="text-gray-400 font-normal ml-1">({ev.role === 'hocp' ? 'Particle HOCP' : 'Provider'})</span>}
                  {ev.name && <span className="text-gray-400 font-normal ml-1">- {ev.name}</span>}
                </div>
                {ev.at && (
                  <div className="text-[10px] text-gray-400">{formatIST(ev.at)}</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Signing Links Display ──
function SigningLinks({ signingLinks, onCopy }) {
  if (!signingLinks) return null;

  return (
    <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 mb-5">
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
                onClick={() => {
                  navigator.clipboard.writeText(link.url);
                  onCopy?.(`${role} link copied!`);
                }}
                className="text-xs text-purple-600 hover:text-purple-800 px-2 py-1 rounded border border-purple-200 hover:bg-purple-50 flex items-center gap-1"
              >
                <Copy size={10} /> Copy Link
              </button>
              <button
                type="button"
                onClick={() => {
                  const text = `Please sign the contract using this link:\n${link.url}`;
                  const cleanPhone = '';
                  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
                }}
                className="text-xs text-green-600 hover:text-green-800 px-2 py-1 rounded border border-green-200 hover:bg-green-50 flex items-center gap-1"
              >
                <MessageCircle size={10} /> WhatsApp
              </button>
              <button
                type="button"
                onClick={() => {
                  const subject = encodeURIComponent(`Contract Signing Request`);
                  const body = encodeURIComponent(`Hi ${link.name},\n\nPlease sign the contract using this link:\n${link.url}\n\nThank you.`);
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

export default function ContractModal({ production, lineItem, onClose }) {
  const { isEditor, user } = useAuth();
  const { addNotification } = useNotifications();
  const contractKey = lineItem ? `${production.id}_li_${lineItem.id}` : production.id;

  // Load fresh on every render to stay in sync
  const existing = getContract(contractKey);

  const [providerName, setProviderName] = useState(
    existing?.provider_name || lineItem?.full_name || ''
  );
  const [providerEmail, setProviderEmail] = useState(existing?.provider_email || '');
  const [pdfUrl, setPdfUrl] = useState(existing?.pdf_url || '');
  const [driveUrl, setDriveUrl] = useState(existing?.drive_url || '');
  const [dropboxUrl, setDropboxUrl] = useState(existing?.dropbox_url || '');
  const [status, setStatus] = useState(existing?.status || 'pending');
  const [events, setEvents] = useState(existing?.events || []);
  const [signingLinks, setSigningLinks] = useState(null);
  const [signatures, setSignatures] = useState([]);
  const [generating, setGenerating] = useState(false);
  const [copyMsg, setCopyMsg] = useState('');

  // Load signatures if contract exists
  useEffect(() => {
    async function loadSigs() {
      try {
        const data = await getContractSignatures(contractKey);
        if (data?.signatures) setSignatures(data.signatures);
        if (data?.contract?.events) setEvents(data.contract.events);
        // Build signing links from existing signatures
        const unsigned = data?.signatures?.filter(s => !s.signed_at && s.sign_url);
        if (unsigned?.length > 0) {
          const links = {};
          unsigned.forEach(s => {
            links[s.signer_role] = { url: s.sign_url, name: s.signer_name, email: s.signer_email };
          });
          setSigningLinks(links);
        }
      } catch (e) { /* ignore for dev mode */ }
    }
    loadSigs();
  }, [contractKey]);

  function handleCopyMsg(msg) {
    setCopyMsg(msg);
    setTimeout(() => setCopyMsg(''), 2000);
  }

  async function handleGenerate() {
    if (!providerName.trim()) return alert('Enter provider name first');
    if (!providerEmail.trim()) return alert('Enter provider email first');

    setGenerating(true);
    try {
      const result = await generateContractSignatures(contractKey, {
        provider_name: providerName,
        provider_email: providerEmail,
        hocp_name: user?.name || 'Tomer Wilf Lezmy',
        hocp_email: user?.email || 'tomer@particleformen.com',
      });
      if (result?.signing_links) {
        setSigningLinks(result.signing_links);
        setStatus('pending');
        // Update events
        const newEvents = [...events, { type: 'generated', at: new Date().toISOString() }];
        setEvents(newEvents);
        addNotification('contract_generated', `E-sign links generated for ${production.project_name}`, production.id);
      }
    } catch (e) {
      alert('Failed to generate signing links. Make sure the backend is running.');
    }
    setGenerating(false);
  }

  function handleSend() {
    const now = nowISOString();
    const newEvents = [...events, { type: 'sent', at: now }];
    upsertContract({
      production_id: contractKey,
      provider_name: providerName,
      provider_email: providerEmail,
      status: 'sent',
      sent_at: now,
      pdf_url: pdfUrl || existing?.pdf_url || '',
      events: newEvents,
    });
    setEvents(newEvents);
    addNotification('contract_sent', `Contract sent for ${production.project_name}`, production.id);
    setStatus('sent');
    const hellosignUrl = CAST_TYPES.includes(lineItem?.type) ? HELLOSIGN_CAST : HELLOSIGN_CREW;
    window.open(hellosignUrl, '_blank');
  }

  function handleMarkSigned() {
    const now = nowISOString();
    const newEvents = [...events, { type: 'completed', at: now }];
    upsertContract({
      production_id: contractKey,
      provider_name: providerName,
      provider_email: providerEmail,
      status: 'signed',
      signed_at: now,
      pdf_url: pdfUrl,
      events: newEvents,
    });
    setEvents(newEvents);
    addNotification('contract_signed', `Contract signed for ${production.project_name}`, production.id);
    setStatus('signed');
  }

  function handleSavePdf() {
    upsertContract({
      production_id: contractKey,
      pdf_url: pdfUrl,
      drive_url: driveUrl,
      dropbox_url: dropboxUrl,
    });
  }

  const dlUrl = getDownloadUrl(pdfUrl);
  const isSigned = status === 'signed';
  const isSent = status === 'sent';
  const isPending = status === 'pending';

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-panel" style={{ maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
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

        {/* Copy feedback */}
        {copyMsg && (
          <div className="text-xs text-green-600 bg-green-50 border border-green-200 rounded-lg px-3 py-1.5 mb-3 text-center">
            {copyMsg}
          </div>
        )}

        {/* Status flow indicator */}
        <StatusBar status={status} />

        {/* Timestamps */}
        {(existing?.sent_at || existing?.signed_at) && (
          <div className="flex gap-4 text-xs text-gray-400 mb-5 bg-gray-50 rounded-xl px-4 py-2.5">
            {existing?.sent_at && (
              <span>Sent: <strong className="text-gray-600">{formatIST(existing.sent_at)}</strong></span>
            )}
            {existing?.signed_at && (
              <span>Signed: <strong className="text-green-600">{formatIST(existing.signed_at)}</strong></span>
            )}
          </div>
        )}

        {/* Signature status badges */}
        {signatures.length > 0 && (
          <div className="flex gap-2 mb-5">
            {signatures.map((sig, i) => (
              <div
                key={i}
                className={clsx(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold',
                  sig.signed_at ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-orange-50 text-orange-700 border border-orange-200'
                )}
              >
                {sig.signed_at ? <CheckCircle size={11} /> : <Clock size={11} />}
                {sig.signer_role === 'hocp' ? 'HOCP' : 'Provider'}
                {sig.signed_at ? ' Signed' : ' Pending'}
              </div>
            ))}
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

        {/* E-Signature Signing Links */}
        <SigningLinks signingLinks={signingLinks} onCopy={handleCopyMsg} />

        {/* Generate Contract button — only when no signing links yet and not signed */}
        {isEditor && !isSigned && !signingLinks && (
          <button
            onClick={handleGenerate}
            disabled={generating || !providerName.trim() || !providerEmail.trim()}
            className={clsx(
              'w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold mb-5 transition-colors',
              generating || !providerName.trim() || !providerEmail.trim()
                ? 'bg-gray-100 text-gray-400 cursor-default'
                : 'bg-purple-600 hover:bg-purple-700 text-white cursor-pointer'
            )}
          >
            <FileSignature size={14} />
            {generating ? 'Generating...' : 'Generate E-Sign Contract'}
          </button>
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
                placeholder="https://drive.google.com/..."
              />
              {pdfUrl && pdfUrl !== (existing?.pdf_url || '') && (
                <button onClick={handleSavePdf} className="btn-secondary text-xs px-3">Save</button>
              )}
            </div>
          ) : (
            <span className="text-gray-400 text-xs">{pdfUrl || '—'}</span>
          )}
        </div>

        {/* External URL — for externally signed contracts */}
        {isEditor && (
          <div className="mb-5">
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
              External Signed URL
              <span className="ml-1 font-normal text-gray-400 normal-case">(paste URL if signed externally)</span>
            </label>
            <div className="grid grid-cols-2 gap-2">
              <input
                className="brand-input"
                value={driveUrl}
                onChange={e => setDriveUrl(e.target.value)}
                placeholder="Google Drive URL..."
                disabled={isSigned}
              />
              <input
                className="brand-input"
                value={dropboxUrl}
                onChange={e => setDropboxUrl(e.target.value)}
                placeholder="Dropbox URL..."
                disabled={isSigned}
              />
            </div>
            {(driveUrl !== (existing?.drive_url || '') || dropboxUrl !== (existing?.dropbox_url || '')) && (
              <button onClick={handleSavePdf} className="btn-secondary text-xs px-3 mt-2">Save URLs</button>
            )}
          </div>
        )}

        {/* HelloSign signer details — copyable for easy fill */}
        {(isSent || isPending) && !isSigned && !signingLinks && (
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
                { label: 'Particle HOCP', name: user?.name || 'Tomer Wilf Lezmy', email: user?.email || 'tomer@particleformen.com' },
              ].map(s => (
                <div key={s.label} className="flex items-center justify-between bg-white rounded-lg px-3 py-2 border border-blue-100">
                  <div>
                    <div className="text-[10px] font-bold text-blue-500 uppercase">{s.label}</div>
                    <div className="text-sm font-semibold text-gray-800">{s.name}</div>
                    <div className="text-xs text-gray-500">{s.email}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => { navigator.clipboard.writeText(`${s.name}\n${s.email}`); handleCopyMsg('Copied!'); }}
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
                {isSent ? 'Re-send Contract' : 'Send via Dropbox Sign'}
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

        {/* Document History Timeline */}
        <EventTimeline events={events} />
      </div>
    </div>
  );
}
