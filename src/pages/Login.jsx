import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useTranslation } from 'react-i18next';

const DEMO = import.meta.env.VITE_DEMO_MODE === 'true';

export default function Login() {
  const { login } = useAuth();
  const { addToast } = useToast();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

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
    <div className="login-page">
      <div className="login-card">
        <div className="login-brand">
          <img src="/afaq_logo.png" alt="AFAQ ALFIKER" className="login-logo-img" />
          <h2>AFAQ ALFIKER</h2>
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
          <button type="submit" className="btn btn-primary btn-full" disabled={loading}>
            {loading ? <span className="spinner-sm" /> : t('login.signIn')}
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
  );
}
