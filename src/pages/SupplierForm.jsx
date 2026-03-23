import { useState, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { CheckCircle, ChevronRight, ChevronLeft } from 'lucide-react';
import { getProductions, submitSupplierForm, getFormConfig } from '../lib/dataService';

// Find a production by its human-facing production_id (e.g. "PRD26-06") or internal uuid
function findProduction(prodIdParam) {
  // Get all productions from both brands
  const all = [
    ...getProductions('particle'),
    ...getProductions('blurr'),
  ];
  return all.find(p => p.production_id === prodIdParam || p.id === prodIdParam) || null;
}

export default function SupplierForm() {
  const { productionId: prodIdParam } = useParams();
  const production = useMemo(() => findProduction(prodIdParam), [prodIdParam]);
  const config     = useMemo(() => production ? getFormConfig(production.id) : {}, [production]);

  const [step, setStep] = useState(1);
  const [supplierType, setSupplierType] = useState(''); // 'production' | 'post_production'
  const [submitted, setSubmitted] = useState(false);

  // Form fields
  const [form, setForm] = useState({
    full_name: '', role: '', phone: '', email: '', id_number: '',
    bank_name: '', account_number: '', branch: '', swift: '',
    business_type: 'individual', company_name: '', tax_id: '',
    food_restrictions: '', dietary_notes: '', notes: '',
  });

  function set(field, value) {
    setForm(prev => ({ ...prev, [field]: value }));
  }

  function handleSubmit(e) {
    e.preventDefault();
    submitSupplierForm({
      ...form,
      supplier_type: supplierType,
      production_id: production?.id || prodIdParam,
    });
    setSubmitted(true);
  }

  // Inline style for branded background
  const bgStyle = {
    minHeight: '100vh',
    background: config.bgImageUrl
      ? `url(${config.bgImageUrl}) center/cover no-repeat`
      : (config.bgColor || '#f3f4f6'),
  };

  if (!production) {
    return (
      <div style={bgStyle} className="flex items-center justify-center">
        <div className="bg-white rounded-2xl shadow-xl p-10 text-center max-w-sm">
          <div className="text-4xl mb-4">🎬</div>
          <h2 className="text-xl font-black text-gray-800 mb-2">Form not found</h2>
          <p className="text-sm text-gray-400">
            This supplier form link is invalid or the production does not exist.
          </p>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div style={bgStyle} className="flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl p-10 text-center max-w-md w-full">
          <CheckCircle size={48} className="text-green-500 mx-auto mb-4" />
          <h2 className="text-2xl font-black text-gray-800 mb-2">Thank you, {form.full_name}!</h2>
          <p className="text-sm text-gray-500">
            Your details have been submitted for <strong>{production.project_name}</strong>.
            The production team will be in touch.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={bgStyle} className="flex items-start justify-center p-4 py-10">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden">
        {/* Header */}
        <div className="px-8 pt-8 pb-5 border-b border-gray-100">
          {config.logoUrl && (
            <img src={config.logoUrl} alt="Logo" className="h-10 mb-4 object-contain" />
          )}
          <div className="text-xs text-gray-400 font-mono mb-1">
            {production.production_id}
          </div>
          <h1 className="text-xl font-black text-gray-900">{production.project_name}</h1>
          <div className="text-sm text-gray-500 mt-1">Supplier Sign-up</div>
        </div>

        {/* Step indicator */}
        <div className="flex px-8 pt-4 gap-2 items-center">
          {[1, 2].map(s => (
            <div key={s} className="flex items-center gap-2">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                step === s ? 'bg-blue-600 text-white' :
                step > s  ? 'bg-green-500 text-white' :
                'bg-gray-100 text-gray-400'
              }`}>
                {step > s ? '✓' : s}
              </div>
              {s < 2 && <div className={`flex-1 h-0.5 w-10 ${step > s ? 'bg-green-400' : 'bg-gray-200'}`} />}
            </div>
          ))}
          <span className="text-xs text-gray-400 ml-2">
            {step === 1 ? 'Supplier type' : 'Your details'}
          </span>
        </div>

        <div className="px-8 py-6">
          {/* ── STEP 1: Type selection ── */}
          {step === 1 && (
            <div className="space-y-4">
              <p className="text-sm font-semibold text-gray-700 mb-4">What type of supplier are you?</p>
              {[
                { id: 'production', label: 'Production Supplier (On-Set)', desc: 'Crew, equipment, catering, location, etc.' },
                { id: 'post_production', label: 'Post-Production Supplier', desc: 'Editing, VFX, color, sound, music, etc.' },
              ].map(opt => (
                <label
                  key={opt.id}
                  className={`flex items-start gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all ${
                    supplierType === opt.id
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <input
                    type="radio"
                    name="supplierType"
                    value={opt.id}
                    checked={supplierType === opt.id}
                    onChange={() => setSupplierType(opt.id)}
                    className="mt-0.5 accent-blue-600"
                  />
                  <div>
                    <div className="font-semibold text-sm text-gray-800">{opt.label}</div>
                    <div className="text-xs text-gray-400 mt-0.5">{opt.desc}</div>
                  </div>
                </label>
              ))}
              <button
                onClick={() => setStep(2)}
                disabled={!supplierType}
                className="w-full mt-4 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold bg-blue-600 hover:bg-blue-700 text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Continue <ChevronRight size={16} />
              </button>
            </div>
          )}

          {/* ── STEP 2: Form fields ── */}
          {step === 2 && (
            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Personal info */}
              <div>
                <div className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3">Personal Info</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="sm:col-span-2">
                    <label className="field-label">Full Name *</label>
                    <input className="brand-input" required value={form.full_name}
                      onChange={e => set('full_name', e.target.value)} placeholder="Full name" />
                  </div>
                  <div>
                    <label className="field-label">Role / Position *</label>
                    <input className="brand-input" required value={form.role}
                      onChange={e => set('role', e.target.value)} placeholder="e.g. Camera Operator" />
                  </div>
                  <div>
                    <label className="field-label">Phone *</label>
                    <input className="brand-input" required value={form.phone}
                      onChange={e => set('phone', e.target.value)} placeholder="+972 50 000 0000" />
                  </div>
                  <div>
                    <label className="field-label">Email</label>
                    <input className="brand-input" type="email" value={form.email}
                      onChange={e => set('email', e.target.value)} placeholder="you@example.com" />
                  </div>
                  <div>
                    <label className="field-label">ID Number / TZ</label>
                    <input className="brand-input" value={form.id_number}
                      onChange={e => set('id_number', e.target.value)} placeholder="000000000" />
                  </div>
                </div>
              </div>

              {/* Bank details */}
              <div>
                <div className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3">Bank Details</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="field-label">Bank Name</label>
                    <input className="brand-input" value={form.bank_name}
                      onChange={e => set('bank_name', e.target.value)} placeholder="e.g. Bank Hapoalim" />
                  </div>
                  <div>
                    <label className="field-label">Account Number</label>
                    <input className="brand-input" value={form.account_number}
                      onChange={e => set('account_number', e.target.value)} placeholder="000-000000" />
                  </div>
                  <div>
                    <label className="field-label">Branch</label>
                    <input className="brand-input" value={form.branch}
                      onChange={e => set('branch', e.target.value)} placeholder="Branch code" />
                  </div>
                  <div>
                    <label className="field-label">SWIFT</label>
                    <input className="brand-input" value={form.swift}
                      onChange={e => set('swift', e.target.value)} placeholder="XXXXXXXXXX" />
                  </div>
                </div>
              </div>

              {/* Business type */}
              <div>
                <div className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3">Business Type</div>
                <div className="flex gap-3 mb-3">
                  {['individual', 'company'].map(bt => (
                    <label key={bt} className={`flex items-center gap-2 px-4 py-2 rounded-xl border-2 cursor-pointer transition-all text-sm font-medium ${
                      form.business_type === bt
                        ? 'border-blue-500 bg-blue-50 text-blue-700'
                        : 'border-gray-200 text-gray-600 hover:border-gray-300'
                    }`}>
                      <input type="radio" name="business_type" value={bt}
                        checked={form.business_type === bt}
                        onChange={() => set('business_type', bt)}
                        className="accent-blue-600" />
                      {bt === 'individual' ? 'Individual' : 'Company'}
                    </label>
                  ))}
                </div>
                {form.business_type === 'company' && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="field-label">Company Name</label>
                      <input className="brand-input" value={form.company_name}
                        onChange={e => set('company_name', e.target.value)} placeholder="Company Ltd." />
                    </div>
                    <div>
                      <label className="field-label">VAT / Tax Number</label>
                      <input className="brand-input" value={form.tax_id}
                        onChange={e => set('tax_id', e.target.value)} placeholder="000000000" />
                    </div>
                  </div>
                )}
              </div>

              {/* On-Set only: food */}
              {supplierType === 'production' && (
                <div>
                  <div className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3">Food Preferences</div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="field-label">Food Restrictions</label>
                      <input className="brand-input" value={form.food_restrictions}
                        onChange={e => set('food_restrictions', e.target.value)}
                        placeholder="e.g. Vegetarian, Gluten-free…" />
                    </div>
                    <div>
                      <label className="field-label">Dietary Notes</label>
                      <input className="brand-input" value={form.dietary_notes}
                        onChange={e => set('dietary_notes', e.target.value)}
                        placeholder="Any other dietary info…" />
                    </div>
                  </div>
                </div>
              )}

              {/* Additional notes */}
              <div>
                <label className="field-label">Additional Notes</label>
                <textarea
                  className="brand-input resize-none"
                  rows={3}
                  value={form.notes}
                  onChange={e => set('notes', e.target.value)}
                  placeholder="Anything else we should know…"
                />
              </div>

              {/* Actions */}
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="flex items-center gap-1 px-4 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-500 hover:bg-gray-50 transition-colors"
                >
                  <ChevronLeft size={14} /> Back
                </button>
                <button
                  type="submit"
                  className="flex-1 py-3 rounded-xl text-sm font-bold bg-blue-600 hover:bg-blue-700 text-white transition-colors"
                >
                  Submit
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
