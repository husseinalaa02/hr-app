import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { login as apiLogin, logout as apiLogout, getLoggedInUser, getEmployeeForUser } from '../api/auth';
import { findEmployeeByUserId, deriveRole } from '../api/employees';
import { initDatabase, clearDatabase } from '../db/index';
import { hasPermission as rbacHasPermission } from '../rbac/permissions';
import { supabase, SUPABASE_MODE } from '../db/supabase';

const AuthContext = createContext(null);

const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === 'true';

const DEMO_PROFILES = {
  hassan: {
    name: 'HR-EMP-0010',
    employee_name: 'Hussein Alaa',
    department: 'Management',
    designation: 'System Administrator',
    cell_number: '',
    image: '',
    company: 'Afaq Al-Fiker',
    date_of_joining: '2015-01-01',
    gender: 'Male',
    date_of_birth: '',
    employment_type: 'Full-time',
    branch: 'Baghdad HQ',
    personal_email: '',
    company_email: 'hussein@afaqalfiker.com',
    reports_to: '',
    role: 'admin',
  },
  ceo: {
    name: 'HR-EMP-0009',
    employee_name: 'Alaa Alghanimi',
    department: 'Management',
    designation: 'CEO',
    cell_number: '+964 770 000 0001',
    image: '',
    company: 'Afaq Al-Fiker',
    date_of_joining: '2015-01-01',
    gender: 'Male',
    date_of_birth: '1975-03-10',
    employment_type: 'Full-time',
    branch: 'Baghdad HQ',
    personal_email: 'alaa@gmail.com',
    company_email: 'alaa@afaqalfiker.com',
    reports_to: '',
    role: 'ceo',
  },
  sara: {
    name: 'HR-EMP-0002',
    employee_name: 'Sara Al-Otaibi',
    department: 'Human Resources',
    designation: 'HR Manager',
    cell_number: '+964 771 234 5678',
    image: '',
    company: 'Afaq Al-Fiker',
    date_of_joining: '2019-01-15',
    gender: 'Female',
    date_of_birth: '1988-04-20',
    employment_type: 'Full-time',
    branch: 'Baghdad HQ',
    personal_email: 'sara@gmail.com',
    company_email: 'sara@afaqalfiker.com',
    reports_to: 'HR-EMP-0009',
    role: 'hr_manager',
  },
  khalid: {
    name: 'HR-EMP-0003',
    employee_name: 'Khalid Al-Zahrani',
    department: 'Finance',
    designation: 'Finance Manager',
    cell_number: '+964 772 345 6789',
    image: '',
    company: 'Afaq Al-Fiker',
    date_of_joining: '2018-06-01',
    gender: 'Male',
    date_of_birth: '1983-08-15',
    employment_type: 'Full-time',
    branch: 'Baghdad HQ',
    personal_email: 'khalid@gmail.com',
    company_email: 'khalid@afaqalfiker.com',
    reports_to: 'HR-EMP-0009',
    role: 'finance_manager',
  },
  ahmed: {
    name: 'HR-EMP-0001',
    employee_name: 'Ahmed Al-Rashidi',
    department: 'Information Technology',
    designation: 'IT Manager',
    cell_number: '+964 770 123 4567',
    image: '',
    company: 'Afaq Al-Fiker',
    date_of_joining: '2022-03-01',
    gender: 'Male',
    date_of_birth: '1995-06-15',
    employment_type: 'Full-time',
    branch: 'Baghdad HQ',
    personal_email: 'ahmed@gmail.com',
    company_email: 'ahmed@afaqalfiker.com',
    reports_to: 'HR-EMP-0009',
    role: 'it_manager',
  },
  audit: {
    name: 'AUDIT-001',
    employee_name: 'Audit Manager',
    department: 'Compliance',
    designation: 'Audit Manager',
    cell_number: '',
    image: '',
    company: 'Afaq Al-Fiker',
    date_of_joining: '2020-01-01',
    gender: 'Male',
    date_of_birth: '',
    employment_type: 'Full-time',
    branch: 'Baghdad HQ',
    personal_email: '',
    company_email: 'audit@afaqalfiker.com',
    reports_to: '',
    role: 'audit_manager',
  },
  reem: {
    name: 'HR-EMP-0006',
    employee_name: 'Reem Al-Dossari',
    department: 'Information Technology',
    designation: 'Software Developer',
    cell_number: '+964 775 678 9012',
    image: '',
    company: 'Afaq Al-Fiker',
    date_of_joining: '2023-09-01',
    gender: 'Female',
    date_of_birth: '2000-04-22',
    employment_type: 'Full-time',
    branch: 'Baghdad HQ',
    personal_email: 'reem@gmail.com',
    company_email: 'reem@afaqalfiker.com',
    reports_to: 'HR-EMP-0001',
    role: 'employee',
  },
};

