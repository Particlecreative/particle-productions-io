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
        setSignerId(data.signer_id_number || '');
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
            <PartyCard label="The Company" name="Particle Aesthetic Science Ltd." role="Company" />
            <PartyCard label="Service Provider" name={d.provider_name || '\u2014'} role={d.signer_role === 'hocp' ? 'HOCP' : 'Provider'} />
          </div>
        </div>

        {/* ── Section 2: Service Provider Details ── */}
        <div className="px-6 sm:px-10 py-6 bg-gray-50/60 border-b border-gray-100">
          <h3 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-4">Service Provider Details</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <DetailPill icon={<User size={13} />} label="Name" value={d.provider_name || '\u2014'} />
            <DetailPill icon={<Hash size={13} />} label="ID Number" value={d.provider_id || d.signer_id_number || '\u2014'} />
            <DetailPill icon={<FileText size={13} />} label="Production" value={d.project_name || '\u2014'} />
          </div>
        </div>

        {/* ── Section 3: Full Agreement Terms ── */}
        <div className="px-6 sm:px-10 py-6 border-b border-gray-100">
          <h3 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-4">Agreement Terms</h3>
          <div className="text-sm text-gray-600 leading-relaxed space-y-3">
            <p>
              This Services Agreement (the &ldquo;Agreement&rdquo;) is entered into as of {effectiveDate} by and between{' '}
              <strong>Particle Aesthetic Science Ltd.</strong> (&ldquo;the Company&rdquo;) and{' '}
              <strong>{d.provider_name || 'the Service Provider'}</strong> (&ldquo;the Provider&rdquo;).
            </p>
            <p>
              The Company hereby engages the Provider to perform the services described in Exhibit A below, subject to
              the terms and conditions set forth in this Agreement. The Provider shall perform the services in a professional
              and workmanlike manner, in accordance with industry standards and the Company&rsquo;s reasonable instructions.
            </p>
            <p>
              The Provider represents that they are an independent contractor, not an employee of the Company. The Provider
              shall be solely responsible for all taxes, insurance, and other obligations arising from the compensation
              received under this Agreement.
            </p>
            <p>
              All intellectual property, creative works, and deliverables produced under this Agreement shall be the
              exclusive property of the Company. The Provider hereby assigns all rights, title, and interest in such
              works to the Company.
            </p>
            <p>
              The Provider shall maintain strict confidentiality regarding all proprietary information, trade secrets,
              and business information of the Company, both during and after the term of this Agreement.
            </p>
          </div>
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
                    {d.currency || '\u20AA'}{Number(d.fee_amount).toLocaleString()}
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

        {/* ── Section 6: Standard Terms Summary ── */}
        <div className="px-6 sm:px-10 py-6 border-b border-gray-100 bg-gray-50/40">
          <h3 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-4">Key Terms</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs text-gray-600">
            <TermBadge icon={<Shield size={12} />} text="Intellectual property rights transfer to the Company upon payment." />
            <TermBadge icon={<Shield size={12} />} text="Confidentiality obligations apply during and after the engagement." />
            <TermBadge icon={<Shield size={12} />} text="Service Provider operates as an independent contractor." />
          </div>
          <p className="mt-4 text-[11px] text-gray-400 leading-relaxed">
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

function PartyCard({ label, name, role }) {
  return (
    <div className="bg-gray-50 rounded-lg p-4 border border-gray-100">
      <p className="text-[10px] uppercase tracking-[2px] text-gray-400 mb-1">{label}</p>
      <p className="text-sm font-semibold text-gray-900">{name}</p>
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

function TermBadge({ icon, text }) {
  return (
    <div className="flex items-start gap-2 p-3 bg-white rounded-lg border border-gray-100">
      <span className="text-gray-300 mt-0.5 shrink-0">{icon}</span>
      <p className="text-[11px] leading-relaxed text-gray-500">{text}</p>
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
