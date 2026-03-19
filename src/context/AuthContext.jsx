import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase, SUPABASE_MODE } from '../db/supabase';
import { initDatabase, clearDatabase } from '../db/index';
import { hasPermission as rbacHasPermission } from '../rbac/permissions';
import { getPermissionOverrides, getCustomRoles } from '../api/admin';
import { invalidate } from '../utils/cache';

const AuthContext = createContext(null);
const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === 'true';
const API_BASE  = import.meta.env.VITE_API_BASE_URL || '';

// ─── Rate limiting (client-side extra layer) ─────────────────────────────────
const MAX_ATTEMPTS     = 5;
const LOCKOUT_MS       = 15 * 60 * 1000; // 15 minutes

function checkRateLimit() {
  try {
    const raw = localStorage.getItem('_login_attempts');
    if (!raw) return null;
    const { count, since } = JSON.parse(raw);
    const elapsed = Date.now() - since;
    if (count >= MAX_ATTEMPTS && elapsed < LOCKOUT_MS) {
      const remaining = Math.ceil((LOCKOUT_MS - elapsed) / 60000);
      return `Too many failed attempts. Try again in ${remaining} minute${remaining > 1 ? 's' : ''}.`;
    }
    if (elapsed >= LOCKOUT_MS) localStorage.removeItem('_login_attempts');
    return null;
  } catch { return null; }
}

function recordFailedAttempt() {
  try {
    const raw = localStorage.getItem('_login_attempts');
    const prev = raw ? JSON.parse(raw) : { count: 0, since: Date.now() };
    const elapsed = Date.now() - prev.since;
    const count = elapsed < LOCKOUT_MS ? prev.count + 1 : 1;
    const since = elapsed < LOCKOUT_MS ? prev.since : Date.now();
    localStorage.setItem('_login_attempts', JSON.stringify({ count, since }));
  } catch {}
}

function clearRateLimit() {
  localStorage.removeItem('_login_attempts');
}

// ─── Demo profiles (fallback when Supabase is not configured) ────────────────
const DEMO_PROFILES = {
  hassan: { name: 'HR-EMP-0010', employee_name: 'Hussein Alaa', department: 'Management', designation: 'System Administrator', cell_number: '', image: '', company: 'AFAQ ALFIKER', date_of_joining: '2015-01-01', gender: 'Male', date_of_birth: '', employment_type: 'Full-time', branch: 'Baghdad HQ', personal_email: '', company_email: 'hussein@afaqalfiker.com', reports_to: '', employee_type: 'Office', role: 'admin' },
  ceo:     { name: 'HR-EMP-0009', employee_name: 'Alaa Alghanimi', department: 'Management', designation: 'CEO', cell_number: '+964 770 000 0001', image: '', company: 'AFAQ ALFIKER', date_of_joining: '2015-01-01', gender: 'Male', date_of_birth: '1975-03-10', employment_type: 'Full-time', branch: 'Baghdad HQ', personal_email: 'alaa@gmail.com', company_email: 'alaa@afaqalfiker.com', reports_to: '', employee_type: 'Office', role: 'ceo' },
  sara:    { name: 'HR-EMP-0002', employee_name: 'Sara Al-Otaibi', department: 'Human Resources', designation: 'HR Manager', cell_number: '+964 771 234 5678', image: '', company: 'AFAQ ALFIKER', date_of_joining: '2019-01-15', gender: 'Female', date_of_birth: '1988-04-20', employment_type: 'Full-time', branch: 'Baghdad HQ', personal_email: 'sara@gmail.com', company_email: 'sara@afaqalfiker.com', reports_to: 'HR-EMP-0009', employee_type: 'Office', role: 'hr_manager' },
  khalid:  { name: 'HR-EMP-0003', employee_name: 'Khalid Al-Zahrani', department: 'Finance', designation: 'Finance Manager', cell_number: '+964 772 345 6789', image: '', company: 'AFAQ ALFIKER', date_of_joining: '2018-06-01', gender: 'Male', date_of_birth: '1983-08-15', employment_type: 'Full-time', branch: 'Baghdad HQ', personal_email: 'khalid@gmail.com', company_email: 'khalid@afaqalfiker.com', reports_to: 'HR-EMP-0009', employee_type: 'Office', role: 'finance_manager' },
  ahmed:   { name: 'HR-EMP-0001', employee_name: 'Ahmed Al-Rashidi', department: 'Information Technology', designation: 'IT Manager', cell_number: '+964 770 123 4567', image: '', company: 'AFAQ ALFIKER', date_of_joining: '2022-03-01', gender: 'Male', date_of_birth: '1995-06-15', employment_type: 'Full-time', branch: 'Baghdad HQ', personal_email: 'ahmed@gmail.com', company_email: 'ahmed@afaqalfiker.com', reports_to: 'HR-EMP-0009', employee_type: 'Office', role: 'it_manager' },
  reem:    { name: 'HR-EMP-0006', employee_name: 'Reem Al-Dossari', department: 'Information Technology', designation: 'Software Developer', cell_number: '+964 775 678 9012', image: '', company: 'AFAQ ALFIKER', date_of_joining: '2023-09-01', gender: 'Female', date_of_birth: '2000-04-22', employment_type: 'Full-time', branch: 'Baghdad HQ', personal_email: 'reem@gmail.com', company_email: 'reem@afaqalfiker.com', reports_to: 'HR-EMP-0001', employee_type: 'Office', role: 'employee' },
};

