import { StrictMode } from 'react';

// Safety guard: demo mode must never run on a real deployment.
// If VITE_DEMO_MODE=true is accidentally set in a Vercel production env,
// this throws immediately so the problem is caught before any employee data
// is exposed without authentication.
if (import.meta.env.VITE_DEMO_MODE === 'true') {
  const host = window.location.hostname;
  const isSafe = host === 'localhost' || host === '127.0.0.1' || host.endsWith('.local');
  if (!isSafe) {
    document.body.innerHTML =
      '<div style="padding:32px;font-family:sans-serif;color:#c62828">' +
      '<h2>Configuration Error</h2>' +
      '<p>DEMO_MODE is enabled on a non-local host. Remove VITE_DEMO_MODE from your production environment variables.</p>' +
      '</div>';
    throw new Error('DEMO_MODE must not be enabled in production');
  }
}
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import './i18n';
import './style.css';
import App from './App.jsx';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <App />
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>
);