function getDemoProfile(identifier) {
  const raw = (identifier || '').toLowerCase().trim();
  // Support both username and email (e.g. "hussein" or "hussein@afaqalfiker.com")
  const id = raw.includes('@') ? raw.split('@')[0] : raw;
  if (id === 'hassan' || id === 'hussein') return DEMO_PROFILES.hassan;
  if (id === 'administrator' || id === 'ceo' || id === 'alaa') return DEMO_PROFILES.ceo;
  if (id === 'sara' || id === 'hr') return DEMO_PROFILES.sara;
  if (id === 'khalid' || id === 'finance' || id === 'finance_manager') return DEMO_PROFILES.khalid;
  if (id === 'ahmed' || id === 'itmanager') return DEMO_PROFILES.ahmed;
  if (id === 'audit' || id === 'audit_manager') return DEMO_PROFILES.audit;
  if (id === 'reem' || id === 'employee') return DEMO_PROFILES.reem;
  return null;
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [employee, setEmployee] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadSession = useCallback(async () => {
    // Ensure the DB is seeded before anything else
    await initDatabase();

    const stored = localStorage.getItem('user_info');
    if (stored) {
      try {
        const info = JSON.parse(stored);
        if (SUPABASE_MODE && info.employee) {
          // Re-fetch fresh employee data from Supabase
          const { data: freshEmp } = await supabase.from('employees').select('*')
            .eq('name', info.employee.name).single();
          const emp = freshEmp || info.employee;
          setUser(info.user);
          setEmployee(emp);
          localStorage.setItem('user_info', JSON.stringify({ user: info.user, employee: emp }));
          setLoading(false);
          return;
        }
        if (DEMO_MODE && info.user) {
          // Always re-apply the latest DEMO_PROFILE so stale sessions get fresh role/data
          const profile = getDemoProfile(info.user);
          if (profile) {
            // Reject legacy generic identifiers like 'employee', 'admin', 'finance'
            // that used to be valid but now have real names (hussein, ahmed, khalid, etc.)
            const legacyIds = ['employee', 'admin'];
            if (legacyIds.includes(info.user.toLowerCase())) {
              localStorage.removeItem('user_info');
              setLoading(false);
              return;
            }
            const emp = { ...profile, user_id: info.user };
            localStorage.setItem('user_info', JSON.stringify({ user: info.user, employee: emp }));
            setUser(info.user);
            setEmployee(emp);
            setLoading(false);
            return;
          }
          // Unknown/stale identifier — clear and force re-login
          localStorage.removeItem('user_info');
          setLoading(false);
          return;
        }
        setUser(info.user);
        setEmployee(info.employee);
        setLoading(false);
        return;
      } catch {}
    }
    if (!DEMO_MODE) {
      try {
        const userEmail = await getLoggedInUser();
        if (userEmail && userEmail !== 'Guest') {
          const emp = await getEmployeeForUser(userEmail);
          setUser(userEmail);
          setEmployee(emp);
          localStorage.setItem('user_info', JSON.stringify({ user: userEmail, employee: emp }));
        }
      } catch {}
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadSession(); }, [loadSession]);

  const login = async (identifier, password) => {
    if (SUPABASE_MODE) {
      const { data: emp, error } = await supabase.from('employees').select('*')
        .eq('user_id', identifier.toLowerCase().trim()).single();
      if (error || !emp) throw new Error('User not found');
      if (emp.password !== password) throw new Error('Incorrect password');
      setUser(identifier);
      setEmployee(emp);
      localStorage.setItem('user_info', JSON.stringify({ user: identifier, employee: emp }));
      return;
    }
    if (DEMO_MODE) {
      let emp;
      const profile = getDemoProfile(identifier);
      if (profile) {
        emp = { ...profile, user_id: identifier };
      } else {
        // Fallback: look up in DB
        const found = await findEmployeeByUserId(identifier);
        if (found) {
          const role = await deriveRole(found);
          emp = { ...found, role };
        } else {
          emp = { ...DEMO_PROFILES.reem, user_id: identifier };
        }
      }
      setUser(identifier);
      setEmployee(emp);
      localStorage.setItem('user_info', JSON.stringify({ user: identifier, employee: emp }));
      return;
    }
    await apiLogin(identifier, password);
    const userEmail = await getLoggedInUser();
    const emp = await getEmployeeForUser(userEmail);
    const token = `${import.meta.env.VITE_API_KEY}:${import.meta.env.VITE_API_SECRET}`;
    localStorage.setItem('auth_token', token);
    localStorage.setItem('user_info', JSON.stringify({ user: userEmail, employee: emp }));
    setUser(userEmail);
    setEmployee(emp);
  };

  const logout = async () => {
    if (!DEMO_MODE) {
      try { await apiLogout(); } catch {}
    }
    localStorage.removeItem('auth_token');
    localStorage.removeItem('user_info');
    // Clear sensitive cached data from the local DB
    await clearDatabase();
    setUser(null);
    setEmployee(null);
  };

  const refreshEmployee = (updated) => {
    setEmployee(updated);
    const stored = localStorage.getItem('user_info');
    if (stored) {
      try {
        const info = JSON.parse(stored);
        localStorage.setItem('user_info', JSON.stringify({ ...info, employee: updated }));
      } catch {}
    }
  };

  const role      = employee?.role || 'employee';
  const isAdmin   = role === 'admin';
  const isCEO     = role === 'ceo'             || role === 'admin';
  const isFinance = role === 'finance_manager' || role === 'admin';
  const isAudit   = role === 'audit_manager';
  const isHR      = role === 'hr_manager'      || role === 'admin';

  const hasPermission = (permission) => rbacHasPermission(role, permission);

  return (
    <AuthContext.Provider value={{ user, employee, loading, login, logout, isAdmin, isCEO, isFinance, isAudit, isHR, hasPermission, demoMode: DEMO_MODE, refreshEmployee }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
