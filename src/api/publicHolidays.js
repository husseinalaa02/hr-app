import { supabase, SUPABASE_MODE } from '../db/supabase';
import { logAction } from './auditLog';

export async function getPublicHolidays(year) {
  if (!SUPABASE_MODE) return [];
  const { data, error } = await supabase
    .from('public_holidays')
    .select('id, name, date')
    .gte('date', `${year}-01-01`)
    .lte('date', `${year}-12-31`)
    .order('date');
  if (error) throw error;
  return data || [];
}

export async function getAllUpcomingHolidays() {
  if (!SUPABASE_MODE) return [];
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Baghdad' }).format(new Date());
  const { data, error } = await supabase
    .from('public_holidays')
    .select('id, name, date')
    .gte('date', today)
    .order('date')
    .limit(20);
  if (error) throw error;
  return data || [];
}

export async function createHoliday({ name, date }) {
  if (!name?.trim()) throw new Error('Holiday name required');
  if (!date) throw new Error('Holiday date required');
  const { data, error } = await supabase
    .from('public_holidays')
    .insert({ name: name.trim(), date })
    .select('id, name, date')
    .single();
  if (error) {
    if (error.code === '23505') throw new Error('DUPLICATE_DATE');
    throw error;
  }
  await logAction({
    action: 'CREATE',
    resource: 'PublicHoliday',
    resourceId: data.id,
    resourceLabel: `${name.trim()} (${date})`,
  });
  return data;
}

export async function updateHoliday(id, { name, date }) {
  const { error } = await supabase
    .from('public_holidays')
    .update({ name: name.trim(), date })
    .eq('id', id);
  if (error) {
    if (error.code === '23505') throw new Error('DUPLICATE_DATE');
    throw error;
  }
  await logAction({
    action: 'UPDATE',
    resource: 'PublicHoliday',
    resourceId: id,
    resourceLabel: `${name.trim()} (${date})`,
  });
}

export async function deleteHoliday(id, name) {
  const { error } = await supabase
    .from('public_holidays')
    .delete()
    .eq('id', id);
  if (error) throw error;
  await logAction({
    action: 'DELETE',
    resource: 'PublicHoliday',
    resourceId: id,
    resourceLabel: name,
  });
}
