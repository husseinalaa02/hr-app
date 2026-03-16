import { useAuth } from '../context/AuthContext';
import { hasPermission } from './permissions';

export function usePermission() {
  const { employee } = useAuth();
  const role = employee?.role || 'employee';

  const can = (permission) => hasPermission(role, permission);

  const canAny = (permissions) => {
    if (!Array.isArray(permissions)) return false;
    return permissions.some((p) => hasPermission(role, p));
  };

  const isReadOnly    = role === 'audit_manager' || role === 'ceo';
  const isHR          = role === 'hr_manager'    || role === 'admin';
  const isFinance     = role === 'finance_manager'|| role === 'admin';
  const isCEO         = role === 'ceo'            || role === 'admin';
  const isAudit       = role === 'audit_manager';

  return { can, canAny, role, isReadOnly, isHR, isFinance, isCEO, isAudit };
}
