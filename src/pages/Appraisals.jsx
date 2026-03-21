import { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import {
  getAppraisals, getAppraisalTemplates, createAppraisal,
  submitSelfAssessment, submitManagerReview,
  saveSelfAssessmentDraft, saveManagerReviewDraft,
} from '../api/appraisals';
import { getEmployees } from '../api/employees';
import { SUPABASE_MODE } from '../db/supabase';
import Modal from '../components/Modal';
import { Skeleton } from '../components/Skeleton';
import Badge from '../components/Badge';

const STATUS_COLOR = {
  'Not Started': '#9e9e9e',
  'In Progress': '#ef6c00',
  'Self-Assessment Submitted': '#1565c0',
  'Manager Review': '#6a1b9a',
  'Completed': '#2e7d32',
};

function ScoreInput({ value, onChange }) {
  return (
    <div className="score-input">
      {[1, 2, 3, 4, 5].map(n => (
        <button
          key={n}
          type="button"
          className={`score-btn${value === n ? ' active' : ''}`}
          onClick={() => onChange(n)}
        >
          {n}
        </button>
      ))}
    </div>
  );
}

function AssessmentModal({ appraisal, role, onClose, onSave }) {
  const { t } = useTranslation();
  const template = appraisal;
  const isSelf = role === 'self';
  const existingScores = isSelf ? (appraisal.self_scores || {}) : (appraisal.manager_scores || {});
  const existingComment = isSelf ? (appraisal.self_comment || '') : (appraisal.manager_comment || '');

  const [scores, setScores] = useState(existingScores);
  // One comment entry per text question — keyed by question id
  const [comments, setComments] = useState({ _default: existingComment });
  const [saving, setSaving] = useState(false);
  const { addToast } = useToast();

  // We need the template to render questions
  const [templateData, setTemplateData] = useState(null);
  useEffect(() => {
    getAppraisalTemplates().then(templates => {
      const t = templates.find(t => t.id === appraisal.template_id);
      setTemplateData(t || null);
      // Seed comment map with existing answers keyed by question id
      if (t?.questions) {
        const textQs = t.questions.filter(q => q.type === 'text');
        if (textQs.length > 0) {
          setComments(Object.fromEntries(textQs.map(q => [q.id, existingComment])));
        }
      }
    });
  }, [appraisal.template_id]);

  const ratingQuestions = templateData?.questions?.filter(q => q.type === 'rating') || [];
  const textQuestions   = templateData?.questions?.filter(q => q.type === 'text')   || [];

  const allRated = ratingQuestions.every(q => scores[q.id] != null);

  const handleSubmit = async (isDraft) => {
    if (!isDraft && !allRated) { addToast('Please rate all criteria.', 'error'); return; }
    setSaving(true);
    try {
      // Merge multi-question comments into a single string for storage,
      // or pass the map if the API is updated to accept it.
      const commentValue = Object.values(comments).filter(Boolean).join('\n\n');
      if (isSelf) {
        if (isDraft) await saveSelfAssessmentDraft(appraisal.id, { scores, comment: commentValue });
        else         await submitSelfAssessment(appraisal.id, { scores, comment: commentValue });
      } else {
        if (isDraft) await saveManagerReviewDraft(appraisal.id, { scores, comment: commentValue });
        else         await submitManagerReview(appraisal.id, { scores, comment: commentValue });
      }
      addToast(isDraft ? 'Draft saved' : 'Submitted successfully', 'success');
      onSave();
      onClose();
    } catch (e) {
      addToast(e.message || 'Failed to save', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (!templateData) return <div className="loading-center"><span className="spinner" /></div>;

  return (
    <div className="form-stack">
      <div className="appraisal-meta">
        <div><strong>{t('appraisals.employee')}:</strong> {appraisal.employee_name}</div>
        <div><strong>{t('appraisals.period')}:</strong> {appraisal.period}</div>
        <div><strong>Template:</strong> {appraisal.template_name}</div>
      </div>

      <div className="assessment-section">
        <h4 className="section-label">Performance Ratings</h4>
        {ratingQuestions.map(q => (
          <div key={q.id} className="rating-row">
            <label className="rating-label">{q.text}</label>
            <ScoreInput value={scores[q.id]} onChange={v => setScores(s => ({ ...s, [q.id]: v }))} />
          </div>
        ))}
      </div>

      {textQuestions.length > 0 && (
        <div className="assessment-section">
          <h4 className="section-label">Comments</h4>
          {textQuestions.map(q => (
            <div key={q.id} className="form-group">
              <label>{q.text}</label>
              <textarea className="form-input" rows={3} value={comments[q.id] || ''}
                onChange={e => setComments(c => ({ ...c, [q.id]: e.target.value }))} />
            </div>
          ))}
        </div>
      )}

      {textQuestions.length === 0 && (
        <div className="form-group">
          <label>Additional Comments</label>
          <textarea className="form-input" rows={3} value={comments._default || ''}
            onChange={e => setComments(c => ({ ...c, _default: e.target.value }))} />
        </div>
      )}

      <div className="form-actions">
        <button type="button" className="btn btn-secondary" onClick={onClose}>{t('common.cancel')}</button>
        <button type="button" className="btn btn-secondary" onClick={() => handleSubmit(true)} disabled={saving}>
          Save Draft
        </button>
        <button type="button" className="btn btn-primary" onClick={() => handleSubmit(false)} disabled={saving || !allRated}>
          {saving ? <span className="spinner-sm" /> : 'Submit'}
        </button>
      </div>
    </div>
  );
}

function CreateAppraisalModal({ onClose, onCreated }) {
  const { t } = useTranslation();
  const { employee } = useAuth();
  const { addToast } = useToast();
  const [templates, setTemplates] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [form, setForm] = useState({ template_id: '', employee_id: '', period: 'Q1 2026' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([getAppraisalTemplates(), getEmployees()]).then(([t, e]) => {
      setTemplates(t);
      setEmployees(e);
    });
  }, []);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handle = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const emp = employees.find(e => e.name === form.employee_id);
      await createAppraisal({
        template_id: form.template_id,
        employee_id: form.employee_id,
        employee_name: emp?.employee_name || form.employee_id,
        appraiser_id: employee.name,
        appraiser_name: employee.employee_name,
        period: form.period,
      });
      addToast('Appraisal created', 'success');
      onCreated();
      onClose();
    } catch (err) {
      addToast(err.message || 'Failed', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="form-stack" onSubmit={handle}>
      <div className="form-group">
        <label>Template *</label>
        <select className="form-input" value={form.template_id} onChange={e => set('template_id', e.target.value)} required>
          <option value="">Select template</option>
          {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </div>
      <div className="form-group">
        <label>{t('appraisals.employee')} *</label>
        <select className="form-input" value={form.employee_id} onChange={e => set('employee_id', e.target.value)} required>
          <option value="">Select employee</option>
          {employees.map(e => <option key={e.name} value={e.name}>{e.employee_name} — {e.department}</option>)}
        </select>
      </div>
      <div className="form-group">
        <label>{t('appraisals.period')} *</label>
        <input className="form-input" value={form.period} onChange={e => set('period', e.target.value)} required />
      </div>
      <div className="form-actions">
        <button type="button" className="btn btn-secondary" onClick={onClose}>{t('common.cancel')}</button>
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? <span className="spinner-sm" /> : t('appraisals.newAppraisal')}
        </button>
      </div>
    </form>
  );
}

export default function Appraisals() {
  const { t } = useTranslation();
  const { employee, hasPermission } = useAuth();
  const canManage = hasPermission('appraisals:manage');

  const [tab, setTab] = useState(canManage ? 'all' : 'mine');
  const [appraisals, setAppraisals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [modalMode, setModalMode] = useState(null); // 'self' | 'manager' | 'view' | 'create'

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const opts = {};
      if (tab === 'mine') opts.employeeId = employee.name;
      if (tab === 'review') opts.appraiserId = employee.name;
      const data = await getAppraisals(opts);
      setAppraisals(data);
    } catch {
      setAppraisals([]);
    } finally {
      setLoading(false);
    }
  }, [tab, employee?.name]);

  useEffect(() => { load(); }, [load]);

  const openModal = (appraisal, mode) => { setSelected(appraisal); setModalMode(mode); };
  const closeModal = () => { setSelected(null); setModalMode(null); };

  return (
    <div className="page-content">
      <div className="page-header">
        <div>
          <h1 className="page-title">{t('appraisals.title')}</h1>
          <p className="page-subtitle">{t('appraisals.subtitle')}</p>
        </div>
        {canManage && (
          <button className="btn btn-primary" onClick={() => setModalMode('create')}>{t('appraisals.newAppraisal')}</button>
        )}
      </div>
      <div className="page-toolbar">
        <div className="tab-group">
          {canManage && <button className={`tab-btn${tab === 'all' ? ' active' : ''}`} onClick={() => setTab('all')}>All</button>}
          <button className={`tab-btn${tab === 'mine' ? ' active' : ''}`} onClick={() => setTab('mine')}>My Appraisals</button>
          <button className={`tab-btn${tab === 'review' ? ' active' : ''}`} onClick={() => setTab('review')}>To Review</button>
        </div>
      </div>

      <div className="leave-card-list">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="leave-item-card">
              <Skeleton height={14} width="50%" />
              <Skeleton height={12} width="70%" style={{ marginTop: 8 }} />
            </div>
          ))
        ) : appraisals.length === 0 ? (
          <div className="card">
            <p className="text-center text-muted" style={{ padding: '32px 16px' }}>{t('appraisals.noAppraisals')}</p>
          </div>
        ) : appraisals.map(a => {
          const canSelfAssess = a.employee_id === employee.name && ['Not Started', 'In Progress'].includes(a.status);
          const canReview     = a.appraiser_id === employee.name && a.status === 'Self-Assessment Submitted';
          const canManagerReview = (canManage || a.appraiser_id === employee.name) && a.status === 'Manager Review';
          return (
            <div key={a.id} className="leave-item-card">
              <div className="leave-item-top">
                <div className="leave-item-info">
                  <div className="leave-item-employee">{a.employee_name}</div>
                  <div className="leave-item-type">{a.template_name}</div>
                  <div className="leave-item-dates">{a.period} · Appraiser: {a.appraiser_name}</div>
                </div>
                <div className="leave-item-right">
                  {a.final_score != null && (
                    <span className="duration-badge daily">{a.final_score}/5</span>
                  )}
                  <span className="appraisal-status-badge" style={{ background: STATUS_COLOR[a.status] || '#9e9e9e' }}>
                    {a.status}
                  </span>
                </div>
              </div>
              <div className="leave-item-actions" style={{ gap: 8 }}>
                {canSelfAssess && (
                  <button className="btn btn-sm btn-primary" onClick={() => openModal(a, 'self')}>
                    ✏️ Self-Assess
                  </button>
                )}
                {(canReview || canManagerReview) && (
                  <button className="btn btn-sm btn-success" onClick={() => openModal(a, 'manager')}>
                    ⭐ Review
                  </button>
                )}
                <button className="btn btn-sm btn-secondary" onClick={() => openModal(a, 'view')}>
                  View
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {(modalMode === 'self' || modalMode === 'manager') && selected && (
        <Modal title={modalMode === 'self' ? 'Self-Assessment' : 'Manager Review'} onClose={closeModal}>
          <AssessmentModal appraisal={selected} role={modalMode} onClose={closeModal} onSave={load} />
        </Modal>
      )}

      {modalMode === 'view' && selected && (
        <Modal title="Appraisal Details" onClose={closeModal}>
          <div className="form-stack">
            <div className="appraisal-meta">
              <div><strong>{t('appraisals.employee')}:</strong> {selected.employee_name}</div>
              <div><strong>{t('appraisals.period')}:</strong> {selected.period}</div>
              <div><strong>{t('appraisals.status')}:</strong> <span style={{ color: STATUS_COLOR[selected.status] }}>{selected.status}</span></div>
              {selected.final_score != null && <div><strong>{t('appraisals.score')}:</strong> {selected.final_score}/5</div>}
            </div>
            {selected.self_scores && (
              <div className="assessment-section">
                <h4 className="section-label">Self-Assessment Scores</h4>
                {Object.entries(selected.self_scores).map(([k, v]) => (
                  <div key={k} className="score-row">Question {k}: <strong>{v}/5</strong></div>
                ))}
                {selected.self_comment && <div className="score-comment">"{selected.self_comment}"</div>}
              </div>
            )}
            {selected.manager_scores && (
              <div className="assessment-section">
                <h4 className="section-label">Manager Review Scores</h4>
                {Object.entries(selected.manager_scores).map(([k, v]) => (
                  <div key={k} className="score-row">Question {k}: <strong>{v}/5</strong></div>
                ))}
                {selected.manager_comment && <div className="score-comment">"{selected.manager_comment}"</div>}
              </div>
            )}
            <div className="form-actions">
              <button className="btn btn-secondary" onClick={closeModal}>{t('common.cancel')}</button>
            </div>
          </div>
        </Modal>
      )}

      {modalMode === 'create' && (
        <Modal title={t('appraisals.newAppraisal')} onClose={closeModal}>
          <CreateAppraisalModal onClose={closeModal} onCreated={load} />
        </Modal>
      )}
    </div>
  );
}
