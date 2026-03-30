import '@fontsource/cairo/300.css';
import '@fontsource/cairo/400.css';
import '@fontsource/cairo/500.css';
import '@fontsource/cairo/600.css';
import '@fontsource/cairo/700.css';
import '@fontsource/tajawal/300.css';
import '@fontsource/tajawal/400.css';
import '@fontsource/tajawal/500.css';
import '@fontsource/tajawal/700.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import { Analytics } from '@vercel/analytics/react';
import './i18n';
import './style.css';
import App from './App.jsx';

// Safety guard: Supabase env vars must be set when not in demo mode.
if (import.meta.env.VITE_DEMO_MODE !== 'true' && !import.meta.env.VITE_SUPABASE_URL) {
  document.body.innerHTML =
    '<div style="padding:32px;font-family:sans-serif;color:#c62828">' +
    '<h2>Configuration Error</h2>' +
    '<p>VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be set. ' +
    'Add them to your .env file or deployment environment variables.</p>' +
    '</div>';
  throw new Error('Missing required environment variables: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY');
}

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

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <App />
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
    <Analytics />
  </StrictMode>
);
