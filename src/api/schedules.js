import { supabase, SUPABASE_MODE } from '../db/supabase';
import { db } from '../db/index';

const DEMO = import.meta.env.VITE_DEMO_MODE === 'true';

export const SHIFT_PRESETS = {
  morning: { label: 'Morning Shift', start: '08:00', end: '16:30' },
  evening: { label: 'Evening Shift', start: '16:30', end: '00:30' },
  custom:  { label: 'Custom Shift',  start: null,    end: null    },
};

// Returns the current (latest) schedule for each employee in the given list
export async function getSchedules(employeeIds = []) {
  if (SUPABASE_MODE) {
    let q = supabase.from('work_schedules').select('*').order('effective_date', { ascending: false });
    if (employeeIds.length) q = q.in('employee', employeeIds);
    const { data, error } = await q;
    if (error) throw error;
    // Keep only the latest record per employee
    const map = {};
    for (const row of (data || [])) {
      if (!map[row.employee]) map[row.employee] = row;
    }
    return Object.values(map);
  }
  if (DEMO) {
    const all = await db.table('work_schedules').toArray().catch(() => []);
    const map = {};
    for (const row of all.sort((a, b) => b.effective_date?.localeCompare(a.effective_date))) {
      if (!map[row.employee]) map[row.employee] = row;
    }
    return Object.values(map);
  }
  return [];
}

export async function getMySchedule(employeeId) {
  if (SUPABASE_MODE) {
    const { data } = await supabase.from('work_schedules').select('*')
      .eq('employee', employeeId).order('effective_date', { ascending: false }).limit(1).maybeSingle();
    return data || null;
  }
  if (DEMO) {
    const all = await db.table('work_schedules').toArray().catch(() => []);
    return all.filter(r => r.employee === employeeId)
      .sort((a, b) => b.effective_date?.localeCompare(a.effective_date))[0] || null;
  }
  return null;
}

export async function getScheduleHistory(employeeId) {
  if (SUPABASE_MODE) {
    const { data, error } = await supabase.from('work_schedules').select('*')
      .eq('employee', employeeId).order('effective_date', { ascending: false });
    if (error) throw error;
    return data || [];
  }
  if (DEMO) {
    const all = await db.table('work_schedules').toArray().catch(() => []);
    return all.filter(r => r.employee === employeeId)
      .sort((a, b) => b.effective_date?.localeCompare(a.effective_date));
  }
  return [];
}

export async function assignSchedule({ employee, employee_name, shift_type, start_time, end_time, effective_date, assigned_by, assigned_by_name, notes }) {
  const record = { employee, employee_name, shift_type, start_time, end_time, effective_date, assigned_by, assigned_by_name, notes };
  if (SUPABASE_MODE) {
    // Remove all previous schedules for this employee so only the new one exists.
    await supabase.from('work_schedules').delete().eq('employee', employee);
    const { data, error } = await supabase.from('work_schedules').insert(record).select().single();
    if (error) throw error;
    return data;
  }
  if (DEMO) {
    // Remove existing schedules for this employee in demo mode
    const all = await db.table('work_schedules').toArray().catch(() => []);
    const old = all.filter(r => r.employee === employee);
    await Promise.all(old.map(r => db.table('work_schedules').delete(r.id)));
    const r = { ...record, id: Date.now(), created_at: new Date().toISOString() };
    await db.table('work_schedules').put(r);
    return r;
  }
  throw new Error('No backend available');
}
