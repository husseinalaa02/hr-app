import { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import {
  getAppraisals, getAppraisalTemplates, createAppraisal,
  submitSelfAssessment, submitManagerReview,
  saveSelfAssessmentDraft, saveManagerReviewDraft,
  createTemplate, updateTemplate, deleteTemplate,
} from '../api/appraisals';
import { getEmployees } from '../api/employees';
import { SUPABASE_MODE } from '../db/supabase';
import Modal from '../components/Modal';
import { Skeleton } from '../components/Skeleton';
import Badge from '../components/Badge';
import ErrorState from '../components/ErrorState';

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
      const tmpl = templates.find(tmpl => tmpl.id === appraisal.template_id);
      setTemplateData(tmpl || null);
      // existingComment is stored as a single string — keep it in _default only.
      // Do NOT spread it across per-question keys; that would duplicate the same
      // text into every textarea and concatenate them again on save.
    });
  }, [appraisal.template_id]);

  const ratingQuestions = templateData?.questions?.filter(q => q.type === 'rating') || [];
  const textQuestions   = templateData?.questions?.filter(q => q.type === 'text')   || [];

  const allRated = ratingQuestions.every(q => scores[q.id] != null);

  const handleSubmit = async (isDraft) => {
    if (!isDraft && !allRated) { addToast(t('appraisals.pleaseRateAll'), 'error'); return; }
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
      addToast(isDraft ? t('appraisals.draftSaved') : t('appraisals.submitSuccess'), 'success');
      onSave();
      onClose();
    } catch (e) {
      addToast(e.message || t('appraisals.failedSave'), 'error');
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
        <div><strong>{t('appraisals.template')}:</strong> {appraisal.template_name}</div>
      </div>

      <div className="assessment-section">
        <h4 className="section-label">{t('appraisals.performanceRatings')}</h4>
        {ratingQuestions.map(q => (
          <div key={q.id} className="rating-row">
            <label className="rating-label">{q.text}</label>
            <ScoreInput value={scores[q.id]} onChange={v => setScores(s => ({ ...s, [q.id]: v }))} />
          </div>
        ))}
      </div>

      {textQuestions.length > 0 && (
        <div className="assessment-section">
          <h4 className="section-label">{t('appraisals.comments')}</h4>
          {textQuestions.map(q => (
            <div key={q.id} className="form-group">
              <label>{q.text}</label>
              <p className="text-muted" style={{ fontSize: 12, marginBottom: 4 }}>{t('appraisals.sharedCommentHint')}</p>
            </div>
          ))}
          {/* Single textarea — comments are stored as one string; per-question split is not supported */}
          <div className="form-group">
            <textarea className="form-input" rows={4} value={comments._default || ''}
              onChange={e => setComments(c => ({ ...c, _default: e.target.value }))} />
          </div>
        </div>
      )}

      {textQuestions.length === 0 && (
        <div className="form-group">
          <label>{t('appraisals.additionalComments')}</label>
          <textarea className="form-input" rows={3} value={comments._default || ''}
            onChange={e => setComments(c => ({ ...c, _default: e.target.value }))} />
        </div>
      )}

      <div className="form-actions">
        <button type="button" className="btn btn-secondary" onClick={onClose}>{t('common.cancel')}</button>
        <button type="button" className="btn btn-secondary" onClick={() => handleSubmit(true)} disabled={saving}>
          {t('appraisals.saveDraft')}
        </button>
        <button type="button" className="btn btn-primary" onClick={() => handleSubmit(false)} disabled={saving || !allRated}>
          {saving ? <span className="spinner-sm" /> : t('appraisals.submit')}
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
  const [form, setForm] = useState(() => {
    const now = new Date();
    const quarter = Math.ceil((now.getMonth() + 1) / 3);
    return { template_id: '', employee_id: '', period: `Q${quarter} ${now.getFullYear()}` };
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([getAppraisalTemplates(), getEmployees()]).then(([tmpls, emps]) => {
      setTemplates(tmpls);
      setEmployees(emps);
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
      addToast(t('appraisals.created'), 'success');
      onCreated();
      onClose();
    } catch (err) {
      addToast(err.message || t('errors.failed'), 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="form-stack" onSubmit={handle}>
      <div className="form-group">
        <label>{t('appraisals.templateLabel')} *</label>
        <select className="form-input" value={form.template_id} onChange={e => set('template_id', e.target.value)} required>
          <option value="">{t('appraisals.selectTemplate')}</option>
          {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </div>
      <div className="form-group">
        <label>{t('appraisals.employee')} *</label>
        <select className="form-input" value={form.employee_id} onChange={e => set('employee_id', e.target.value)} required>
          <option value="">{t('appraisals.selectEmployee')}</option>
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

// ─── Template Editor Modal ────────────────────────────────────────────────────
function TemplateEditorModal({ template, onClose, onSaved }) {
  const { t } = useTranslation();
  const { addToast } = useToast();
  const isEdit = !!template;

  const makeQ = () => ({ id: crypto.randomUUID(), type: 'rating', text: '' });

  const [name, setName] = useState(template?.name || '');
  const [questions, setQuestions] = useState(
    template?.questions?.length ? template.questions : [makeQ()]
  );
  const [saving, setSaving] = useState(false);

  const setQ = (id, field, value) =>
    setQuestions(qs => qs.map(q => q.id === id ? { ...q, [field]: value } : q));
  const addQ   = () => setQuestions(qs => [...qs, makeQ()]);
  const removeQ = (id) => setQuestions(qs => qs.filter(q => q.id !== id));

  const handle = async (e) => {
    e.preventDefault();
    if (!questions.some(q => q.text.trim())) {
      addToast(t('appraisals.atLeastOneQuestion'), 'error'); return;
    }
    const clean = questions.filter(q => q.text.trim());
    setSaving(true);
    try {
      if (isEdit) await updateTemplate(template.id, { name, questions: clean });
      else        await createTemplate({ name, questions: clean });
      addToast(t('appraisals.templateSaved'), 'success');
      onSaved();
      onClose();
    } catch (err) { addToast(err.message, 'error'); }
    finally { setSaving(false); }
  };

  return (
    <form className="form-stack" onSubmit={handle}>
      <div className="form-group">
        <label>{t('appraisals.templateName')} *</label>
        <input className="form-input" value={name} onChange={e => setName(e.target.value)} required />
      </div>

      <div className="form-group">
        <label>{t('appraisals.questions')}</label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {questions.map((q, i) => (
            <div key={q.id} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ minWidth: 20, color: '#888', fontSize: 13 }}>{i + 1}.</span>
              <input
                className="form-input"
                style={{ flex: 1 }}
                placeholder={t('appraisals.questionText')}
                value={q.text}
                onChange={e => setQ(q.id, 'text', e.target.value)}
              />
              <select
                className="form-input"
                style={{ width: 140 }}
                value={q.type}
                onChange={e => setQ(q.id, 'type', e.target.value)}
              >
                <option value="rating">{t('appraisals.ratingType')}</option>
                <option value="text">{t('appraisals.textType')}</option>
              </select>
              {questions.length > 1 && (
                <button type="button" className="btn btn-sm btn-danger" onClick={() => removeQ(q.id)}>✕</button>
              )}
            </div>
          ))}
        </div>
        <button type="button" className="btn btn-secondary" style={{ marginTop: 10 }} onClick={addQ}>
          {t('appraisals.addQuestion')}
        </button>
      </div>

      <div className="form-actions">
        <button type="button" className="btn btn-secondary" onClick={onClose}>{t('common.cancel')}</button>
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? <span className="spinner-sm" /> : t('common.save')}
        </button>
      </div>
    </form>
  );
}

// ─── Template Manager (tab content) ──────────────────────────────────────────
function TemplateManager() {
  const { t } = useTranslation();
  const { addToast } = useToast();
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [editing, setEditing]   = useState(null);   // template obj or null
  const [creating, setCreating] = useState(false);

  const load = async () => {
    setLoading(true);
    setLoadError(null);
    try { setTemplates(await getAppraisalTemplates()); }
    catch (err) {
      setLoadError(true);
      addToast(err.message || t('appraisals.failedLoadTemplates', { defaultValue: 'Failed to load templates' }), 'error');
      setTemplates([]);
    }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const handleDelete = async (tmpl) => {
    if (!window.confirm(t('appraisals.deleteTemplateConfirm'))) return;
    try {
      await deleteTemplate(tmpl.id);
      addToast(t('appraisals.templateDeleted'), 'success');
      load();
    } catch (err) { addToast(err.message, 'error'); }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        <button className="btn btn-primary" onClick={() => setCreating(true)}>
          {t('appraisals.newTemplate')}
        </button>
      </div>

      {loadError && <ErrorState message={t('appraisals.failedLoadTemplates', { defaultValue: 'Failed to load templates' })} onRetry={load} />}
      <div className="leave-card-list">
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="leave-item-card">
              <Skeleton height={14} width="40%" />
              <Skeleton height={12} width="60%" style={{ marginTop: 8 }} />
            </div>
          ))
        ) : templates.length === 0 ? (
          <div className="card">
            <p className="text-center text-muted" style={{ padding: '32px 16px' }}>
              {t('appraisals.noTemplates')}
            </p>
          </div>
        ) : templates.map(tmpl => (
          <div key={tmpl.id} className="leave-item-card">
            <div className="leave-item-top">
              <div className="leave-item-info">
                <div className="leave-item-type">{tmpl.name}</div>
                <div className="leave-item-dates">
                  {(tmpl.questions || []).length} {t('appraisals.questions').toLowerCase()}
                  {' · '}
                  {(tmpl.questions || []).filter(q => q.type === 'rating').length} {t('appraisals.ratingType').toLowerCase()}
                  {', '}
                  {(tmpl.questions || []).filter(q => q.type === 'text').length} {t('appraisals.textType').toLowerCase()}
                </div>
              </div>
              <div className="leave-item-right" style={{ gap: 8, display: 'flex' }}>
                <button className="btn btn-sm btn-secondary" onClick={() => setEditing(tmpl)}>
                  {t('common.edit')}
                </button>
                <button className="btn btn-sm btn-danger" onClick={() => handleDelete(tmpl)}>
                  {t('common.delete')}
                </button>
              </div>
            </div>
            <div style={{ padding: '8px 0 4px', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {(tmpl.questions || []).map((q, i) => (
                <span key={q.id} style={{
                  fontSize: 11, padding: '3px 10px', borderRadius: 20,
                  background: q.type === 'rating' ? '#e3f2fd' : '#f3e5f5',
                  color: q.type === 'rating' ? '#1565c0' : '#6a1b9a',
                }}>
                  {i + 1}. {q.text}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>

      {creating && (
        <Modal title={t('appraisals.newTemplate')} onClose={() => setCreating(false)}>
          <TemplateEditorModal onClose={() => setCreating(false)} onSaved={load} />
        </Modal>
      )}
      {editing && (
        <Modal title={t('appraisals.editTemplate')} onClose={() => setEditing(null)}>
          <TemplateEditorModal template={editing} onClose={() => setEditing(null)} onSaved={load} />
        </Modal>
      )}
    </div>
  );
}

export default function Appraisals() {
  const { t } = useTranslation();
  const { employee, hasPermission } = useAuth();
  const canManage = hasPermission('appraisals:manage');

  const [tab, setTab] = useState(canManage ? 'all' : 'mine');
  const [appraisals, setAppraisals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [selected, setSelected] = useState(null);
  const [modalMode, setModalMode] = useState(null); // 'self' | 'manager' | 'view' | 'create'
  const [viewTemplate, setViewTemplate] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const opts = {};
      if (tab === 'mine') opts.employeeId = employee.name;
      if (tab === 'review') opts.appraiserId = employee.name;
      const data = await getAppraisals(opts);
      setAppraisals(data);
    } catch (e) {
      setLoadError(e.message || t('errors.failedLoad'));
      setAppraisals([]);
    } finally {
      setLoading(false);
    }
  }, [tab, employee?.name, t]);

  useEffect(() => { load(); }, [load]);

  const openModal = (appraisal, mode) => {
    setSelected(appraisal);
    setModalMode(mode);
    if (mode === 'view') {
      setViewTemplate(null);
      getAppraisalTemplates()
        .then(templates => setViewTemplate(templates.find(tmpl => tmpl.id === appraisal.template_id) || null))
        .catch(() => setViewTemplate(null));
    }
  };
  const closeModal = () => { setSelected(null); setModalMode(null); setViewTemplate(null); };

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
          {canManage && <button className={`tab-btn${tab === 'all' ? ' active' : ''}`} onClick={() => setTab('all')}>{t('appraisals.all')}</button>}
          <button className={`tab-btn${tab === 'mine' ? ' active' : ''}`} onClick={() => setTab('mine')}>{t('appraisals.myAppraisals')}</button>
          <button className={`tab-btn${tab === 'review' ? ' active' : ''}`} onClick={() => setTab('review')}>{t('appraisals.toReview')}</button>
          {canManage && <button className={`tab-btn${tab === 'templates' ? ' active' : ''}`} onClick={() => setTab('templates')}>{t('appraisals.templates')}</button>}
        </div>
      </div>

      {tab === 'templates' && <TemplateManager />}

      {tab !== 'templates' && loadError && <ErrorState message={loadError} onRetry={load} />}

      {tab !== 'templates' && <div className="leave-card-list">
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
                  <div className="leave-item-dates">{a.period} · {t('appraisals.appraiser')}: {a.appraiser_name}</div>
                </div>
                <div className="leave-item-right">
                  {a.final_score != null && (
                    <span className="duration-badge daily">{a.final_score}/5</span>
                  )}
                  <span className="appraisal-status-badge" style={{ background: STATUS_COLOR[a.status] || '#9e9e9e' }}>
                    {t(`status.${a.status}`, { defaultValue: a.status })}
                  </span>
                </div>
              </div>
              <div className="leave-item-actions" style={{ gap: 8 }}>
                {canSelfAssess && (
                  <button className="btn btn-sm btn-primary" onClick={() => openModal(a, 'self')}>
                    ✏️ {t('appraisals.selfAssess')}
                  </button>
                )}
                {(canReview || canManagerReview) && (
                  <button className="btn btn-sm btn-success" onClick={() => openModal(a, 'manager')}>
                    ⭐ {t('appraisals.review')}
                  </button>
                )}
                <button className="btn btn-sm btn-secondary" onClick={() => openModal(a, 'view')}>
                  {t('appraisals.view')}
                </button>
              </div>
            </div>
          );
        })}
      </div>}

      {(modalMode === 'self' || modalMode === 'manager') && selected && (
        <Modal title={modalMode === 'self' ? t('appraisals.selfAssessment') : t('appraisals.managerReview')} onClose={closeModal}>
          <AssessmentModal appraisal={selected} role={modalMode} onClose={closeModal} onSave={load} />
        </Modal>
      )}

      {modalMode === 'view' && selected && (
        <Modal title={t('appraisals.appraisalDetails')} onClose={closeModal}>
          <div className="form-stack">
            <div className="appraisal-meta">
              <div><strong>{t('appraisals.employee')}:</strong> {selected.employee_name}</div>
              <div><strong>{t('appraisals.period')}:</strong> {selected.period}</div>
              <div><strong>{t('appraisals.status')}:</strong> <span style={{ color: STATUS_COLOR[selected.status] }}>{t(`status.${selected.status}`, { defaultValue: selected.status })}</span></div>
              {selected.final_score != null && <div><strong>{t('appraisals.finalScore')}:</strong> {selected.final_score}/5</div>}
            </div>
            {selected.self_scores && (
              <div className="assessment-section">
                <h4 className="section-label">{t('appraisals.selfScores')}</h4>
                {Object.entries(selected.self_scores).map(([k, v]) => {
                  const qText = viewTemplate?.questions?.find(q => q.id === k)?.text || t('appraisals.question', { defaultValue: 'Question' }) + ' ' + k;
                  return <div key={k} className="score-row">{qText}: <strong>{v}/5</strong></div>;
                })}
                {selected.self_comment && <div className="score-comment">"{selected.self_comment}"</div>}
              </div>
            )}
            {selected.manager_scores && (
              <div className="assessment-section">
                <h4 className="section-label">{t('appraisals.managerScores')}</h4>
                {Object.entries(selected.manager_scores).map(([k, v]) => {
                  const qText = viewTemplate?.questions?.find(q => q.id === k)?.text || t('appraisals.question', { defaultValue: 'Question' }) + ' ' + k;
                  return <div key={k} className="score-row">{qText}: <strong>{v}/5</strong></div>;
                })}
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
