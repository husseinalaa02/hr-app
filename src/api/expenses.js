import { db } from '../db/index';
import { MOCK_EXPENSES } from './mock';
import { supabase, SUPABASE_MODE } from '../db/supabase';
import { addNotification } from './notifications';

const DEMO = import.meta.env.VITE_DEMO_MODE === 'true';

export const EXPENSE_TYPE_LIST = ['Travel', 'Equipment', 'Office Supplies', 'Training', 'Marketing', 'Meals', 'Other'];

const MAX_EXPENSE_IQD = 10_000_000; // 10 million IQD sanity cap

function validateAmount(amount) {
  const n = Number(amount);
  if (!amount || isNaN(n) || n <= 0)      throw new Error('Amount must be greater than 0');
  if (n > MAX_EXPENSE_IQD)                throw new Error('Amount exceeds maximum allowed value (10,000,000 IQD)');
}

export async function getExpenses({ employeeId = '', status = '' } = {}) {
  if (SUPABASE_MODE) {
    let query = supabase.from('expenses').select('id, employee_id, employee_name, expense_type, amount, expense_date, description, status, approved_by, approved_at, created_at');
    if (employeeId) query = query.eq('employee_id', employeeId);
    if (status) query = query.eq('status', status);
    const { data, error } = await query.order('created_at', { ascending: false }).limit(500);
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
  return [];
}

export async function submitExpense({ employee_id, employee_name, expense_type, amount, expense_date, description }) {
  validateAmount(amount);
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
  throw new Error('No backend available');
}

export async function saveDraftExpense({ employee_id, employee_name, expense_type, amount, expense_date, description }) {
  validateAmount(amount);
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
  throw new Error('No backend available');
}

export async function approveExpense(id, approverName) {
  if (SUPABASE_MODE) {
    const { data: existing } = await supabase.from('expenses').select('status').eq('id', id).single();
    if (!existing) throw new Error('Expense not found');
    if (existing.status !== 'Submitted') throw new Error('Only submitted expenses can be approved');
    const { data: updated, error } = await supabase.from('expenses').update({ status: 'Approved', approved_by: approverName, approved_at: new Date().toISOString() }).eq('id', id).select().single();
    if (error) throw error;
    if (updated?.employee_id) {
      addNotification({
        recipient_id: updated.employee_id,
        title: 'Expense Approved',
        message: `Your ${updated.expense_type} expense of ${Number(updated.amount).toLocaleString()} IQD has been approved.`,
        type: 'expense',
      }).catch(() => {});
    }
    return updated;
  }
  if (DEMO) {
    const rec = await db.expenses.get(Number(id));
    if (!rec) throw new Error('Expense not found');
    const updated = { ...rec, status: 'Approved', approved_by: approverName, approved_at: new Date().toISOString() };
    await db.expenses.put(updated);
    return updated;
  }
  throw new Error('No backend available');
}

export async function rejectExpense(id) {
  if (SUPABASE_MODE) {
    const { data: existing } = await supabase.from('expenses').select('status').eq('id', id).single();
    if (!existing) throw new Error('Expense not found');
    if (existing.status !== 'Submitted') throw new Error('Only submitted expenses can be rejected');
    const { data: updated, error } = await supabase.from('expenses').update({ status: 'Rejected' }).eq('id', id).select().single();
    if (error) throw error;
    if (updated?.employee_id) {
      addNotification({
        recipient_id: updated.employee_id,
        title: 'Expense Rejected',
        message: `Your ${updated.expense_type} expense of ${Number(updated.amount).toLocaleString()} IQD has been rejected.`,
        type: 'expense',
      }).catch(() => {});
    }
    return updated;
  }
  if (DEMO) {
    const rec = await db.expenses.get(Number(id));
    if (!rec) throw new Error('Expense not found');
    if (rec.status !== 'Submitted') throw new Error('Only submitted expenses can be rejected');
    const updated = { ...rec, status: 'Rejected' };
    await db.expenses.put(updated);
    return updated;
  }
  throw new Error('No backend available');
}

export async function deleteExpense(id) {
  if (SUPABASE_MODE) {
    const { error } = await supabase.from('expenses').delete().eq('id', id);
    if (error) throw error;
    return;
  }
  if (DEMO) { await db.expenses.delete(Number(id)); return; }
}
