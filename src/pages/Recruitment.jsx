import { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { getJobs, createJob, updateJob, getCandidates, addCandidate, moveStage, deleteCandidate, deleteJob, STAGES } from '../api/recruitment';
import Modal from '../components/Modal';
import { Skeleton } from '../components/Skeleton';
import ErrorState from '../components/ErrorState';

const STAGE_COLORS = {
  Application: '#607d8b',
  Screening:   '#ef6c00',
  Interview:   '#1565c0',
  Offer:       '#6a1b9a',
  Hired:       '#2e7d32',
  Rejected:    '#c62828',
};

export default function Recruitment() {
  const { t } = useTranslation();
  const { hasPermission } = useAuth();
  const canManage = hasPermission('recruitment:manage');
  const { addToast } = useToast();
  const [tab, setTab] = useState('jobs');
  const [jobs, setJobs] = useState([]);
  const [candidates, setCandidates] = useState([]);
  const [selectedJob, setSelectedJob] = useState(null);
  const [loading, setLoading] = useState(true);
  const [movingId, setMovingId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [jobsError, setJobsError] = useState(false);
  const [candidatesError, setCandidatesError] = useState(false);
  const [showJobModal, setShowJobModal] = useState(false);
  const [showCandModal, setShowCandModal] = useState(false);
  const [stageFilter, setStageFilter] = useState('');

  const loadJobs = useCallback(async () => {
    setLoading(true);
    setJobsError(false);
    try {
      const data = await getJobs();
      setJobs(data);
    } catch {
      setJobsError(true);
      setJobs([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadCandidates = useCallback(async (jobId = null) => {
    if (!jobId) { setCandidates([]); return; }
    setLoading(true);
    setCandidatesError(false);
    try {
      const data = await getCandidates(jobId);
      setCandidates(data);
    } catch {
      setCandidatesError(true);
      setCandidates([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tab === 'jobs') loadJobs();
    else loadCandidates(selectedJob?.id);
  }, [tab, selectedJob]);

  const handleJobClick = (job) => {
    setSelectedJob(job);
    setTab('candidates');
  };

  const handleMoveStage = async (cand, stage) => {
    setMovingId(cand.id);
    try {
      await moveStage(cand.id, stage);
      addToast(t('recruitment.movedToStage', { stage }), 'success');
      loadCandidates(selectedJob?.id);
    } catch (e) { addToast(e.message, 'error'); }
    finally { setMovingId(null); }
  };

  const handleDeleteJob = async (e, job) => {
    e.stopPropagation();
    if (!window.confirm(t('recruitment.deleteJobConfirm', { title: job.job_title }))) return;
    setDeletingId(job.id);
    try {
      await deleteJob(job.id);
      addToast(t('recruitment.jobDeleted'), 'success');
      loadJobs();
    } catch (err) { addToast(err.message, 'error'); }
    finally { setDeletingId(null); }
  };

  const handleDelete = async (cand) => {
    if (!window.confirm(t('recruitment.confirmDeleteCandidate', { name: cand.name }))) return;
    try {
      await deleteCandidate(cand.id);
      loadCandidates(selectedJob?.id);
    } catch (e) { addToast(e.message, 'error'); }
  };

  const visibleCandidates = stageFilter ? candidates.filter(c => c.stage === stageFilter) : candidates;

  return (
    <div className="page-content">
      <div className="page-header">
        <div>
          <h1 className="page-title">{t('recruitment.title')}</h1>
          <p className="page-subtitle">{t('recruitment.subtitle')}</p>
        </div>
        {canManage && tab === 'jobs' && (
          <button className="btn btn-primary" onClick={() => setShowJobModal(true)}>{t('recruitment.newJob')}</button>
        )}
      </div>
      <div className="page-toolbar">
        <div className="tab-group">
          <button className={`tab-btn${tab === 'jobs' ? ' active' : ''}`} onClick={() => setTab('jobs')}>
            {t('recruitment.jobOpenings')}
          </button>
          <button className={`tab-btn${tab === 'candidates' ? ' active' : ''}`} onClick={() => setTab('candidates')}>
            {t('recruitment.candidates')} {selectedJob && <span className="badge-count">{candidates.length}</span>}
          </button>
        </div>
        {canManage && tab === 'candidates' && selectedJob && (
          <button className="btn btn-primary" onClick={() => setShowCandModal(true)}>{t('recruitment.addCandidate')}</button>
        )}
      </div>

      {tab === 'jobs' && (
        <div className="leave-card-list">
          {jobsError && <ErrorState message={t('errors.failedLoad')} onRetry={loadJobs} />}
          {!jobsError && loading ? (
            Array.from({ length: 3 }).map((_, i) => <div key={i} className="leave-item-card"><Skeleton height={14} width="60%" /><Skeleton height={12} width="40%" style={{ marginTop: 8 }} /></div>)
          ) : !jobsError && jobs.length === 0 ? (
            <div className="card"><p className="text-center text-muted" style={{ padding: '32px 16px' }}>{t('recruitment.noJobs')}</p></div>
          ) : !jobsError && jobs.map(j => (
            <div key={j.id} className="leave-item-card" style={{ cursor: 'pointer' }} onClick={() => handleJobClick(j)}>
              <div className="leave-item-top">
                <div className="leave-item-info">
                  <div className="leave-item-type">{j.job_title}</div>
                  <div className="leave-item-dates">{j.department} · {t('recruitment.target')} {j.target_date || '—'}</div>
                  {j.description && <div className="text-muted" style={{ fontSize: 12, marginTop: 4 }}>{j.description}</div>}
                </div>
                <div className="leave-item-right">
                  {j.hired_count > 0 && <span className="duration-badge daily">{t('recruitment.hired', { count: j.hired_count })}</span>}
                  <span className="appraisal-status-badge" style={{ background: j.status === 'Open' ? '#2e7d32' : '#9e9e9e' }}>
                    {t(`status.${j.status}`, { defaultValue: j.status })}
                  </span>
                </div>
              </div>
              {canManage && (
                <div className="leave-item-actions">
                  <button className="btn btn-sm btn-danger" onClick={e => handleDeleteJob(e, j)} disabled={deletingId === j.id}>
                    {deletingId === j.id ? <span className="spinner-sm" /> : t('common.delete')}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {tab === 'candidates' && (
        <>
          {!selectedJob && (
            <div className="card">
              <p className="text-center text-muted" style={{ padding: '32px 16px' }}>
                {t('recruitment.selectJobFirst', { defaultValue: 'Select a job from the Jobs tab to view its candidates.' })}
              </p>
            </div>
          )}
          {selectedJob && (
            <div className="info-box" style={{ marginBottom: 12 }}>
              <strong>{selectedJob.job_title}</strong> — {selectedJob.department}
              <button className="btn btn-sm btn-secondary" style={{ marginInlineStart: 12 }} onClick={() => setTab('jobs')}>{t('recruitment.back')}</button>
            </div>
          )}
          {selectedJob && candidatesError && (
            <ErrorState message={t('errors.failedLoad')} onRetry={() => loadCandidates(selectedJob?.id)} />
          )}
          {selectedJob && (
            <>
              <div className="tab-group" style={{ marginBottom: 12, flexWrap: 'wrap', gap: 6 }}>
                <button className={`tab-btn${!stageFilter ? ' active' : ''}`} onClick={() => setStageFilter('')}>{t('recruitment.all')}</button>
                {STAGES.map(s => (
                  <button key={s} className={`tab-btn${stageFilter === s ? ' active' : ''}`} onClick={() => setStageFilter(s)} style={{ fontSize: 12 }}>
                    {s}
                  </button>
                ))}
              </div>
              <div className="leave-card-list">
                {loading ? (
                  Array.from({ length: 3 }).map((_, i) => <div key={i} className="leave-item-card"><Skeleton height={14} width="60%" /></div>)
                ) : visibleCandidates.length === 0 ? (
                  <div className="card"><p className="text-center text-muted" style={{ padding: '32px 16px' }}>{stageFilter ? t('recruitment.noCandidatesInStage', { stage: stageFilter }) : t('recruitment.noCandidates')}</p></div>
                ) : visibleCandidates.map(c => (
                  <div key={c.id} className="leave-item-card">
                    <div className="leave-item-top">
                      <div className="leave-item-info">
                        <div className="leave-item-type">{c.name}</div>
                        <div className="leave-item-dates">{c.email} · {c.phone}</div>
                        {c.cv_note && <div className="text-muted" style={{ fontSize: 12, marginTop: 4 }}>{c.cv_note}</div>}
                      </div>
                      <div className="leave-item-right">
                        <span className="appraisal-status-badge" style={{ background: STAGE_COLORS[c.stage] || '#607d8b' }}>
                          {t(`status.${c.stage}`, { defaultValue: c.stage })}
                        </span>
                      </div>
                    </div>
                    {canManage && c.status === 'Active' && (
                      <div className="leave-item-actions" style={{ flexWrap: 'wrap', gap: 6 }}>
                        {STAGES.filter(s => s !== c.stage && s !== 'Rejected').map(s => (
                          <button key={s} className="btn btn-sm btn-secondary" style={{ fontSize: 11 }} onClick={() => handleMoveStage(c, s)} disabled={movingId === c.id}>
                            {movingId === c.id ? <span className="spinner-sm" /> : `→ ${s}`}
                          </button>
                        ))}
                        <button className="btn btn-sm btn-danger" onClick={() => handleMoveStage(c, 'Rejected')} disabled={movingId === c.id}>{t('recruitment.reject')}</button>
                        <button className="btn btn-sm btn-secondary" onClick={() => handleDelete(c)}>{t('common.delete')}</button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}

      {showJobModal && (
        <Modal title={t('recruitment.newJob')} onClose={() => setShowJobModal(false)}>
          <JobForm onClose={() => setShowJobModal(false)} onCreated={loadJobs} />
        </Modal>
      )}

      {showCandModal && selectedJob && (
        <Modal title={t('recruitment.addCandidateTitle')} onClose={() => setShowCandModal(false)}>
          <CandidateForm jobId={selectedJob.id} onClose={() => setShowCandModal(false)} onCreated={() => loadCandidates(selectedJob.id)} />
        </Modal>
      )}
    </div>
  );
}

function JobForm({ onClose, onCreated }) {
  const { t } = useTranslation();
  const { addToast } = useToast();
  const [form, setForm] = useState({ job_title: '', department: '', description: '', target_date: '' });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const handle = async (e) => {
    e.preventDefault();
    setSaving(true);
    try { await createJob(form); addToast(t('recruitment.jobCreated'), 'success'); onCreated(); onClose(); }
    catch (err) { addToast(err.message || t('errors.failed'), 'error'); }
    finally { setSaving(false); }
  };
  return (
    <form className="form-stack" onSubmit={handle}>
      <div className="form-group"><label>{t('recruitment.jobTitle')} *</label><input className="form-input" value={form.job_title} onChange={e => set('job_title', e.target.value)} required /></div>
      <div className="form-group"><label>{t('recruitment.department')} *</label><input className="form-input" value={form.department} onChange={e => set('department', e.target.value)} required /></div>
      <div className="form-group"><label>{t('recruitment.description')}</label><textarea className="form-input" rows={2} value={form.description} onChange={e => set('description', e.target.value)} /></div>
      <div className="form-group"><label>{t('recruitment.targetDate')}</label><input type="date" className="form-input" value={form.target_date} onChange={e => set('target_date', e.target.value)} /></div>
      <div className="form-actions">
        <button type="button" className="btn btn-secondary" onClick={onClose}>{t('common.cancel')}</button>
        <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? <span className="spinner-sm" /> : t('recruitment.createJob')}</button>
      </div>
    </form>
  );
}

function CandidateForm({ jobId, onClose, onCreated }) {
  const { t } = useTranslation();
  const { addToast } = useToast();
  const [form, setForm] = useState({ name: '', email: '', phone: '', cv_note: '' });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const handle = async (e) => {
    e.preventDefault();
    setSaving(true);
    try { await addCandidate({ job_id: jobId, ...form }); addToast(t('recruitment.candidateAdded'), 'success'); onCreated(); onClose(); }
    catch (err) { addToast(err.message || t('errors.failed'), 'error'); }
    finally { setSaving(false); }
  };
  return (
    <form className="form-stack" onSubmit={handle}>
      <div className="form-group"><label>{t('recruitment.fullName')}</label><input className="form-input" value={form.name} onChange={e => set('name', e.target.value)} required /></div>
      <div className="form-group"><label>{t('recruitment.email')}</label><input type="email" className="form-input" value={form.email} onChange={e => set('email', e.target.value)} required /></div>
      <div className="form-group"><label>{t('recruitment.phone')}</label><input className="form-input" value={form.phone} onChange={e => set('phone', e.target.value)} /></div>
      <div className="form-group"><label>{t('recruitment.cvNotes')}</label><textarea className="form-input" rows={2} value={form.cv_note} onChange={e => set('cv_note', e.target.value)} /></div>
      <div className="form-actions">
        <button type="button" className="btn btn-secondary" onClick={onClose}>{t('common.cancel')}</button>
        <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? <span className="spinner-sm" /> : t('common.add')}</button>
      </div>
    </form>
  );
}
