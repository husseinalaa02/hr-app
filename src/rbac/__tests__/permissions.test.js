import { describe, it, expect } from 'vitest';
import { hasPermission, ROLE_PERMISSIONS, PERMISSIONS } from '../permissions';

describe('hasPermission', () => {
  it('returns false for null/undefined inputs', () => {
    expect(hasPermission(null, 'payroll:read')).toBe(false);
    expect(hasPermission('admin', null)).toBe(false);
    expect(hasPermission(undefined, undefined)).toBe(false);
  });

  it('returns false for an unknown role', () => {
    expect(hasPermission('ghost_role', 'payroll:read')).toBe(false);
  });

  it('returns false for a permission the role does not have', () => {
    // employee cannot approve leave
    expect(hasPermission('employee', 'leave:approve')).toBe(false);
    // employee cannot read payroll
    expect(hasPermission('employee', 'payroll:read')).toBe(false);
  });

  it('returns true for a permission the role has', () => {
    expect(hasPermission('employee', 'leave:read')).toBe(true);
    expect(hasPermission('employee', 'attendance:write')).toBe(true);
  });

  it('admin has every permission', () => {
    for (const perm of Object.values(PERMISSIONS)) {
      expect(hasPermission('admin', perm)).toBe(true);
    }
  });

  it('hr_manager can approve leave', () => {
    expect(hasPermission('hr_manager', 'leave:approve')).toBe(true);
  });

  it('finance_manager cannot approve leave', () => {
    expect(hasPermission('finance_manager', 'leave:approve')).toBe(false);
  });

  it('audit_manager has audit:read', () => {
    expect(hasPermission('audit_manager', 'audit:read')).toBe(true);
  });

  it('employee does not have audit:read', () => {
    expect(hasPermission('employee', 'audit:read')).toBe(false);
  });

  it('ceo can view reports but cannot write payroll', () => {
    expect(hasPermission('ceo', 'reports:executive')).toBe(true);
    expect(hasPermission('ceo', 'payroll:write')).toBe(false);
  });
});

describe('ROLE_PERMISSIONS completeness', () => {
  const EXPECTED_ROLES = ['admin', 'ceo', 'hr_manager', 'finance_manager', 'it_manager', 'employee', 'audit_manager'];

  it('defines all 7 expected roles', () => {
    for (const role of EXPECTED_ROLES) {
      expect(ROLE_PERMISSIONS).toHaveProperty(role);
    }
  });

  it('each role has at least one permission', () => {
    for (const [role, perms] of Object.entries(ROLE_PERMISSIONS)) {
      expect(perms.length, `${role} should have at least one permission`).toBeGreaterThan(0);
    }
  });

  it('no role contains unknown permission strings', () => {
    const valid = new Set(Object.values(PERMISSIONS));
    for (const [role, perms] of Object.entries(ROLE_PERMISSIONS)) {
      for (const perm of perms) {
        expect(valid.has(perm), `${role} has unknown permission "${perm}"`).toBe(true);
      }
    }
  });
});
