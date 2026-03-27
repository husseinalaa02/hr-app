import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../context/ToastContext';
import { useTranslation } from 'react-i18next';
import { supabase } from '../db/supabase';

export default function ResetPassword() {
  const { addToast } = useToast();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [newPwd, setNewPwd] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const hash = window.location.hash;
    if (!hash.includes('type=recovery')) {
      navigate('/login', { replace: true });
      return;
    }
    const params = new URLSearchParams(hash.slice(1));
    const accessToken  = params.get('access_token');
    const refreshToken = params.get('refresh_token');
    if (!accessToken || !refreshToken) {
      addToast(t('auth.resetLinkExpired'), 'error');
      navigate('/login', { replace: true });
      return;
    }
    supabase.auth
      .setSession({ access_token: accessToken, refresh_token: refreshToken })
      .then(() => {
        setReady(true);
        window.history.replaceState(null, '', window.location.pathname);
      })
      .catch(() => {
        addToast(t('auth.resetLinkExpired'), 'error');
        navigate('/login', { replace: true });
      });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handle = async (e) => {
    e.preventDefault();
    if (newPwd !== confirm) { addToast(t('auth.passwordsDoNotMatch'), 'error'); return; }
    if (newPwd.length < 6)  { addToast(t('auth.passwordTooShort'), 'error'); return; }
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPwd });
      if (error) throw error;
      addToast(t('auth.passwordUpdated'), 'success');
      navigate('/login', { replace: true });
    } catch (err) {
      addToast(err.message || t('errors.actionFailed'), 'error');
    } finally {
      setLoading(false);
    }
  };

  if (!ready) {
    return <div className="app-loading"><span className="spinner" /></div>;
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-brand">
          <h2>{t('auth.setNewPasswordTitle')}</h2>
        </div>
        <form onSubmit={handle} className="login-form">
          <div className="form-group">
            <label htmlFor="new-pwd">{t('auth.newPassword')}</label>
            <input
              id="new-pwd"
              type="password"
              className="form-input"
              value={newPwd}
              onChange={e => setNewPwd(e.target.value)}
              required
              autoFocus
              minLength={6}
              placeholder="••••••••"
            />
          </div>
          <div className="form-group">
            <label htmlFor="confirm-pwd">{t('auth.confirmPassword')}</label>
            <input
              id="confirm-pwd"
              type="password"
              className="form-input"
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              required
              placeholder="••••••••"
            />
          </div>
          <button type="submit" className="btn btn-primary btn-full" disabled={loading}>
            {loading ? <span className="spinner-sm" /> : t('auth.resetPassword')}
          </button>
        </form>
      </div>
    </div>
  );
}