function getDemoProfile(id) {
  const raw = (id || '').toLowerCase().trim().split('@')[0];
  if (raw === 'hassan' || raw === 'hussein') return DEMO_PROFILES.hassan;
  if (raw === 'administrator' || raw === 'ceo' || raw === 'alaa') return DEMO_PROFILES.ceo;
  if (raw === 'sara' || raw === 'hr') return DEMO_PROFILES.sara;
  if (raw === 'khalid' || raw === 'finance_manager') return DEMO_PROFILES.khalid;
  if (raw === 'ahmed' || raw === 'itmanager') return DEMO_PROFILES.ahmed;
  if (raw === 'reem') return DEMO_PROFILES.reem;
  return null;
}

export function AuthProvider({ children }) {
  const [user, setUser]         = useState(null);
  const [employee, setEmployee] = useState(null);
  const [loading, setLoading]   = useState(true);
  const [permOverrides, setPermOverrides] = useState({});
  const [customRoles, setCustomRoles]     = useState([]);

  // Fetch employee record for a Supabase Auth user
  const fetchEmployee = useCallback(async (authUser) => {
    const { data: emp } = await supabase
      .from('employees').select('*').eq('auth_id', authUser.id).single();
    return emp || null;
  }, []);

  const loadSession = useCallback(async () => {
    try {
      await initDatabase();

      if (SUPABASE_MODE) {
        const { data: { session } } = await supabase.auth.getSession();
        getCustomRoles().then(setCustomRoles).catch(() => {});
        if (session?.user) {
          const emp = await fetchEmployee(session.user);
          setUser(session.user);
          setEmployee(emp);
          if (emp?.name) {
            getPermissionOverrides(emp.name).then(setPermOverrides).catch(() => {});
          }
        }
        return;
      }

      if (DEMO_MODE) {
        const stored = localStorage.getItem('user_info');
        if (stored) {
          try {
            const info = JSON.parse(stored);
            if (info.user) {
              const profile = getDemoProfile(info.user);
              if (profile) {
                setUser(info.user);
                setEmployee({ ...profile, user_id: info.user });
              }
            }
          } catch {}
        }
      }
    } catch (err) {
      console.error('[Auth] Session load failed:', err);
    } finally {
      setLoading(false);
    }
  }, [fetchEmployee]);

  useEffect(() => {
    loadSession();

    if (SUPABASE_MODE) {
      // Keep state in sync with Supabase session changes (token refresh, sign-out)
      const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
        if (event === 'SIGNED_IN' && session?.user) {
          const emp = await fetchEmployee(session.user);
          setUser(session.user);
          setEmployee(emp);
          if (emp?.name) {
            getPermissionOverrides(emp.name).then(setPermOverrides).catch(() => {});
          }
        } else if (event === 'SIGNED_OUT' || (event === 'TOKEN_REFRESHED' && !session)) {
          setUser(null);
          setEmployee(null);
          setPermOverrides({});
        } else if (event === 'TOKEN_REFRESHED' && session?.user) {
          // Re-fetch employee in case role/data changed
          const emp = await fetchEmployee(session.user);
          setEmployee(emp);
        }
      });
      return () => subscription.unsubscribe();
    }
  }, [loadSession, fetchEmployee]);

  const login = async (identifier, password) => {
    // Client-side rate limit check
    const lockMsg = checkRateLimit();
    if (lockMsg) throw new Error(lockMsg);

    if (SUPABASE_MODE) {
      const email = `${identifier.toLowerCase().trim()}@afaqhr.internal`;

      // Try Supabase Auth first
      let { data, error } = await supabase.auth.signInWithPassword({ email, password });

      if (error) {
        // If user doesn't have an auth account yet, transparently migrate them
        if (error.message?.toLowerCase().includes('invalid login credentials') ||
            error.message?.toLowerCase().includes('email not confirmed')) {
          try {
            const migrateRes = await fetch(`${API_BASE}/api/migrate-auth`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ user_id: identifier.toLowerCase().trim(), password }),
            });
            const migrateData = await migrateRes.json();
            if (migrateRes.ok && (migrateData.migrated || migrateData.already_done)) {
              // Retry Supabase Auth after migration
              const retry = await supabase.auth.signInWithPassword({ email, password });
              data  = retry.data;
              error = retry.error;
            }
          } catch {
            // Migration endpoint unavailable — fall through to error
          }
        }
      }

      if (error) {
        recordFailedAttempt();
        throw new Error('Invalid username or password');
      }

      clearRateLimit();
      // Employee is set via onAuthStateChange
      return;
    }

    if (DEMO_MODE) {
      const profile = getDemoProfile(identifier);
      const emp = profile
        ? { ...profile, user_id: identifier }
        : { ...DEMO_PROFILES.reem, user_id: identifier };
      setUser(identifier);
      setEmployee(emp);
      localStorage.setItem('user_info', JSON.stringify({ user: identifier, employee: emp }));
      return;
    }

    throw new Error('No authentication backend configured');
  };

  const logout = async () => {
    if (SUPABASE_MODE) {
      await supabase.auth.signOut();
    }
    // Clear in-memory cache so the next user doesn't see this user's cached data
    invalidate('employees', 'departments', 'announcements', 'schedule', 'schedules');
    localStorage.removeItem('user_info');
    await clearDatabase();
    setUser(null);
    setEmployee(null);
    setPermOverrides({});
  };

  const refreshEmployee = async (updated) => {
    if (updated) {
      setEmployee(updated);
    } else if (SUPABASE_MODE && user) {
      const emp = await fetchEmployee(user);
      setEmployee(emp);
    }
  };

  // Expose the current session token for API calls that need authorization
  const getAccessToken = async () => {
    if (!SUPABASE_MODE) return null;
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token || null;
  };

  const role      = employee?.role || 'employee';
  const isAdmin   = role === 'admin';
  const isCEO     = role === 'ceo'             || role === 'admin';
  const isFinance = role === 'finance_manager' || role === 'admin';
  const isAudit   = role === 'audit_manager';
  const isHR      = role === 'hr_manager'      || role === 'admin';

  const hasPermission = (permission) => {
    if (permission in permOverrides) return permOverrides[permission];
    // Try built-in RBAC first
    const result = rbacHasPermission(role, permission);
    if (result) return true;
    // If built-in role returned false, that's definitive
    const BUILT_IN = ['admin','ceo','hr_manager','finance_manager','it_manager','audit_manager','employee'];
    if (BUILT_IN.includes(role)) return false;
    // Custom role: look up in loaded customRoles
    const customRole = customRoles.find(r => r.name === role);
    return customRole?.permissions?.includes(permission) ?? false;
  };

  const reloadPermissions = async () => {
    if (employee?.name) {
      const ov = await getPermissionOverrides(employee.name);
      setPermOverrides(ov);
    }
  };

  return (
    <AuthContext.Provider value={{
      user, employee, loading,
      login, logout, refreshEmployee, getAccessToken,
      isAdmin, isCEO, isFinance, isAudit, isHR,
      hasPermission, permOverrides, reloadPermissions, customRoles, demoMode: DEMO_MODE,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
