import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { CheckCircle, RotateCcw, Undo2, PenTool, FileText, DollarSign } from 'lucide-react';

const API = import.meta.env.VITE_API_URL || '';

export default function ContractSign() {
  const { contractId, token } = useParams();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [contractData, setContractData] = useState(null);
  const [alreadySigned, setAlreadySigned] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Signature pad state
  const canvasRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [strokes, setStrokes] = useState([]);
  const [currentStroke, setCurrentStroke] = useState([]);
  const [hasSignature, setHasSignature] = useState(false);

  // Form fields
  const [signerName, setSignerName] = useState('');
  const [signDate] = useState(new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }));

  // Fetch contract data
  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`${API}/api/contracts/sign/${contractId}/${token}`);
        const data = await res.json();
        if (!res.ok) {
          if (data.already_signed) {
            setAlreadySigned(true);
          } else {
            setError(data.error || 'Failed to load contract');
          }
          setLoading(false);
          return;
        }
        setContractData(data);
        setSignerName(data.signer_name || '');
      } catch (err) {
        setError('Network error. Please try again.');
      }
      setLoading(false);
    }
    load();
  }, [contractId, token]);

  // Canvas drawing helpers
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
    ctx.strokeStyle = '#1a1a2e';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    allStrokes.forEach(stroke => {
      if (stroke.length < 2) return;
      ctx.beginPath();
      ctx.moveTo(stroke[0].x, stroke[0].y);
      for (let i = 1; i < stroke.length; i++) {
        ctx.lineTo(stroke[i].x, stroke[i].y);
      }
      ctx.stroke();
    });
  }, []);

  function handlePointerDown(e) {
    e.preventDefault();
    setIsDrawing(true);
    const pos = getPos(e);
    setCurrentStroke([pos]);
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
        ctx.strokeStyle = '#1a1a2e';
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
    setStrokes([]);
    setCurrentStroke([]);
    setHasSignature(false);
    redrawCanvas([]);
  }

  function handleUndo() {
    setStrokes(prev => {
      const updated = prev.slice(0, -1);
      redrawCanvas(updated);
      if (updated.length === 0) setHasSignature(false);
      return updated;
    });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!hasSignature) return;
    if (!signerName.trim()) return;

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
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.already_signed) {
          setAlreadySigned(true);
        } else {
          setError(data.error || 'Failed to submit signature');
        }
        setSubmitting(false);
        return;
      }
      setSubmitted(true);
    } catch (err) {
      setError('Network error. Please try again.');
    }
    setSubmitting(false);
  }

  // ── Already signed screen ──
  if (alreadySigned) {
    return (
      <PageWrapper>
        <div className="text-center py-16">
          <CheckCircle size={56} className="mx-auto mb-4" style={{ color: '#16a34a' }} />
          <h2 style={{ fontSize: 22, fontWeight: 800, color: '#030b2e', marginBottom: 8 }}>Already Signed</h2>
          <p style={{ color: '#6b7280', fontSize: 14 }}>This contract has already been signed.</p>
        </div>
      </PageWrapper>
    );
  }

  // ── Success screen ──
  if (submitted) {
    return (
      <PageWrapper>
        <div className="text-center py-16">
          <CheckCircle size={56} className="mx-auto mb-4" style={{ color: '#16a34a' }} />
          <h2 style={{ fontSize: 22, fontWeight: 800, color: '#030b2e', marginBottom: 8 }}>Contract Signed!</h2>
          <p style={{ color: '#6b7280', fontSize: 14 }}>A copy will be sent to your email.</p>
          <p style={{ color: '#9ca3af', fontSize: 12, marginTop: 16 }}>You may close this window.</p>
        </div>
      </PageWrapper>
    );
  }

  // ── Loading ──
  if (loading) {
    return (
      <PageWrapper>
        <div className="text-center py-16">
          <div style={{ width: 32, height: 32, border: '3px solid #e5e7eb', borderTopColor: '#030b2e', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 16px' }} />
          <p style={{ color: '#6b7280', fontSize: 14 }}>Loading contract...</p>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </PageWrapper>
    );
  }

  // ── Error ──
  if (error) {
    return (
      <PageWrapper>
        <div className="text-center py-16">
          <div style={{ fontSize: 48, marginBottom: 16 }}>!</div>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: '#dc2626', marginBottom: 8 }}>Error</h2>
          <p style={{ color: '#6b7280', fontSize: 14 }}>{error}</p>
        </div>
      </PageWrapper>
    );
  }

  // ── Main signing form ──
  return (
    <PageWrapper>
      {/* Contract summary */}
      <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, padding: '20px 24px', marginBottom: 28 }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, color: '#030b2e', marginBottom: 12 }}>Contract Summary</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, fontSize: 13 }}>
          <div>
            <div style={{ color: '#9ca3af', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>Production</div>
            <div style={{ color: '#1e293b', fontWeight: 600 }}>{contractData.project_name || contractData.production_id}</div>
          </div>
          <div>
            <div style={{ color: '#9ca3af', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>Producer</div>
            <div style={{ color: '#1e293b', fontWeight: 600 }}>{contractData.producer || '\u2014'}</div>
          </div>
          <div>
            <div style={{ color: '#9ca3af', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>Service Provider</div>
            <div style={{ color: '#1e293b', fontWeight: 600 }}>{contractData.provider_name || '\u2014'}</div>
          </div>
          <div>
            <div style={{ color: '#9ca3af', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>Signing As</div>
            <div style={{ color: '#1e293b', fontWeight: 600, textTransform: 'capitalize' }}>
              {contractData.signer_role === 'hocp' ? 'Particle HOCP' : 'Service Provider'}
            </div>
          </div>
        </div>
      </div>

      {/* Exhibit A — Services & Instructions */}
      {contractData.exhibit_a && (
        <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 12, padding: '16px 20px', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <FileText size={16} style={{ color: '#2563eb' }} />
            <h4 style={{ fontSize: 14, fontWeight: 700, color: '#1e40af', margin: 0 }}>Exhibit A \u2014 Services & Instructions</h4>
          </div>
          <div style={{ fontSize: 13, color: '#1e3a5f', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
            {contractData.exhibit_a}
          </div>
        </div>
      )}

      {/* Exhibit B — Fees & Payment */}
      {(contractData.exhibit_b || contractData.fee_amount || contractData.payment_terms) && (
        <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 12, padding: '16px 20px', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <DollarSign size={16} style={{ color: '#16a34a' }} />
            <h4 style={{ fontSize: 14, fontWeight: 700, color: '#166534', margin: 0 }}>Exhibit B \u2014 Fees & Payment</h4>
          </div>
          {contractData.fee_amount && (
            <div style={{ fontSize: 15, fontWeight: 700, color: '#166534', marginBottom: 8 }}>
              Total Fee: {Number(contractData.fee_amount).toLocaleString()}
            </div>
          )}
          {contractData.payment_terms && (
            <div style={{ fontSize: 13, color: '#166534', lineHeight: 1.7, marginBottom: 6 }}>
              <strong>Payment Terms:</strong> {contractData.payment_terms}
            </div>
          )}
          {contractData.exhibit_b && (
            <div style={{ fontSize: 13, color: '#1e3a5f', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
              {contractData.exhibit_b}
            </div>
          )}
        </div>
      )}

      {/* Contract terms note */}
      <div style={{ background: '#fefce8', border: '1px solid #fde68a', borderRadius: 12, padding: '16px 20px', marginBottom: 28, fontSize: 13, color: '#92400e', lineHeight: 1.7 }}>
        <strong>Agreement Terms:</strong> By signing below, you confirm that you have read, understood, and agree to the terms of the service agreement
        for the production referenced above, including Exhibit A (Services) and Exhibit B (Fees & Payment). Both parties agree to the scope of work,
        compensation, and terms as documented in this agreement.
      </div>

      <form onSubmit={handleSubmit}>
        {/* Name field */}
        <div style={{ marginBottom: 20 }}>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>
            Full Name
          </label>
          <input
            type="text"
            value={signerName}
            onChange={e => setSignerName(e.target.value)}
            placeholder="Your full legal name"
            required
            style={{
              width: '100%',
              padding: '10px 14px',
              border: '1px solid #d1d5db',
              borderRadius: 8,
              fontSize: 14,
              color: '#1e293b',
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />
        </div>

        {/* Date field */}
        <div style={{ marginBottom: 24 }}>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>
            Date
          </label>
          <input
            type="text"
            value={signDate}
            readOnly
            style={{
              width: '100%',
              padding: '10px 14px',
              border: '1px solid #e5e7eb',
              borderRadius: 8,
              fontSize: 14,
              color: '#6b7280',
              background: '#f9fafb',
              boxSizing: 'border-box',
            }}
          />
        </div>

        {/* Signature pad */}
        <div style={{ marginBottom: 24 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
            <PenTool size={14} /> Signature
          </label>
          <div style={{ position: 'relative', border: '2px solid #d1d5db', borderRadius: 10, overflow: 'hidden', background: '#fff' }}>
            <canvas
              ref={canvasRef}
              width={400}
              height={200}
              style={{ width: '100%', height: 200, cursor: 'crosshair', touchAction: 'none', display: 'block' }}
              onMouseDown={handlePointerDown}
              onMouseMove={handlePointerMove}
              onMouseUp={handlePointerUp}
              onMouseLeave={handlePointerUp}
              onTouchStart={handlePointerDown}
              onTouchMove={handlePointerMove}
              onTouchEnd={handlePointerUp}
            />
            {!hasSignature && (
              <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', color: '#cbd5e1', fontSize: 13, pointerEvents: 'none', userSelect: 'none' }}>
                Sign here
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button
              type="button"
              onClick={handleUndo}
              disabled={strokes.length === 0}
              style={{
                display: 'flex', alignItems: 'center', gap: 4,
                padding: '6px 14px', border: '1px solid #d1d5db', borderRadius: 6,
                background: strokes.length === 0 ? '#f3f4f6' : '#fff',
                color: strokes.length === 0 ? '#9ca3af' : '#374151',
                fontSize: 12, fontWeight: 500, cursor: strokes.length === 0 ? 'default' : 'pointer',
              }}
            >
              <Undo2 size={12} /> Undo
            </button>
            <button
              type="button"
              onClick={handleClear}
              disabled={!hasSignature}
              style={{
                display: 'flex', alignItems: 'center', gap: 4,
                padding: '6px 14px', border: '1px solid #d1d5db', borderRadius: 6,
                background: !hasSignature ? '#f3f4f6' : '#fff',
                color: !hasSignature ? '#9ca3af' : '#374151',
                fontSize: 12, fontWeight: 500, cursor: !hasSignature ? 'default' : 'pointer',
              }}
            >
              <RotateCcw size={12} /> Clear
            </button>
          </div>
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={!hasSignature || !signerName.trim() || submitting}
          style={{
            width: '100%',
            padding: '14px 20px',
            background: hasSignature && signerName.trim() && !submitting ? '#030b2e' : '#94a3b8',
            color: '#fff',
            border: 'none',
            borderRadius: 10,
            fontSize: 15,
            fontWeight: 700,
            cursor: hasSignature && signerName.trim() && !submitting ? 'pointer' : 'default',
            transition: 'background 0.2s',
          }}
        >
          {submitting ? 'Submitting...' : 'Sign & Submit'}
        </button>
      </form>
    </PageWrapper>
  );
}

// ── Page wrapper with Particle branding ──
function PageWrapper({ children }) {
  return (
    <div style={{ minHeight: '100vh', background: '#f1f5f9', display: 'flex', justifyContent: 'center', padding: '40px 16px' }}>
      <div style={{ width: '100%', maxWidth: 560 }}>
        {/* Logo / Brand header */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 10,
            background: '#030b2e', color: '#fff', padding: '12px 28px',
            borderRadius: 12, fontWeight: 900, fontSize: 18, letterSpacing: '-0.3px',
          }}>
            PARTICLE
            <span style={{ fontSize: 10, fontWeight: 400, opacity: 0.6, textTransform: 'uppercase', letterSpacing: 2 }}>for men</span>
          </div>
          <div style={{ color: '#94a3b8', fontSize: 12, marginTop: 8, letterSpacing: 1, textTransform: 'uppercase' }}>
            Contract Signing
          </div>
        </div>

        {/* Card */}
        <div style={{
          background: '#fff',
          borderRadius: 16,
          boxShadow: '0 4px 24px rgba(0,0,0,0.06)',
          padding: '32px 28px',
        }}>
          {children}
        </div>

        {/* Footer */}
        <div style={{ textAlign: 'center', marginTop: 24, fontSize: 11, color: '#94a3b8' }}>
          Powered by Particle CP Panel
        </div>
      </div>
    </div>
  );
}
