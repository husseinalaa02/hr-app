import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { getExpenses, submitExpense, saveDraftExpense, approveExpense, rejectExpense, deleteExpense, EXPENSE_TYPE_LIST } from '../api/expenses';
import Modal from '../components/Modal';
import Badge from '../components/Badge';
import { Skeleton } from '../components/Skeleton';

const STATUS_COLOR = {
  Draft:     '#9e9e9e',
  Submitted: '#ef6c00',
  Approved:  '#2e7d32',
  Rejected:  '#c62828',
};

function fmt(n) { return Number(n).toLocaleString() + ' IQD'; }

export default function Expenses() {
  const { employee, isAdmin } = useAuth();
  const { addToast } = useToast();
  const [tab, setTab] = useState('mine');
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [statusFilter, setStatusFilter] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const opts = tab === 'mine' ? { employeeId: employee.name } : {};
    if (statusFilter) opts.status = statusFilter;
    const data = await getExpenses(opts);
    setExpenses(data);
    setLoading(false);
  }, [tab, employee?.name, statusFilter]);

  useEffect(() => { load(); }, [load]);

  const handleApprove = async (id) => {
    try {
      await approveExpense(id, employee.employee_name);
      addToast('Expense approved', 'success');
      load();
    } catch (e) { addToast(e.message, 'error'); }
  };

  const handleReject = async (id) => {
    try {
      await rejectExpense(id);
      addToast('Expense rejected', 'success');
      load();
    } catch (e) { addToast(e.message, 'error'); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this expense?')) return;
    await deleteExpense(id);
    load();
  };

  const rows = expenses;

  return (
    <div className="page-content">
      <div className="page-header">
        <div>
          <h1 className="page-title">Expenses</h1>
          <p className="page-subtitle">Submit and track expense reimbursements</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}>+ New Expense</button>
      </div>
      <div className="page-toolbar">
        <div className="tab-group">
          <button className={`tab-btn${tab === 'mine' ? ' active' : ''}`} onClick={() => setTab('mine')}>My Expenses</button>
          {isAdmin && <button className={`tab-btn${tab === 'all' ? ' active' : ''}`} onClick={() => setTab('all')}>All Expenses</button>}
        </div>
      </div>

      <div className="tab-group" style={{ marginBottom: 12, gap: 6 }}>
        {['', 'Draft', 'Submitted', 'Approved', 'Rejected'].map(s => (
          <button key={s || 'all'} className={`tab-btn${statusFilter === s ? ' active' : ''}`} style={{ fontSize: 12 }} onClick={() => setStatusFilter(s)}>
            {s || 'All'}
          </button>
        ))}
      </div>

      <div className="leave-card-list">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="leave-item-card"><Skeleton height={14} width="50%" /><Skeleton height={12} width="70%" style={{ marginTop: 8 }} /></div>
          ))
        ) : rows.length === 0 ? (
          <div className="card"><p className="text-center text-muted" style={{ padding: '32px 16px' }}>No expenses found</p></div>
        ) : rows.map(e => (
          <div key={e.id} className="leave-item-card">
            <div className="leave-item-top">
              <div className="leave-item-info">
                {tab === 'all' && <div className="leave-item-employee">{e.employee_name}</div>}
                <div className="leave-item-type">{e.expense_type}</div>
                <div className="leave-item-dates">{e.expense_date} · {e.description}</div>
                {e.approved_by && <div className="text-muted" style={{ fontSize: 12 }}>Approved by: {e.approved_by}</div>}
              </div>
              <div className="leave-item-right">
                <span className="duration-badge daily" style={{ background: '#f5f5f5', color: '#333' }}>{fmt(e.amount)}</span>
                <span className="appraisal-status-badge" style={{ background: STATUS_COLOR[e.status] || '#9e9e9e' }}>
                  {e.status}
                </span>
              </div>
            </div>
            <div className="leave-item-actions">
              {isAdmin && e.status === 'Submitted' && (
                <>
                  <button className="btn btn-sm btn-success" onClick={() => handleApprove(e.id)}>✓ Approve</button>
                  <button className="btn btn-sm btn-danger" onClick={() => handleReject(e.id)}>✕ Reject</button>
                </>
              )}
              {e.employee_id === employee.name && e.status === 'Draft' && (
                <button className="btn btn-sm btn-danger" onClick={() => handleDelete(e.id)}>Delete</button>
              )}
            </div>
          </div>
        ))}
      </div>

      {showModal && (
        <Modal title="New Expense" onClose={() => setShowModal(false)}>
          <ExpenseForm employee={employee} onClose={() => setShowModal(false)} onCreated={load} />
        </Modal>
      )}
    </div>
  );
}

function ExpenseForm({ employee, onClose, onCreated }) {
  const { addToast } = useToast();
  const [form, setForm] = useState({ expense_type: '', amount: '', expense_date: '', description: '' });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handle = async (e, isDraft) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = { employee_id: employee.name, employee_name: employee.employee_name, ...form };
      if (isDraft) await saveDraftExpense(payload);
      else         await submitExpense(payload);
      addToast(isDraft ? 'Draft saved' : 'Expense submitted', 'success');
      onCreated();
      onClose();
    } catch (err) { addToast(err.message || 'Failed', 'error'); }
    finally { setSaving(false); }
  };

  return (
    <form className="form-stack" onSubmit={e => handle(e, false)}>
      <div className="form-group">
        <label>Expense Type *</label>
        <select className="form-input" value={form.expense_type} onChange={e => set('expense_type', e.target.value)} required>
          <option value="">Select type</option>
          {EXPENSE_TYPE_LIST.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>
      <div className="form-row">
        <div className="form-group">
          <label>Amount (IQD) *</label>
          <input type="number" className="form-input" value={form.amount} onChange={e => set('amount', e.target.value)} required min="1" />
        </div>
        <div className="form-group">
          <label>Date *</label>
          <input type="date" className="form-input" value={form.expense_date} onChange={e => set('expense_date', e.target.value)} required />
        </div>
      </div>
      <div className="form-group">
        <label>Description</label>
        <textarea className="form-input" rows={2} value={form.description} onChange={e => set('description', e.target.value)} />
      </div>
      <div className="form-actions">
        <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button type="button" className="btn btn-secondary" onClick={e => handle(e, true)} disabled={saving}>Save Draft</button>
        <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? <span className="spinner-sm" /> : 'Submit'}</button>
      </div>
    </form>
  );
}
