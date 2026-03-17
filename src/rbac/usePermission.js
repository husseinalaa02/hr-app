import { useAuth } from '../context/AuthContext';

export function usePermission() {
  const { employee, hasPermission } = useAuth();
  const role = employee?.role || 'employee';

  const can = (permission) => hasPermission(permission);

  const canAny = (permissions) => {
    if (!Array.isArray(permissions)) return false;
    return permissions.some((p) => hasPermission(p));
  };

  const isReadOnly    = role === 'audit_manager' || role === 'ceo';
  const isHR          = role === 'hr_manager'    || role === 'admin';
  const isFinance     = role === 'finance_manager'|| role === 'admin';
  const isCEO         = role === 'ceo'            || role === 'admin';
  const isAudit       = role === 'audit_manager';

  return { can, canAny, role, isReadOnly, isHR, isFinance, isCEO, isAudit };
}
