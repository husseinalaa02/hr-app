import client from './client';
import { db } from '../db/index';
import { MOCK_EXPENSES } from './mock';
import { supabase, SUPABASE_MODE } from '../db/supabase';

const DEMO = import.meta.env.VITE_DEMO_MODE === 'true';

export const EXPENSE_TYPE_LIST = ['Travel', 'Equipment', 'Office Supplies', 'Training', 'Marketing', 'Meals', 'Other'];

export async function getExpenses({ employeeId = '', status = '' } = {}) {
  if (SUPABASE_MODE) {
    let query = supabase.from('expenses').select('*');
    if (employeeId) query = query.eq('employee_id', employeeId);
    if (status) query = query.eq('status', status);
    const { data, error } = await query.order('created_at', { ascending: false });
    if (error) return [];
    return data || [];
  }
  if (DEMO) {
    let rows = await db.expenses.toArray();
    if (rows.length === 0) rows = [...MOCK_EXPENSES];
    if (employeeId) rows = rows.filter(e => e.employee_id === employeeId);
    if (status) rows = rows.filter(e => e.status === status);
    return rows.sort((a, b) => b.created_at.localeCompare(a.created_at));
  }
  try {
    const res = await client.get('/api/resource/Expense Claim', {
      params: { fields: JSON.stringify(['name','employee','employee_name','expense_type','total_claimed_amount','posting_date','status']), limit: 200 },
    });
    return res.data.data;
  } catch {
    return db.expenses.toArray();
  }
}

export async function submitExpense({ employee_id, employee_name, expense_type, amount, expense_date, description }) {
  if (SUPABASE_MODE) {
    const record = { employee_id, employee_name, expense_type, amount: Number(amount), expense_date, description, status: 'Submitted' };
    const { data: inserted, error } = await supabase.from('expenses').insert(record).select().single();
    if (error) throw error;
    return inserted;
  }
  if (DEMO) {
    const record = {
      employee_id, employee_name, expense_type,
      amount: Number(amount),
      expense_date, description,
      status: 'Submitted',
      approved_by: null, approved_at: null,
      created_at: new Date().toISOString(),
    };
    const id = await db.expenses.add(record);
    return { ...record, id };
  }
  const res = await client.post('/api/resource/Expense Claim', { employee: employee_id, expense_type, total_claimed_amount: amount, posting_date: expense_date, remark: description });
  return res.data.data;
}

export async function saveDraftExpense({ employee_id, employee_name, expense_type, amount, expense_date, description }) {
  if (SUPABASE_MODE) {
    const record = { employee_id, employee_name, expense_type, amount: Number(amount), expense_date, description, status: 'Draft' };
    const { data: inserted, error } = await supabase.from('expenses').insert(record).select().single();
    if (error) throw error;
    return inserted;
  }
  if (DEMO) {
    const record = {
      employee_id, employee_name, expense_type,
      amount: Number(amount),
      expense_date, description,
      status: 'Draft',
      approved_by: null, approved_at: null,
      created_at: new Date().toISOString(),
    };
    const id = await db.expenses.add(record);
    return { ...record, id };
  }
  const res = await client.post('/api/resource/Expense Claim', { employee: employee_id, expense_type, total_claimed_amount: amount, posting_date: expense_date, remark: description, docstatus: 0 });
  return res.data.data;
}

export async function approveExpense(id, approverName) {
  if (SUPABASE_MODE) {
    const { data: updated, error } = await supabase.from('expenses').update({ status: 'Approved', approved_by: approverName, approved_at: new Date().toISOString() }).eq('id', id).select().single();
    if (error) throw error;
    return updated;
  }
  if (DEMO) {
    const rec = await db.expenses.get(Number(id));
    if (!rec) throw new Error('Expense not found');
    const updated = { ...rec, status: 'Approved', approved_by: approverName, approved_at: new Date().toISOString() };
    await db.expenses.put(updated);
    return updated;
  }
  const res = await client.put(`/api/resource/Expense Claim/${id}`, { status: 'Approved' });
  return res.data.data;
}

export async function rejectExpense(id) {
  if (SUPABASE_MODE) {
    const { data: updated, error } = await supabase.from('expenses').update({ status: 'Rejected' }).eq('id', id).select().single();
    if (error) throw error;
    return updated;
  }
  if (DEMO) {
    const rec = await db.expenses.get(Number(id));
    if (!rec) throw new Error('Expense not found');
    const updated = { ...rec, status: 'Rejected' };
    await db.expenses.put(updated);
    return updated;
  }
  const res = await client.put(`/api/resource/Expense Claim/${id}`, { status: 'Rejected' });
  return res.data.data;
}

export async function deleteExpense(id) {
  if (SUPABASE_MODE) {
    const { error } = await supabase.from('expenses').delete().eq('id', id);
    if (error) throw error;
    return;
  }
  if (DEMO) { await db.expenses.delete(Number(id)); return; }
  await client.delete(`/api/resource/Expense Claim/${id}`);
  await db.expenses.delete(Number(id));
}
