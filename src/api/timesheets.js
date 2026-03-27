import { db } from '../db/index';
import { supabase, SUPABASE_MODE } from '../db/supabase';

export async function getTimesheets(employeeId) {
  if (SUPABASE_MODE) {
    const { data, error } = await supabase
      .from('timesheets')
      .select('name, employee, start_date, end_date, status, total_hours, project, time_logs, notes')
      .eq('employee', employeeId)
      .order('start_date', { ascending: false });
    if (error) return [];
    return data || [];
  }
  return db.timesheets.where('employee').equals(employeeId)
    .reverse().sortBy('start_date');
}

export async function submitTimesheet(data) {
  const total  = (data.time_logs || []).reduce((s, l) => s + (l.hours || 0), 0);
  const record = { ...data, name: `TS-${crypto.randomUUID()}`, status: 'Submitted', total_hours: total };
  if (SUPABASE_MODE) {
    const { data: inserted, error } = await supabase
      .from('timesheets').insert(record).select().single();
    if (error) throw error;
    return inserted;
  }
  await db.timesheets.put(record);
  return record;
}

export async function getProjects() {
  return db.projects.toArray();
}

// Task assignment is a planned feature — not yet implemented.
export async function getTasks() {
  return [];
}
