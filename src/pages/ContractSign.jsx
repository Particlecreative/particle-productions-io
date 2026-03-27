import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import {
  CheckCircle, RotateCcw, Undo2, PenTool, FileText,
  DollarSign, Shield, AlertTriangle, RefreshCw, Clock,
  User, Calendar, Hash, ChevronDown,
} from 'lucide-react';

const API = import.meta.env.VITE_API_URL || '';

/* ─────────────────────────────────────────────
   Keyframe animations injected once
   ───────────────────────────────────────────── */
const GLOBAL_STYLES = `
@keyframes cs-spin { to { transform: rotate(360deg); } }
@keyframes cs-check-pop {
  0% { transform: scale(0); opacity: 0; }
  50% { transform: scale(1.2); }
  100% { transform: scale(1); opacity: 1; }
}
@keyframes cs-fade-up {
  from { opacity: 0; transform: translateY(16px); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes cs-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: .6; }
}
`;

/* ═══════════════════════════════════════════════
   Main Component
   ═══════════════════════════════════════════════ */
export default function ContractSign() {
  const { contractId, token } = useParams();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [contractData, setContractData] = useState(null);
  const [alreadySigned, setAlreadySigned] = useState(false);
  const [alreadySignedData, setAlreadySignedData] = useState(null);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Signature pad
  const canvasRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [strokes, setStrokes] = useState([]);
  const [currentStroke, setCurrentStroke] = useState([]);
  const [hasSignature, setHasSignature] = useState(false);

  // Form fields
  const [signerName, setSignerName] = useState('');
  const [signerId, setSignerId] = useState('');
  const [signerAddress, setSignerAddress] = useState('');
  const [signDate] = useState(
    new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
  );

  // Scroll tracking for "scroll to sign" prompt
  const signSectionRef = useRef(null);
  const [hasScrolledToSign, setHasScrolledToSign] = useState(false);

  /* ── Fetch contract ── */
  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`${API}/api/contracts/sign/${contractId}/${token}`);
        const data = await res.json();
        if (!res.ok) {
          if (data.already_signed) {
            setAlreadySigned(true);
            setAlreadySignedData(data);
          } else {
            setError(data.error || 'This link is invalid or has expired.');
          }
          setLoading(false);
          return;
        }
        setContractData(data);
        setSignerName(data.signer_name || '');
        setSignerId(data.signer_id_number || data.provider_id_number || '');
        setSignerAddress(data.provider_address || '');
      } catch {
        setError('Unable to connect. Please check your internet and try again.');
      }
      setLoading(false);
    }
    load();
  }, [contractId, token]);

  /* ── Intersection observer for sign section ── */
  useEffect(() => {
    if (!signSectionRef.current) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setHasScrolledToSign(true); },
      { threshold: 0.3 }
    );
    obs.observe(signSectionRef.current);
    return () => obs.disconnect();
  }, [contractData]);

  /* ── Canvas helpers ── */
  const getPos = useCallback((e) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return {
      x: (clientX - rect.left) * (canvas.width / rect.width),
      y: (clientY - rect.top) * (canvas.height / rect.height),
    };
  }, []);

  const redrawCanvas = useCallback((allStrokes) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    allStrokes.forEach(stroke => {
      if (stroke.length < 2) return;
      ctx.beginPath();
      ctx.moveTo(stroke[0].x, stroke[0].y);
      for (let i = 1; i < stroke.length; i++) ctx.lineTo(stroke[i].x, stroke[i].y);
      ctx.stroke();
    });
  }, []);

  function handlePointerDown(e) {
    e.preventDefault();
    setIsDrawing(true);
    setCurrentStroke([getPos(e)]);
  }
  function handlePointerMove(e) {
    if (!isDrawing) return;
    e.preventDefault();
    const pos = getPos(e);
    setCurrentStroke(prev => {
      const updated = [...prev, pos];
      const canvas = canvasRef.current;
      if (canvas && updated.length >= 2) {
        const ctx = canvas.getContext('2d');
        ctx.strokeStyle = '#0f172a';
        ctx.lineWidth = 2.5;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(updated[updated.length - 2].x, updated[updated.length - 2].y);
        ctx.lineTo(pos.x, pos.y);
        ctx.stroke();
      }
      return updated;
    });
  }
  function handlePointerUp() {
    if (!isDrawing) return;
    setIsDrawing(false);
    if (currentStroke.length > 1) {
      setStrokes(prev => [...prev, currentStroke]);
      setHasSignature(true);
    }
    setCurrentStroke([]);
  }
  function handleClear() {
    setStrokes([]); setCurrentStroke([]); setHasSignature(false); redrawCanvas([]);
  }
  function handleUndo() {
    setStrokes(prev => {
      const updated = prev.slice(0, -1);
      redrawCanvas(updated);
      if (updated.length === 0) setHasSignature(false);
      return updated;
    });
  }

  /* ── Submit ── */
  async function handleSubmit(e) {
    e.preventDefault();
    if (!hasSignature || !signerName.trim()) return;
    setSubmitting(true);
    try {
      const canvas = canvasRef.current;
      const signatureBase64 = canvas.toDataURL('image/png');
      const res = await fetch(`${API}/api/contracts/sign/${contractId}/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          signature_data: signatureBase64,
          signer_name: signerName.trim(),
          signer_id_number: signerId.trim(),
          signer_address: signerAddress.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.already_signed) { setAlreadySigned(true); setAlreadySignedData(data); }
        else setError(data.error || 'Failed to submit signature');
        setSubmitting(false);
        return;
      }
      setSubmitted(true);
    } catch {
      setError('Network error. Please try again.');
    }
    setSubmitting(false);
  }

  const canSubmit = hasSignature && signerName.trim() && !submitting;

  /* ─────────── Render states ─────────── */

  // Loading
  if (loading) {
    return (
      <Shell status="loading">
        <div className="flex flex-col items-center justify-center py-24">
          <div className="w-10 h-10 border-[3px] border-gray-200 border-t-[#0a1e42] rounded-full mb-5"
               style={{ animation: 'cs-spin .7s linear infinite' }} />
          <p className="text-gray-500 text-sm">Loading your document...</p>
        </div>
      </Shell>
    );
  }

  // Error
  if (error) {
    return (
      <Shell status="error">
        <div className="flex flex-col items-center justify-center py-20 px-6 text-center"
             style={{ animation: 'cs-fade-up .4s ease-out' }}>
          <div className="w-16 h-16 rounded-full bg-red-50 flex items-center justify-center mb-5">
            <AlertTriangle size={28} className="text-red-500" />
          </div>
          <h2 className="text-lg font-bold text-gray-900 mb-2">Unable to Load Document</h2>
          <p className="text-gray-500 text-sm max-w-xs mb-6">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#0a1e42] text-white text-sm font-semibold rounded-lg hover:bg-[#132d5e] transition-colors"
          >
            <RefreshCw size={14} /> Try Again
          </button>
        </div>
      </Shell>
    );
  }

  // Already signed
  if (alreadySigned) {
    return (
      <Shell status="signed">
        <div className="flex flex-col items-center justify-center py-16 px-6 text-center"
             style={{ animation: 'cs-fade-up .4s ease-out' }}>
          <div className="w-20 h-20 rounded-full bg-green-50 flex items-center justify-center mb-6"
               style={{ animation: 'cs-check-pop .5s ease-out' }}>
            <CheckCircle size={40} className="text-green-500" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Document Already Signed</h2>
          <p className="text-gray-500 text-sm max-w-sm mb-6">
            This document has already been signed. No further action is required.
          </p>
          {alreadySignedData?.signed_at && (
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-green-50 text-green-700 text-xs font-medium rounded-full">
              <CheckCircle size={12} />
              Signed on {new Date(alreadySignedData.signed_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
            </div>
          )}
          {alreadySignedData?.signature_data && (
            <div className="mt-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
              <p className="text-[10px] uppercase tracking-widest text-gray-400 mb-2">Signature</p>
              <img src={alreadySignedData.signature_data} alt="Signature" className="max-h-16 mx-auto" />
              {alreadySignedData.signer_name && (
                <p className="text-sm font-semibold text-gray-700 mt-2">{alreadySignedData.signer_name}</p>
              )}
            </div>
          )}
        </div>
      </Shell>
    );
  }

  // Success after signing
  if (submitted) {
    return (
      <Shell status="signed">
        <div className="flex flex-col items-center justify-center py-20 px-6 text-center"
             style={{ animation: 'cs-fade-up .4s ease-out' }}>
          <div className="w-20 h-20 rounded-full bg-green-50 flex items-center justify-center mb-6"
               style={{ animation: 'cs-check-pop .5s ease-out' }}>
            <CheckCircle size={44} className="text-green-500" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Document Signed Successfully</h2>
          <p className="text-gray-500 text-sm max-w-sm mb-3">
            Your signature has been recorded. You and all parties will receive a signed copy via email.
          </p>
          <p className="text-gray-400 text-xs">You may safely close this page.</p>
          <div className="mt-8 flex items-center gap-2 text-xs text-gray-400">
            <Shield size={12} />
            <span>Secured by Particle</span>
          </div>
        </div>
      </Shell>
    );
  }

  /* ─────────── Main signing view ─────────── */
  const d = contractData;
  const effectiveDate = d.effective_date
    ? new Date(d.effective_date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    : signDate;

  return (
    <Shell status="pending">
      <style>{GLOBAL_STYLES}</style>

      {/* ── Document Paper ── */}
      <div className="bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden">

        {/* ── Section 1: Agreement Header ── */}
        <div className="px-6 sm:px-10 pt-10 pb-8 border-b border-gray-100">
          <div className="text-center mb-8">
            <p className="text-[10px] uppercase tracking-[3px] text-gray-400 mb-3">Particle Aesthetic Science Ltd.</p>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight">SERVICES AGREEMENT</h1>
            <div className="mt-3 inline-flex items-center gap-2 px-3 py-1 bg-gray-50 rounded-full text-xs text-gray-500">
              <Calendar size={11} />
              Effective Date: {effectiveDate}
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <PartyCard label="The Company" name="Particle Aesthetic Science Ltd." subtitle="Tomer Wilf Lezmy — Head of Creative Production" role="Company" />
            <PartyCard label="Service Provider" name={d.provider_name || '\u2014'} role={d.signer_role === 'hocp' ? 'HOCP' : 'Provider'} />
          </div>
        </div>

        {/* ── Production Banner ── */}
        <div className="mx-6 sm:mx-10 mt-6 mb-2 bg-blue-50 border border-blue-200 rounded-xl p-5 text-center">
          <div className="text-xs font-semibold text-blue-500 uppercase tracking-wider mb-1">This Agreement Is For</div>
          <div className="text-xl font-bold text-blue-900">{d.project_name || 'Production'}</div>
        </div>

        {/* ── Section 2: Service Provider Details (fillable) ── */}
        <div className="px-6 sm:px-10 py-6 bg-gray-50/60 border-b border-gray-100">
          <h3 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-4">Service Provider Details</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <DetailPill icon={<User size={13} />} label="Name" value={d.provider_name || '\u2014'} />
            <div>
              <label className="text-[10px] font-semibold text-yellow-700 uppercase tracking-wider mb-1 block">ID / Passport / Company Number *</label>
              <input
                className="w-full bg-yellow-50 border-2 border-yellow-300 focus:border-yellow-500 rounded-lg px-4 py-3 text-sm font-medium outline-none transition-colors"
                value={signerId}
                onChange={e => setSignerId(e.target.value)}
                placeholder="Enter your ID, passport, or company number"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="text-[10px] font-semibold text-yellow-700 uppercase tracking-wider mb-1 block">Place of Business / Address *</label>
              <input
                className="w-full bg-yellow-50 border-2 border-yellow-300 focus:border-yellow-500 rounded-lg px-4 py-3 text-sm font-medium outline-none transition-colors"
                value={signerAddress}
                onChange={e => setSignerAddress(e.target.value)}
                placeholder="Enter your business address"
              />
            </div>
          </div>
        </div>

        {/* ── Section 3: Full Agreement Terms ── */}
        <div className="px-6 sm:px-10 py-6 border-b border-gray-100">
          <h3 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-4">Agreement Terms</h3>
          <FullContractText data={d} effectiveDate={effectiveDate} liveId={signerId} liveAddress={signerAddress} />
        </div>

        {/* ── Section 4: Exhibit A — Scope of Services ── */}
        {d.exhibit_a && (
          <div className="px-6 sm:px-10 py-6 border-b border-gray-100">
            <ExhibitCard
              color="blue"
              icon={<FileText size={15} className="text-blue-600" />}
              title="Exhibit A"
              subtitle="Scope of Services"
              content={d.exhibit_a}
            />
          </div>
        )}

        {/* ── Section 5: Exhibit B — Fees & Payment ── */}
        {(d.exhibit_b || d.fee_amount || d.payment_terms) && (
          <div className="px-6 sm:px-10 py-6 border-b border-gray-100">
            <ExhibitCard
              color="green"
              icon={<DollarSign size={15} className="text-green-600" />}
              title="Exhibit B"
              subtitle="Fees & Payment"
            >
              {d.fee_amount && (
                <div className="mb-3 px-4 py-3 bg-green-50 rounded-lg">
                  <p className="text-[10px] uppercase tracking-widest text-green-600 mb-1">Total Fee</p>
                  <p className="text-xl font-bold text-green-700">
                    {Number(d.fee_amount).toLocaleString()} {d.currency === 'ILS' ? 'ILS (Israeli New Shekel)' : d.currency === 'EUR' ? 'EUR (Euro)' : d.currency === 'GBP' ? 'GBP (British Pound)' : 'USD (US Dollar)'}
                  </p>
                </div>
              )}
              {d.payment_terms && (
                <div className="mb-3">
                  <p className="text-[10px] uppercase tracking-widest text-gray-400 mb-1">Payment Terms</p>
                  <p className="text-sm text-gray-700">{d.payment_terms}</p>
                </div>
              )}
              {d.exhibit_b && (
                <div className="text-sm text-gray-600 leading-relaxed whitespace-pre-wrap">{d.exhibit_b}</div>
              )}
            </ExhibitCard>
          </div>
        )}

        {/* ── Signing Confirmation ── */}
        <div className="px-6 sm:px-10 py-4 border-b border-gray-100 bg-gray-50/40">
          <p className="text-[11px] text-gray-400 leading-relaxed">
            By signing below, you confirm that you have read, understood, and agree to the full terms of this
            Services Agreement, including Exhibit A (Services) and Exhibit B (Fees & Payment).
          </p>
        </div>

        {/* ── Section 7: Signature Section ── */}
        <div ref={signSectionRef} className="px-6 sm:px-10 py-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-8 h-8 rounded-full bg-[#0a1e42] flex items-center justify-center">
              <PenTool size={14} className="text-white" />
            </div>
            <div>
              <h3 className="text-base font-bold text-gray-900">Sign Document</h3>
              <p className="text-xs text-gray-400">Complete the fields below to sign this agreement</p>
            </div>
          </div>

          <form onSubmit={handleSubmit}>
            {/* Yellow Fields Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
              {/* Full Legal Name */}
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-gray-500 mb-1.5">
                  Full Legal Name <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={signerName}
                  onChange={e => setSignerName(e.target.value)}
                  placeholder="Your full legal name"
                  required
                  className="w-full px-4 py-3 text-sm font-medium text-gray-900 bg-yellow-50 border-2 border-yellow-300
                             rounded-lg outline-none focus:border-yellow-500 focus:ring-2 focus:ring-yellow-200
                             placeholder:text-yellow-400/70 transition-all"
                />
              </div>

              {/* ID / Passport */}
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-gray-500 mb-1.5">
                  ID / Passport Number
                </label>
                <input
                  type="text"
                  value={signerId}
                  onChange={e => setSignerId(e.target.value)}
                  placeholder="ID or passport number"
                  className="w-full px-4 py-3 text-sm font-medium text-gray-900 bg-yellow-50 border-2 border-yellow-300
                             rounded-lg outline-none focus:border-yellow-500 focus:ring-2 focus:ring-yellow-200
                             placeholder:text-yellow-400/70 transition-all"
                />
              </div>
            </div>

            {/* Date (read-only yellow) */}
            <div className="mb-6">
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-gray-500 mb-1.5">Date</label>
              <input
                type="text"
                value={signDate}
                readOnly
                className="w-full sm:w-auto px-4 py-3 text-sm font-medium text-gray-600 bg-yellow-50 border-2 border-yellow-200
                           rounded-lg cursor-default"
              />
            </div>

            {/* ── Signature Pad ── */}
            <div className="mb-6">
              <label className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-gray-500 mb-2">
                <PenTool size={12} /> Signature <span className="text-red-400">*</span>
              </label>
              <div className="relative border-2 border-dashed border-gray-300 rounded-xl bg-white overflow-hidden
                              hover:border-gray-400 transition-colors">
                <canvas
                  ref={canvasRef}
                  width={800}
                  height={400}
                  className="w-full cursor-crosshair touch-none block"
                  style={{ height: window.innerWidth < 640 ? 150 : 200 }}
                  onMouseDown={handlePointerDown}
                  onMouseMove={handlePointerMove}
                  onMouseUp={handlePointerUp}
                  onMouseLeave={handlePointerUp}
                  onTouchStart={handlePointerDown}
                  onTouchMove={handlePointerMove}
                  onTouchEnd={handlePointerUp}
                />
                {/* Dotted signature line */}
                <div className="absolute bottom-10 left-8 right-8 border-b border-dashed border-gray-300 pointer-events-none" />
                <div className="absolute bottom-3 left-8 text-[10px] text-gray-300 pointer-events-none tracking-wide">
                  {hasSignature ? '' : 'Draw your signature above'}
                </div>
                {/* X marker */}
                <div className="absolute bottom-8 left-3 text-lg text-gray-300 font-light pointer-events-none select-none">
                  &times;
                </div>
              </div>

              {/* Pad controls */}
              <div className="flex gap-2 mt-2">
                <button
                  type="button"
                  onClick={handleUndo}
                  disabled={strokes.length === 0}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border
                             border-gray-200 bg-white text-gray-500 hover:bg-gray-50 disabled:opacity-40
                             disabled:cursor-default transition-colors"
                >
                  <Undo2 size={11} /> Undo
                </button>
                <button
                  type="button"
                  onClick={handleClear}
                  disabled={!hasSignature}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border
                             border-gray-200 bg-white text-gray-500 hover:bg-gray-50 disabled:opacity-40
                             disabled:cursor-default transition-colors"
                >
                  <RotateCcw size={11} /> Clear
                </button>
              </div>
            </div>

            {/* ── Submit Button (inline on desktop) ── */}
            <div className="hidden sm:block">
              <SubmitButton canSubmit={canSubmit} submitting={submitting} />
            </div>
          </form>
        </div>
      </div>

      {/* ── Security footer ── */}
      <div className="flex items-center justify-center gap-2 mt-6 text-[11px] text-gray-400">
        <Shield size={11} />
        <span>Secured & powered by Particle Aesthetic Science Ltd.</span>
      </div>

      {/* ── Mobile Sticky Bottom Bar ── */}
      <div className="sm:hidden fixed bottom-0 inset-x-0 bg-white border-t border-gray-200 p-4 shadow-[0_-4px_20px_rgba(0,0,0,0.08)] z-50">
        <SubmitButton canSubmit={canSubmit} submitting={submitting} onClick={handleSubmit} />
      </div>
      {/* Spacer so content isn't hidden behind sticky bar on mobile */}
      <div className="sm:hidden h-24" />
    </Shell>
  );
}


/* ═══════════════════════════════════════════════
   Sub-components
   ═══════════════════════════════════════════════ */

function SubmitButton({ canSubmit, submitting, onClick }) {
  return (
    <button
      type={onClick ? 'button' : 'submit'}
      onClick={onClick}
      disabled={!canSubmit}
      className={`
        w-full flex items-center justify-center gap-2 py-4 px-6 rounded-xl text-[15px] font-bold
        transition-all duration-200 min-h-[52px]
        ${canSubmit
          ? 'bg-green-600 hover:bg-green-700 text-white shadow-lg shadow-green-600/20 active:scale-[0.98]'
          : 'bg-gray-200 text-gray-400 cursor-default'
        }
      `}
    >
      {submitting ? (
        <>
          <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full"
               style={{ animation: 'cs-spin .6s linear infinite' }} />
          Submitting...
        </>
      ) : (
        <>
          <CheckCircle size={18} />
          Sign & Complete
        </>
      )}
    </button>
  );
}

function PartyCard({ label, name, subtitle, role }) {
  return (
    <div className="bg-gray-50 rounded-lg p-4 border border-gray-100">
      <p className="text-[10px] uppercase tracking-[2px] text-gray-400 mb-1">{label}</p>
      <p className="text-sm font-semibold text-gray-900">{name}</p>
      {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
      <span className="inline-block mt-1.5 px-2 py-0.5 text-[10px] font-medium bg-gray-200 text-gray-600 rounded">
        {role}
      </span>
    </div>
  );
}

function DetailPill({ icon, label, value }) {
  return (
    <div className="flex items-start gap-2 p-3 bg-white rounded-lg border border-gray-100">
      <span className="text-gray-400 mt-0.5">{icon}</span>
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-widest text-gray-400">{label}</p>
        <p className="text-sm font-medium text-gray-800 truncate">{value}</p>
      </div>
    </div>
  );
}

function ExhibitCard({ color, icon, title, subtitle, content, children }) {
  const borderColor = color === 'blue' ? 'border-l-blue-500' : 'border-l-green-500';
  const bgColor = color === 'blue' ? 'bg-blue-50/50' : 'bg-green-50/50';

  return (
    <div className={`rounded-lg border border-gray-100 ${borderColor} border-l-4 overflow-hidden`}>
      <div className={`px-5 py-3 ${bgColor} flex items-center gap-2`}>
        {icon}
        <div>
          <span className="text-xs font-bold text-gray-700">{title}</span>
          <span className="text-xs text-gray-400 ml-1.5">{subtitle}</span>
        </div>
      </div>
      <div className="px-5 py-4">
        {children || (
          <div className="text-sm text-gray-600 leading-relaxed whitespace-pre-wrap">{content}</div>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   Full Contract Text — renders full legal text
   ═══════════════════════════════════════════════ */
function FullContractText({ data: d, effectiveDate, liveId, liveAddress }) {
  const isCast = (d.contract_type === 'cast');
  const providerName = d.provider_name || '[Service Provider]';
  const providerId = liveId || d.provider_id_number || d.provider_id || '[Please complete]';
  const providerAddr = liveAddress || d.provider_address || '[Please complete]';

  const S = ({ children }) => <h4 className="text-sm font-bold text-gray-800 mt-5 mb-2">{children}</h4>;
  const Sub = ({ children }) => <h5 className="text-xs font-semibold text-gray-700 mt-3 mb-1">{children}</h5>;
  const P = ({ children }) => <p className="text-[13px] text-gray-600 leading-relaxed mb-2">{children}</p>;

  return (
    <div className="max-h-[500px] overflow-y-auto pr-2" style={{ scrollbarWidth: 'thin' }}>
      {/* Preamble */}
      <P>
        This Services Agreement (&ldquo;Agreement&rdquo;) is made and entered into on {effectiveDate} (&ldquo;Effective Date&rdquo;), by and between Particle Aesthetic Science Ltd., a company registered in Israel, with a principal place of business at King George 48, Tel Aviv (&ldquo;Company&rdquo;), and {providerName}, ID/Passport number {providerId}, with a principal place of business at {providerAddr} (&ldquo;Service Provider&rdquo;),
      </P>
      <P>WHEREAS, Service Provider has the skills, resources, know-how and ability required to provide the Services and create the Deliverables (each as defined below); and</P>
      <P>WHEREAS, based on Service Provider&rsquo;s representations hereunder, the parties desire that Service Provider provide the Services as an independent contractor of Company upon the terms and conditions hereinafter specified;</P>
      <P>NOW, THEREFORE, the parties hereby agree as follows:</P>

      {/* 1. DEFINITIONS */}
      <S>1. DEFINITIONS</S>
      <P>For purposes of this Agreement (including any and all amendments made to or incorporated herein now or in the future), the following capitalized terms shall have the following meaning:</P>
      {isCast ? (
        <P>&ldquo;Content&rdquo; shall mean any testimonials, data, personal stories and details, names, locations, videos, photos, audio, and any breakdown, definition or partition of video, film or TV clips, including images, sound footage and segments, recorded performance, interviews, likeness and voice of the Service Provider as embodied therein, and any and all other information which may be provided by the Service Provider to Company in connection with the Services.</P>
      ) : (
        <P>&ldquo;Deliverables&rdquo; shall mean all deliverables provided or produced as a result of the work performed under this Agreement or in connection therewith, including, without limitation, any work products, composition, photographs, videos, information, specifications, documentation, content, designs, audio, and any breakdown, definition or partition of video, film or clips, images, sound footage and segments, recorded performance, including as set forth in Exhibit A, all in any media or form whatsoever.</P>
      )}
      <P>&ldquo;Intellectual Property Rights&rdquo; shall mean all worldwide, whether registered or not (i) patents, patent applications and patent rights; (ii) rights associated with works of authorship, including copyrights, copyrights applications, copyrights restrictions; (iii) rights relating to the protection of trade secrets and confidential information; (iv) trademarks, logos, service marks, brands, trade names, domain names, goodwill and the right to publicity; (v) rights analogous to those set forth herein and any other proprietary rights relating to intangible property; (vi) all other intellectual and industrial property rights (of every kind and nature throughout the world and however designated) whether arising by operation of law, contract, license, or otherwise; and (vii) all registrations, initial applications, renewals, extensions, continuations, divisions or reissues thereof now or hereafter in force (including any rights in any of the foregoing).</P>
      {!isCast && (
        <>
          <P>&ldquo;Services&rdquo; shall have the meaning ascribed to it in Section 2 below.</P>
          <P>&ldquo;Specifications&rdquo; shall mean Company&rsquo;s specifications for the Deliverables attached hereto as Exhibit A or as otherwise provided to Service Provider by Company from time to time.</P>
        </>
      )}

      {/* 2. SERVICES */}
      <S>2. SERVICES</S>
      {isCast ? (
        <P>Service Provider shall provide Company with modeling services all in accordance with the Company&rsquo;s instructions, including the instructions set forth in Exhibit A attached hereto and to Company&rsquo;s full satisfaction (&ldquo;Services&rdquo;). Service Provider shall be liable for full compliance with the terms and conditions of this Agreement and for any negligent acts and omissions in connection therewith.</P>
      ) : (
        <P>Service Provider shall provide Company with the services and deliver the Company the Deliverables all as detailed in Exhibit A, and all in accordance with the milestones and timelines set forth therein and in accordance with Company&rsquo;s instructions and to its full satisfaction (&ldquo;Services&rdquo;). Service Provider shall be liable for full compliance with the terms and conditions of this Agreement and for any negligent acts and omissions in connection therewith. Service Provider is and shall remain solely responsible and liable for obtaining, paying for, repairing and maintaining all the equipment, hardware and services required for providing the Services.</P>
      )}

      {/* 3. COMPENSATION */}
      <S>3. COMPENSATION</S>
      <Sub>3.1 Consideration.</Sub>
      <P>In consideration for the Services provided herein, Company shall pay Service Provider the fees set forth in Exhibit B attached hereto in accordance with the milestones therein. Such payments shall be the full and final consideration of Service Provider and no additional payments shall be made including without limitation payments for overtime or other. Payments shall be made net thirty (30) days after Company&rsquo;s receipt of an undisputed invoice. Company may deduct and withhold from any payments made hereunder all sums which it then may be required to deduct or withhold pursuant to any applicable statute, law, regulation or order of any jurisdiction whatsoever.</P>
      <Sub>3.2 Taxes.</Sub>
      <P>The consideration hereunder shall include all taxes, levies and charges however designated and levied by any state, local, or government agency (including sales taxes and VAT). Service Provider shall have sole responsibility for the payment of all of taxes, levies and charges.</P>
      <Sub>3.3 Expenses.</Sub>
      <P>Except for expenses pre-approved in writing by Company, which will be paid against an itemized invoice, Service Provider shall bear all of its expenses arising from the performance or obligations under this Agreement.</P>

      {/* 4. PROPRIETARY RIGHTS / WAIVER AND CONSENT */}
      {isCast ? (
        <>
          <S>4. WAIVER AND CONSENT</S>
          <P>Company exclusively own and shall continue to own all right title and interest in and to the Content, Company Confidential Information (defined below) and any modifications, enhancements, improvements and derivatives thereof and all Intellectual Property Rights thereto (including without limitation, performing rights, rights to publicity and copyrights), upon creation thereof (&ldquo;Company IPR&rdquo;). Without derogating from the generality of the foregoing, Company may use and otherwise exploit the Content in any media and/or platform whatsoever (including, without limitation, websites, social media, marketing materials and streaming platforms), including, without limitation, reproduce, display, exhibit, publish, publicly make available, transmit, distribute, broadcast, create derivative works, edit, change, use in advertisements or any other marketing materials, in Company&rsquo;s current or future products, services or features, and/or otherwise use and/or exploit the Content as Company deems appropriate at its sole discretion without any restrictions. Service Provider hereby agrees to automatically assign to Company all right, title and interest in and to the Company IPR upon creation thereof.</P>
          <P>Service Provider unconditionally and irrevocably waives, releases and forever discharges any rights, claims, charges or demands whatsoever, in the past, present or future, whether under contract, law, equity or otherwise, in respect of the Company IPR and PII (as defined below) and/or any use thereof, including, without limitation, in connection with invasion of privacy, defamation, right of publicity, performing rights, moral rights, right to receive compensation or royalties including any compensation under Section 134 the Israeli Patent Law-1967 or other applicable laws, or any liability, damages and expenses of any kind or all analogous/similar rights throughout the world or any other cause of action in respect of the Company IPR or its use. Service Provider undertakes not to contest Company&rsquo;s rights to the Company IPR. Service Provider acknowledges that nothing herein shall obligate Company to use the Content or any part thereof.</P>
          <P>Company may collect, process and retain the Service Provider&rsquo;s personally identifiable information (&ldquo;PII&rdquo;) derived in connection with the Services. Such PII may be made available by the Company to third parties, including without limitation, to Company&rsquo;s affiliates, shareholders, partners, agents, contractors and advisors, whether local or foreign, all as part of the Content, in order to further the purposes herein. Company may also transfer PII as part of the Content to third parties in connection with a reorganization, merger, share purchase or sale of substantially all of Company&rsquo;s assets. Service Provider hereby confirms that it is not legally required to provide its PII and such PII is provided at the Service Provider&rsquo;s volition.</P>
        </>
      ) : (
        <>
          <S>4. PROPRIETARY RIGHTS</S>
          <P>The Specifications, Deliverables, Company Confidential Information (defined below) and any and all modifications, enhancements and derivatives thereof and all Intellectual Property Rights thereto (&ldquo;Company IPR&rdquo;) are and shall be owned exclusively by Company upon their creation and shall be deemed works for hire by Service Provider for Company. Without derogating from the foregoing, any and all content or material provided by Company constitutes Company IPR. Service Provider hereby assigns and agrees to assign to Company exclusive ownership and all right, title and interest the Company IPR. Service Provider hereby waives all right, title and interest in and to the Company IPR, including moral rights and any right to compensation or royalties including pursuant to Section 134 to the Israel Patent Law &ndash; 1967. Service Provider agrees to assist Company in every proper way to obtain for Company and enforce any Intellectual Property Rights in the Company IPR in any and all countries. Service Provider hereby irrevocably designates and appoints Company and its authorized officers and agents as Service Provider&rsquo;s agent and attorney in fact, coupled with an interest to act for and on Service Providers behalf and in Service Provider&rsquo;s stead to do all lawfully permitted acts to further the prosecution and issuance of Company IPR or any other right or protection relating to any Company IPR, with the same legal force and effect as if executed by Service Provider itself. Service Provider shall ensure that all of its employees and contractors sign terms no less restrictive and no less protective of Company and Company IPR as the terms set forth in this agreement, including without limitation assignment and waiver of all right, title and interest in and to the Company IPR to the Company in a form preapproved by the Company, and shall provide Company all such signed terms upon execution.</P>
        </>
      )}

      {/* 5. CONFIDENTIALITY */}
      <S>5. CONFIDENTIALITY</S>
      {isCast ? (
        <P>This Agreement, the provision of the Services, Company IPR and all information related to the Company, its affiliates, its and their shareholders, employees, directors and agents and/or to their business, products and services are confidential information of Company (&ldquo;Confidential Information&rdquo;). Service Provider agrees to protect the Confidential Information with the highest degree of care and keep confidential and not disclose, disseminate, allow access to or use any Confidential Information except as required for the provision of the Services.</P>
      ) : (
        <P>This Agreement, the provision of the Services, Company IPR and all data and information related to the Company, its affiliates, its and their shareholders, employees, directors and agents and/or to their business, products and services are confidential information of Company (&ldquo;Confidential Information&rdquo;). Service Provider agrees to protect the Confidential Information with the highest degree of care and keep confidential and not disclose, disseminate, allow access to or use any Confidential Information except as required for the provision of the Services and creation of the Deliverables.</P>
      )}

      {/* 6. WARRANTIES AND REPRESENTATIONS */}
      <S>6. WARRANTIES AND REPRESENTATIONS</S>
      {isCast ? (
        <P>Service Provider hereby warrants and represents that: (i) it has the requisite professional qualifications, knowledge, know-how, expertise, skill, talent and experience required in order to perform the Services in a professional and efficient manner; (ii) there are no limitations, obligations or restrictions whatsoever which restrict or prevent Service Provider from fulfilling all of its obligations or grant the rights granted to Company under this Agreement; (iii) it will perform its obligations under this Agreement in compliance with all applicable laws, rules and regulations; and (iv) it has and shall continue to obtain all applicable consents, permits, licenses, certifications and authorizations in connection with the Services.</P>
      ) : (
        <P>Service Provider hereby warrants and represents that: (i) it has the requisite professional qualifications, knowledge, know-how, expertise, skill, talent and experience required in order to perform the Services and provide the Deliverables in a professional and efficient manner and shall perform the Services and provide the Deliverables using highest industry standards; (ii) there are no limitations, obligations or restrictions whatsoever which restrict or prevent Service Provider from fulfilling all of its obligations or grant the rights granted to Company under this Agreement; (iii) it will perform its obligations under this Agreement in compliance with all applicable laws, rules, professional standards, certifications and regulations; (iv) the Services and Deliverables: (a) shall be fit for their intended purpose, (b) do not and will not infringe any right of any third party including Intellectual Property Rights or right to privacy, (c) shall strictly comply with the Specifications; and (v) it has and shall continue to obtain all applicable consents, permits, licenses, certifications and authorizations in connection with the Services and Deliverables.</P>
      )}

      {/* 7. INDEMNIFICATION */}
      <S>7. INDEMNIFICATION</S>
      <P>Service Provider shall indemnify, hold harmless, and at Company&rsquo;s first request, defend Company, its affiliates and their officers, directors, agents and employees, against all claims, liabilities, damages, losses and expenses, including attorneys&rsquo; fees, arising out of or in any way connected with or based on: (i) Service Provider&rsquo;s breach of any of its representations and warranties herein; and/or (ii) a determination by a competent authority that is contrary to Section 9.3 below.</P>

      {/* 8. TERM AND TERMINATION */}
      <S>8. TERM AND TERMINATION</S>
      <Sub>8.1 Term of Agreement.</Sub>
      <P>This Agreement shall be effective from the Effective Date and shall remain in effect for the duration of the Services, unless earlier terminated as provided hereunder (&ldquo;Term&rdquo;). The Term may be extended by the Company at its sole discretion.</P>
      <Sub>8.2 Termination for Convenience.</Sub>
      {isCast ? (
        <P>Company may terminate this Agreement at any time for convenience upon written notice to the Service Provider.</P>
      ) : (
        <P>Company may terminate this Agreement at any time for convenience upon five (5) days written notice to the Service Provider.</P>
      )}
      <Sub>8.3 Termination for Cause.</Sub>
      <P>Notwithstanding the above, this Agreement may be terminated by either party upon written notice to the other party if such other party breaches a material term or condition of this Agreement and fails to completely cure such breach within fourteen (14) days after receipt of said notice of such breach.</P>
      <Sub>8.4 Consequences.</Sub>
      {isCast ? (
        <P>Upon termination or expiration of this Agreement, Service Provider shall at Company&rsquo;s option, either deliver to Company or delete/destroy all Confidential Information in its possession or under its control, in any media or form whatsoever. The provisions of Sections 1, 4, 5, 6, 7, 8.4 and 9 shall survive termination or expiration of this Agreement and shall remain in full force and effect in perpetuity.</P>
      ) : (
        <P>Upon termination or expiration of this Agreement, Service Provider shall promptly Deliver to Company all Deliverables (whether completed or not) and at Company&rsquo;s option, either deliver to Company or delete/destroy all Confidential Information in its possession or under its control, in any media or form whatsoever. The provisions of Sections 1, 4, 5, 6, 7, 8.4 and 9 shall survive termination or expiration of this Agreement and shall remain in full force and effect in perpetuity.</P>
      )}

      {/* 9. MISCELLANEOUS */}
      <S>9. MISCELLANEOUS</S>
      {!isCast && (
        <>
          <Sub>9.1 Subcontracting.</Sub>
          <P>The obligation of Service Provider hereunder may not be subcontracted by Service Provider, in whole or in part without the written consent of Company and any such subcontracting without Company&rsquo;s written approval shall be deemed null and void.</P>
        </>
      )}
      <Sub>{isCast ? '9.1' : '9.2'} Assignment.</Sub>
      <P>Service Provider may not assign or transfer any of its rights or obligations hereunder to any third party without the prior written consent of Company. Company may assign its rights or obligations hereunder at its sole discretion. Any assignment without Company&rsquo;s prior written consent shall be deemed null and void.</P>
      <Sub>{isCast ? '9.2' : '9.3'} Independent Contractors.</Sub>
      {isCast ? (
        <P>It is hereby clarified that Service Provider is an independent contractor of Company under this Agreement and nothing herein shall be construed to create a joint venture, partnership or an employer/employee relationship. Service Provider may not make any representations, warranties, covenants or undertakings on behalf of Company and may not represent Company.</P>
      ) : (
        <P>It is hereby clarified that Service Provider is an independent contractor of Company under this Agreement and nothing herein shall be construed to create a joint venture, partnership or an employer/employee relationship. Service Provider may not make any representations, warranties, covenants or undertakings on behalf of Company and may not represent Company. Neither Service Provider nor its employees are entitled to any of the benefits or rights to which employees of Company are entitled, and Service Provider shall be solely responsible for all of its employees and agents and its labor costs and expenses arising in connection therewith.</P>
      )}
      <Sub>{isCast ? '9.3' : '9.4'} No Waiver.</Sub>
      <P>All waivers must be in writing. A waiver by either of the parties hereto shall not be construed to be a waiver of any succeeding breach thereof or of any covenant, condition, or agreement herein contained.</P>
      <Sub>{isCast ? '9.4' : '9.5'} Governing Law.</Sub>
      <P>This Agreement, including the validity, interpretation, or performance of this Agreement and any of its terms or provisions, and the rights and obligations of the parties under this Agreement shall be exclusively governed by, construed and interpreted in accordance with the laws of the State of Israel without regards to the choice of law provisions thereof. Any action arising out of or in any way connected with this Agreement shall be brought exclusively in the courts of Tel Aviv, Israel and the parties hereby submit themselves to its exclusive jurisdiction.</P>
      <Sub>{isCast ? '9.5' : '9.6'} Entire Agreement.</Sub>
      <P>This Agreement and its Exhibits constitute the entire agreement between the parties. No change, waiver, or discharge hereof shall be valid unless it is in writing and is executed by the party against whom such change, waiver, or discharge is sought to be enforced.</P>
      <Sub>{isCast ? '9.6' : '9.7'} Amendment.</Sub>
      <P>This Agreement may only be amended by an instrument in writing signed by each of the parties hereto.</P>
      <Sub>{isCast ? '9.7' : '9.8'} Notices.</Sub>
      <P>All notices and other communications given or made pursuant hereto shall be in writing and shall be deemed to have been duly given or made as of the date delivered or transmitted, and shall be effective upon receipt, if delivered personally, sent by air courier, or sent by electronic transmission, with confirmation received.</P>
      <Sub>{isCast ? '9.8' : '9.9'} Deduction/Set-Off.</Sub>
      <P>Company may at any time deduct or set-off any or all amounts which it deems it has already paid to Company.</P>
      {!isCast && (
        <>
          <Sub>9.10 No Exclusivity.</Sub>
          <P>This Agreement does not prevent Company from receiving services same or similar to the Services from any third party.</P>
          <Sub>9.11 Insurance.</Sub>
          <P>The Service Provider shall maintain at its sole expense insurance coverages that sufficiently cover all obligations and liabilities in Service Provider&rsquo;s performance of the Services. Service Provider will provide Company with a certificate of insurance evidencing such coverage immediately upon Company&rsquo;s request.</P>
        </>
      )}

      {/* 10. IN WITNESS THEREOF */}
      <S>10. IN WITNESS THEREOF</S>
      <P>Company and Service Provider have caused this Agreement to be signed and delivered by their duly authorized officers, all as of the last date set forth below.</P>
    </div>
  );
}


/* ═══════════════════════════════════════════════
   Shell — Header + Footer wrapper
   ═══════════════════════════════════════════════ */
function Shell({ children, status }) {
  const statusConfig = {
    loading:  { label: 'Loading',            color: 'bg-gray-100 text-gray-500' },
    pending:  { label: 'Pending Signature',  color: 'bg-amber-100 text-amber-700' },
    signed:   { label: 'Completed',          color: 'bg-green-100 text-green-700' },
    error:    { label: 'Error',              color: 'bg-red-100 text-red-600' },
  };
  const st = statusConfig[status] || statusConfig.pending;

  return (
    <div className="min-h-screen bg-gray-100">
      <style>{GLOBAL_STYLES}</style>

      {/* ── Header Bar ── */}
      <header className="bg-white border-b border-gray-200 shadow-sm sticky top-0 z-40">
        <div className="max-w-[800px] mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          {/* Logo */}
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 bg-[#0a1e42] rounded-md flex items-center justify-center">
              <span className="text-white text-[10px] font-black tracking-tight">P</span>
            </div>
            <div className="hidden sm:block">
              <p className="text-sm font-bold text-[#0a1e42] leading-none">Particle</p>
              <p className="text-[9px] text-gray-400 leading-none mt-0.5">Aesthetic Science Ltd.</p>
            </div>
          </div>

          {/* Center title */}
          <div className="absolute left-1/2 -translate-x-1/2">
            <p className="text-xs sm:text-sm font-semibold text-gray-600">Document to Sign</p>
          </div>

          {/* Status badge */}
          <div className={`px-2.5 py-1 rounded-full text-[10px] font-semibold ${st.color}`}>
            {st.label}
          </div>
        </div>
      </header>

      {/* ── Body ── */}
      <main className="max-w-[800px] mx-auto px-4 sm:px-6 py-6 sm:py-10">
        {children}
      </main>
    </div>
  );
}
