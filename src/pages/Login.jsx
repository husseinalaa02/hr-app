import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

const DEMO = import.meta.env.VITE_DEMO_MODE === 'true';

export default function Login() {
  const { login } = useAuth();
  const { addToast } = useToast();
  const navigate = useNavigate();
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
      addToast(err.message || 'Invalid credentials. Please try again.', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-brand">
          <img src="/afaq_logo.png" alt="Afaq Al-Fiker" className="login-logo-img" />
          <h2>AFAQ ALFIKER</h2>
          <p>HR Management System</p>
        </div>
        <form onSubmit={handleSubmit} className="login-form">
          <div className="form-group">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="text"
              className="form-input"
              placeholder="your@email.com or Administrator"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
            />
          </div>
          <div className="form-group">
            <label htmlFor="password">Password</label>
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
            {loading ? <span className="spinner-sm" /> : 'Sign In'}
          </button>
          {DEMO && (
            <div className="demo-notice">
              <strong>Demo Mode</strong> — any password works<br />
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
