import { supabase, SUPABASE_MODE } from '../db/supabase';
import { logAction } from './auditLog';
import { addNotification } from './notifications';

export async function getMyDelegations(employeeId) {
  if (!SUPABASE_MODE) return [];
  const { data, error } = await supabase
    .from('approval_delegations')
    .select('id, delegator_id, delegate_id, start_date, end_date, reason, created_at')
    .or(`delegator_id.eq.${employeeId},delegate_id.eq.${employeeId}`)
    .order('start_date', { ascending: false });
  if (error) throw error;
  // Compute is_active client-side (CURRENT_DATE cannot be used in a stored generated column)
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Baghdad' });
  return (data || []).map(d => ({
    ...d,
    is_active: d.start_date <= today && d.end_date >= today,
  }));
}

export async function getActiveDelegateFor(managerId) {
  if (!SUPABASE_MODE) return null;
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Baghdad' });
  const { data, error } = await supabase
    .from('approval_delegations')
    .select('delegate_id')
    .eq('delegator_id', managerId)
    .lte('start_date', today)
    .gte('end_date', today)
    .maybeSingle();
  if (error) throw error;
  return data?.delegate_id || null;
}

export async function getActiveDelegationsForMe(employeeId) {
  if (!SUPABASE_MODE) return [];
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Baghdad' });
  const { data, error } = await supabase
    .from('approval_delegations')
    .select('delegator_id')
    .eq('delegate_id', employeeId)
    .lte('start_date', today)
    .gte('end_date', today);
  if (error) throw error;
  return (data || []).map(d => d.delegator_id);
}

export async function createDelegation({ delegatorId, delegateId, startDate, endDate, reason }) {
  if (!SUPABASE_MODE) return null;
  const { data, error } = await supabase
    .from('approval_delegations')
    .insert({
      delegator_id: delegatorId,
      delegate_id:  delegateId,
      start_date:   startDate,
      end_date:     endDate,
      reason:       reason || null,
    })
    .select('id')
    .single();
  if (error) throw error;
  await logAction({
    action:        'CREATE',
    resource:      'Delegation',
    resourceId:    data.id,
    resourceLabel: `Delegation to ${delegateId} (${startDate} - ${endDate})`,
  }).catch(() => {});
  // H5: notify the delegate they have been assigned approval authority
  addNotification({
    recipient_id: delegateId,
    title:        'Approval Delegation',
    message:      `You have been delegated approval authority by ${delegatorId} from ${startDate} to ${endDate}`,
    type:         'info',
  }).catch(() => {});
  return data;
}

export async function revokeDelegation(id) {
  if (!SUPABASE_MODE) return;
  // L2: use Baghdad timezone so "yesterday" is correct for Iraq-based users
  const yesterdayStr = new Date(Date.now() - 24 * 60 * 60 * 1000)
    .toLocaleDateString('en-CA', { timeZone: 'Asia/Baghdad' }); // YYYY-MM-DD
  const { error } = await supabase
    .from('approval_delegations')
    .update({ end_date: yesterdayStr })
    .eq('id', id);
  if (error) throw error;
  await logAction({
    action:        'DELETE',
    resource:      'Delegation',
    resourceId:    id,
    resourceLabel: 'Delegation revoked',
  }).catch(() => {});
}
