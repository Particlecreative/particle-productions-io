import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useBrand } from '../context/BrandContext';
import BrandSwitcher from '../components/layout/BrandSwitcher';

const MASTER_KEY = 'Particle2026@@';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Forgot password flow: null | 'masterKey' | 'setPassword'
  const [fpStep, setFpStep] = useState(null);
  const [fpEmail, setFpEmail] = useState('');
  const [fpMasterKey, setFpMasterKey] = useState('');
  const [fpNewPassword, setFpNewPassword] = useState('');
  const [fpConfirm, setFpConfirm] = useState('');
  const [fpDone, setFpDone] = useState(false);

  const { login, resetPassword } = useAuth();
  const { brand, brandId } = useBrand();
  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    const result = await login(email, password);
    setLoading(false);
    if (result.success) navigate('/');
    else setError(result.error);
  }

  function handleForgotStart() {
    setFpStep('masterKey');
    setFpEmail('');
    setFpMasterKey('');
    setFpNewPassword('');
    setFpConfirm('');
    setFpDone(false);
    setError('');
  }

  function handleMasterKeySubmit(e) {
    e.preventDefault();
    if (fpMasterKey !== MASTER_KEY) {
      setError('Incorrect master key. Please ask your admin.');
      return;
    }
    setError('');
    setFpStep('setPassword');
  }

  function handleSetPassword(e) {
    e.preventDefault();
    if (!fpEmail.trim()) { setError('Please enter your email.'); return; }
    if (fpNewPassword.length < 4) { setError('Password must be at least 4 characters.'); return; }
    if (fpNewPassword !== fpConfirm) { setError('Passwords do not match.'); return; }
    resetPassword(fpEmail.trim(), fpNewPassword);
    setFpDone(true);
    setError('');
  }

  const isBlurr = brandId === 'blurr';

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center p-6"
      style={{ background: 'var(--brand-bg)' }}
    >
      {/* Brand Switcher */}
      <div className="absolute top-6 right-6">
        <div
          className="rounded-xl px-2 py-2"
          style={{ background: 'rgba(0,0,0,0.08)' }}
        >
          <BrandSwitcher />
        </div>
      </div>

      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-10">
          <div
            className="inline-flex items-center justify-center w-16 h-16 rounded-2xl text-white text-2xl font-black mb-4 shadow-lg"
            style={{
              background: isBlurr
                ? 'linear-gradient(135deg, #B842A9, #F86EE6)'
                : 'var(--brand-primary)',
            }}
          >
            {isBlurr ? 'B' : 'P'}
          </div>
          <h1
            className="text-4xl font-black brand-title"
            style={{
              color: 'var(--brand-primary)',
              fontFamily: isBlurr
                ? "'Avenir Next Condensed', Impact, sans-serif"
                : "'Sofia Sans Extra Condensed', sans-serif",
              fontWeight: 800,
              textTransform: isBlurr ? 'uppercase' : 'none',
            }}
          >
            {brand.name}
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--brand-secondary)' }}>
            Creative Production Panel
          </p>
        </div>

        {/* Card */}
        <div className="rounded-2xl p-8 shadow-xl" style={{ background: 'white' }}>

          {/* ---- Normal Login ---- */}
          {fpStep === null && (
            <>
              <h2 className="text-lg font-bold text-gray-800 mb-6">Sign in</h2>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                    Email
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    className="brand-input"
                    placeholder="you@example.com"
                    required
                    autoComplete="email"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                    Password
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    className="brand-input"
                    placeholder="••••••••"
                    required
                    autoComplete="current-password"
                  />
                </div>
                {error && (
                  <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">
                    {error}
                  </div>
                )}
                <button
                  type="submit"
                  disabled={loading}
                  className="btn-cta w-full py-3 text-sm rounded-xl mt-2"
                  style={{ opacity: loading ? 0.7 : 1 }}
                >
                  {loading ? 'Signing in…' : 'Sign in'}
                </button>
              </form>
              <div className="mt-4 text-center">
                <button
                  onClick={handleForgotStart}
                  className="text-xs text-gray-400 hover:text-gray-600 underline transition-colors"
                >
                  Forgot password?
                </button>
              </div>
            </>
          )}

          {/* ---- Step 1: Enter Master Key ---- */}
          {fpStep === 'masterKey' && (
            <>
              <h2 className="text-lg font-bold text-gray-800 mb-1">Reset Password</h2>
              <p className="text-xs text-gray-400 mb-6">Ask your admin for the master key to reset your password.</p>
              <form onSubmit={handleMasterKeySubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                    Master Key
                  </label>
                  <input
                    type="password"
                    value={fpMasterKey}
                    onChange={e => setFpMasterKey(e.target.value)}
                    className="brand-input"
                    placeholder="Enter master key"
                    required
                    autoFocus
                  />
                </div>
                {error && (
                  <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">
                    {error}
                  </div>
                )}
                <button type="submit" className="btn-cta w-full py-3 text-sm rounded-xl">
                  Continue
                </button>
              </form>
              <div className="mt-4 text-center">
                <button
                  onClick={() => { setFpStep(null); setError(''); }}
                  className="text-xs text-gray-400 hover:text-gray-600 underline"
                >
                  Back to sign in
                </button>
              </div>
            </>
          )}

          {/* ---- Step 2: Set New Password ---- */}
          {fpStep === 'setPassword' && !fpDone && (
            <>
              <h2 className="text-lg font-bold text-gray-800 mb-1">Set New Password</h2>
              <p className="text-xs text-gray-400 mb-6">Enter your email and choose a new password.</p>
              <form onSubmit={handleSetPassword} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                    Your Email
                  </label>
                  <input
                    type="email"
                    value={fpEmail}
                    onChange={e => setFpEmail(e.target.value)}
                    className="brand-input"
                    placeholder="you@example.com"
                    required
                    autoFocus
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                    New Password
                  </label>
                  <input
                    type="password"
                    value={fpNewPassword}
                    onChange={e => setFpNewPassword(e.target.value)}
                    className="brand-input"
                    placeholder="New password"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                    Confirm Password
                  </label>
                  <input
                    type="password"
                    value={fpConfirm}
                    onChange={e => setFpConfirm(e.target.value)}
                    className="brand-input"
                    placeholder="Confirm new password"
                    required
                  />
                </div>
                {error && (
                  <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">
                    {error}
                  </div>
                )}
                <button type="submit" className="btn-cta w-full py-3 text-sm rounded-xl">
                  Save Password
                </button>
              </form>
            </>
          )}

          {/* ---- Done ---- */}
          {fpStep === 'setPassword' && fpDone && (
            <div className="text-center py-4">
              <div className="text-3xl mb-3">✓</div>
              <h2 className="text-lg font-bold text-gray-800 mb-1">Password Updated</h2>
              <p className="text-xs text-gray-400 mb-6">You can now sign in with your new password.</p>
              <button
                onClick={() => { setFpStep(null); setEmail(fpEmail); }}
                className="btn-cta w-full py-3 text-sm rounded-xl"
              >
                Back to Sign In
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
