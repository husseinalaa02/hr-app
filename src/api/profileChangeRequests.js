import { supabase, SUPABASE_MODE } from '../db/supabase';
import { logAction } from './auditLog';
import { addNotification, notifyRole } from './notifications';

// Fields employees can request to change (requires HR approval)
export const SELF_SERVICE_FIELDS = [
  'cell_number', 'personal_email', 'date_of_birth', 'bank_account',
  'emergency_contact_name', 'emergency_contact_phone',
  'address', 'marital_status',
];

// Fields that take effect immediately without approval
export const IMMEDIATE_FIELDS = ['image'];

export async function submitProfileChangeRequest(employeeId, fieldName, oldValue, newValue) {
  if (!SUPABASE_MODE) return null;
  if (!SELF_SERVICE_FIELDS.includes(fieldName)) {
    throw new Error('Field not editable by employee');
  }
  // H6: prevent duplicate pending requests for the same employee+field
  const { data: existing } = await supabase
    .from('profile_change_requests')
    .select('id')
    .eq('employee_id', employeeId)
    .eq('field_name', fieldName)
    .eq('status', 'Pending')
    .maybeSingle();
  if (existing) {
    throw new Error('DUPLICATE_PENDING_REQUEST');
  }
  const { data, error } = await supabase
    .from('profile_change_requests')
    .insert({
      employee_id:  employeeId,
      requested_by: employeeId,
      field_name:   fieldName,
      old_value:    String(oldValue || ''),
      new_value:    String(newValue),
    })
    .select('id')
    .single();
  if (error) throw error;
  await logAction({
    action:        'CREATE',
    resource:      'ProfileChangeRequest',
    resourceId:    data.id,
    resourceLabel: `${fieldName} change requested`,
  }).catch(() => {});
  // H5: notify HR that a profile change request needs review
  notifyRole(['admin', 'hr_manager'], {
    title:   'Profile Change Request',
    message: `Employee ${employeeId} requested a change to ${fieldName}`,
    type:    'info',
  }).catch(() => {});
  return data;
}

export async function getPendingProfileRequests() {
  if (!SUPABASE_MODE) return [];
  const { data, error } = await supabase
    .from('profile_change_requests')
    .select('id, employee_id, field_name, old_value, new_value, status, created_at, requested_by')
    .eq('status', 'Pending')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function getMyProfileRequests(employeeId) {
  if (!SUPABASE_MODE) return [];
  const { data, error } = await supabase
    .from('profile_change_requests')
    .select('id, field_name, old_value, new_value, status, created_at, reviewed_at, review_note')
    .eq('employee_id', employeeId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function getMyPendingFields(employeeId) {
  if (!SUPABASE_MODE) return new Set();
  const { data } = await supabase
    .from('profile_change_requests')
    .select('field_name')
    .eq('employee_id', employeeId)
    .eq('status', 'Pending');
  return new Set((data || []).map(r => r.field_name));
}

export async function reviewProfileChangeRequest(requestId, status, reviewNote, reviewerId) {
  if (!SUPABASE_MODE) return;

  // Fetch the request for both applying changes (Approved) and sending notifications
  const { data: req } = await supabase
    .from('profile_change_requests')
    .select('employee_id, field_name, new_value')
    .eq('id', requestId)
    .maybeSingle();

  if (status === 'Approved' && req) {
    const { error: updateError } = await supabase
      .from('employees')
      .update({ [req.field_name]: req.new_value })
      .eq('name', req.employee_id);
    if (updateError) throw updateError;
  }

  const { error } = await supabase
    .from('profile_change_requests')
    .update({
      status,
      reviewed_by:  reviewerId,
      reviewed_at:  new Date().toISOString(),
      review_note:  reviewNote || null,
    })
    .eq('id', requestId);
  if (error) throw error;

  await logAction({
    action:        status === 'Approved' ? 'APPROVE' : 'REJECT',
    resource:      'ProfileChangeRequest',
    resourceId:    requestId,
    resourceLabel: `Profile change ${status.toLowerCase()}`,
  }).catch(() => {});
  // H5: notify the employee of the review outcome
  if (req) {
    addNotification({
      recipient_id: req.employee_id,
      title:        `Profile Change ${status}`,
      message:      `Your request to change ${req.field_name} was ${status.toLowerCase()}`,
      type:         status === 'Approved' ? 'success' : 'error',
    }).catch(() => {});
  }
}
