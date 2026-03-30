import { supabase, SUPABASE_MODE } from '../db/supabase';
import { logAction } from './auditLog';
import { addNotification } from './notifications';

export async function getLeaveEntitlements() {
  if (!SUPABASE_MODE) return [];
  const { data, error } = await supabase
    .from('leave_entitlements')
    .select('id, leave_type, employment_type, days_per_year, accrual_method, carry_over_max, min_tenure_months')
    .order('leave_type');
  if (error) throw error;
  return data || [];
}

export async function updateLeaveEntitlement(id, updates) {
  if (!SUPABASE_MODE) return;
  const { error } = await supabase
    .from('leave_entitlements')
    .update(updates)
    .eq('id', id);
  if (error) throw error;
  await logAction({
    action:        'UPDATE',
    resource:      'LeaveEntitlement',
    resourceId:    id,
    resourceLabel: 'Leave entitlement updated',
    details:       JSON.stringify(updates),
  }).catch(() => {});
}

export async function runMonthlyAccrual() {
  if (!SUPABASE_MODE) return { processed: 0, accruals: 0, errors: [] };

  const today     = new Date().toISOString().split('T')[0];
  const thisMonth = today.substring(0, 7);

  const { data: employees, error: empError } = await supabase
    .from('employees')
    .select('name, employment_type, date_of_joining')
    .eq('status', 'Active');
  if (empError) throw empError;

  const { data: entitlements } = await supabase
    .from('leave_entitlements')
    .select('*')
    .eq('accrual_method', 'monthly');

  const accruals = [];
  const errors   = [];

  for (const emp of (employees || [])) {
    const hireDate     = new Date(emp.date_of_joining || today);
    const tenureMonths = Math.floor((new Date() - hireDate) / (1000 * 60 * 60 * 24 * 30.44));

    for (const ent of (entitlements || [])) {
      if (ent.employment_type !== 'All' && ent.employment_type !== emp.employment_type) continue;
      if (tenureMonths < ent.min_tenure_months) continue;

      // M1/M2: idempotency — skip if this employee+leave_type already accrued this month
      const { data: existing } = await supabase
        .from('leave_accrual_log')
        .select('id')
        .eq('employee_id', emp.name)
        .eq('leave_type', ent.leave_type)
        .gte('accrual_date', `${thisMonth}-01`)
        .limit(1);
      if (existing?.length > 0) continue;

      const monthlyDays = Number((ent.days_per_year / 12).toFixed(2));

      const { data: alloc } = await supabase
        .from('leave_allocs')
        .select('total_days, used_days')
        .eq('employee', emp.name)
        .eq('leave_type', ent.leave_type)
        .eq('leave_year', new Date().getFullYear())
        .maybeSingle();

      const currentBalance = alloc ? (alloc.total_days - alloc.used_days) : 0;
      const newTotal       = (alloc?.total_days || 0) + monthlyDays;

      const { error: allocError } = await supabase
        .from('leave_allocs')
        .upsert({
          employee:        emp.name,
          leave_type:      ent.leave_type,
          leave_year:      new Date().getFullYear(),
          total_days:      newTotal,
          used_days:       alloc?.used_days || 0,
          remaining_days:  newTotal - (alloc?.used_days || 0),
        }, { onConflict: 'employee,leave_type,leave_year' });

      if (allocError) {
        errors.push({ employee: emp.name, error: allocError.message });
        continue;
      }

      accruals.push({
        employee_id:     emp.name,
        leave_type:      ent.leave_type,
        accrual_date:    today,
        days_accrued:    monthlyDays,
        balance_before:  currentBalance,
        balance_after:   currentBalance + monthlyDays,
        accrual_reason:  `Monthly accrual — ${thisMonth}`,
      });
    }
  }

  if (accruals.length > 0) {
    await supabase.from('leave_accrual_log').insert(accruals);
  }

  await logAction({
    action:        'CREATE',
    resource:      'LeaveAccrual',
    resourceLabel: `Monthly accrual run — ${thisMonth}`,
    details:       JSON.stringify({
      processed: (employees || []).length,
      accruals:  accruals.length,
      errors:    errors.length,
    }),
  }).catch(() => {});

  return { processed: (employees || []).length, accruals: accruals.length, errors };
}

export async function getAccrualLog(employeeId) {
  if (!SUPABASE_MODE) return [];
  const { data, error } = await supabase
    .from('leave_accrual_log')
    .select('id, leave_type, accrual_date, days_accrued, balance_before, balance_after, accrual_reason')
    .eq('employee_id', employeeId)
    .order('accrual_date', { ascending: false })
    .limit(24);
  if (error) throw error;
  return data || [];
}

export async function runYearEndCarryOver(year) {
  if (!SUPABASE_MODE) return;
  const entitlements = await getLeaveEntitlements();
  const { data: employees } = await supabase
    .from('employees')
    .select('name')
    .eq('status', 'Active');

  for (const emp of (employees || [])) {
    for (const ent of entitlements) {
      const { data: alloc } = await supabase
        .from('leave_allocs')
        .select('total_days, used_days')
        .eq('employee', emp.name)
        .eq('leave_type', ent.leave_type)
        .eq('leave_year', year)
        .maybeSingle();

      if (!alloc) continue;

      const unused    = alloc.total_days - alloc.used_days;
      const carryOver = ent.carry_over_max === null
        ? unused
        : Math.min(unused, ent.carry_over_max);

      if (carryOver > 0) {
        // M1: idempotent — only add carry-over if next year alloc doesn't already include it
        const { data: nextYearAlloc } = await supabase
          .from('leave_allocs')
          .select('total_days')
          .eq('employee', emp.name)
          .eq('leave_type', ent.leave_type)
          .eq('leave_year', year + 1)
          .maybeSingle();
        // If next year alloc already has total_days >= carryOver, skip (already processed)
        if (nextYearAlloc && nextYearAlloc.total_days >= carryOver) continue;
        await supabase.from('leave_allocs').upsert({
          employee:        emp.name,
          leave_type:      ent.leave_type,
          leave_year:      year + 1,
          total_days:      carryOver,
          used_days:       0,
          remaining_days:  carryOver,
        }, { onConflict: 'employee,leave_type,leave_year' });
      }
    }
  }

  await logAction({
    action:        'CREATE',
    resource:      'LeaveAccrual',
    resourceLabel: `Year-end carry-over run — ${year}`,
  }).catch(() => {});
}
