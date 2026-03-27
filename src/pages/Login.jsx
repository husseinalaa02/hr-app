import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useTranslation } from 'react-i18next';
import { supabase, SUPABASE_MODE } from '../db/supabase';
import Modal from '../components/Modal';

const DEMO = import.meta.env.VITE_DEMO_MODE === 'true';
const COMPANY = import.meta.env.VITE_DEFAULT_COMPANY || 'AFAQ ALFIKER';

export default function Login() {
  const { login } = useAuth();
  const { addToast } = useToast();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showReset, setShowReset] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetSending, setResetSending] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [retryIn, setRetryIn] = useState(null); // rate-limit countdown (minutes)

  // Show countdown if the account is currently locked out
  useEffect(() => {
    const MAX_ATTEMPTS = 5;
    const LOCKOUT_MS   = 15 * 60 * 1000;
    const check = () => {
      try {
        const raw = localStorage.getItem('_login_attempts');
        if (!raw) { setRetryIn(null); return; }
        const { count, since } = JSON.parse(raw);
        const elapsed = Date.now() - since;
        if (count >= MAX_ATTEMPTS && elapsed < LOCKOUT_MS) {
          setRetryIn(Math.ceil((LOCKOUT_MS - elapsed) / 60000));
        } else {
          setRetryIn(null);
        }
      } catch { setRetryIn(null); }
    };
    check();
    const id = setInterval(check, 30_000);
    return () => clearInterval(id);
  }, []);

  // Handle Supabase password-reset links arriving on the login page
  useEffect(() => {
    const hash = window.location.hash;
    if (hash.includes('type=recovery')) {
      navigate('/reset-password' + window.location.hash, { replace: true });
    } else if (hash.includes('error_code=otp_expired') || hash.includes('error=access_denied')) {
      addToast(t('auth.resetLinkExpired'), 'error');
      window.history.replaceState(null, '', window.location.pathname);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleReset = async (e) => {
    e.preventDefault();
    if (!resetEmail) return;
    setResetSending(true);
    try {
      if (SUPABASE_MODE) {
        await supabase.auth.resetPasswordForEmail(resetEmail);
      }
      setResetSent(true);
    } catch {
      addToast(t('auth.resetFailed'), 'error');
    } finally {
      setResetSending(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email || !password) return;
    setLoading(true);
    try {
      await login(email, password);
      navigate('/', { replace: true });
    } catch (err) {
      addToast(err.message || t('login.invalidCredentials'), 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
    <div className="login-page">
      <div className="login-card">
        <div className="login-brand">
          <img src="/afaq_logo.png" alt={COMPANY} className="login-logo-img" />
          <h2>{COMPANY}</h2>
          <p>{t('login.title')}</p>
        </div>
        <form onSubmit={handleSubmit} className="login-form">
          <div className="form-group">
            <label htmlFor="email">{t('login.email')}</label>
            <input
              id="email"
              type="text"
              className="form-input"
              placeholder={t('login.emailPlaceholder')}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
            />
          </div>
          <div className="form-group">
            <label htmlFor="password">{t('login.password')}</label>
            <input
              id="password"
              type="password"
              className="form-input"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          {retryIn !== null && (
            <div className="demo-notice" style={{ color: 'var(--danger)', background: 'var(--danger-light, #fef2f2)', borderColor: 'var(--danger)' }}>
              {t('auth.retryIn', { minutes: retryIn })}
            </div>
          )}
          <button type="submit" className="btn btn-primary btn-full" disabled={loading || retryIn !== null}>
            {loading ? <span className="spinner-sm" /> : t('login.signIn')}
          </button>
          <button
            type="button"
            className="btn-link"
            style={{ marginTop: 8, fontSize: 13, color: 'var(--primary)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
            onClick={() => { setShowReset(true); setResetSent(false); setResetEmail(''); }}
          >
            {t('auth.forgotPassword')}
          </button>
          {DEMO && (
            <div className="demo-notice">
              <strong>{t('login.demoMode')}</strong> — {t('login.demoNote')}<br />
              <code>hussein</code> Admin &nbsp;·&nbsp;
              <code>alaa</code> CEO &nbsp;·&nbsp;
              <code>sara</code> HR Manager &nbsp;·&nbsp;
              <code>khalid</code> Finance &nbsp;·&nbsp;
              <code>ahmed</code> IT Manager &nbsp;·&nbsp;
              <code>reem</code> Employee &nbsp;·&nbsp;
              <code>audit</code> Audit
            </div>
          )}
        </form>
      </div>
    </div>

    {showReset && (
      <Modal title={t('auth.forgotPassword')} onClose={() => !resetSending && setShowReset(false)} size="sm">
        {resetSent ? (
          <p style={{ textAlign: 'center', padding: '16px 0', color: 'var(--primary)' }}>{t('auth.resetEmailSent')}</p>
        ) : (
          <form onSubmit={handleReset} className="form-stack">
            <div className="form-group">
              <label>{t('login.email')}</label>
              <input
                type="email"
                className="form-input"
                placeholder={t('auth.resetEmailPlaceholder')}
                value={resetEmail}
                onChange={e => setResetEmail(e.target.value)}
                required
                autoFocus
              />
            </div>
            <div className="form-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setShowReset(false)} disabled={resetSending}>{t('common.cancel')}</button>
              <button type="submit" className="btn btn-primary" disabled={resetSending}>
                {resetSending ? <span className="spinner-sm" /> : t('auth.resetPassword')}
              </button>
            </div>
          </form>
        )}
      </Modal>
    )}
    </>
  );
}
