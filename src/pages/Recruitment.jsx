import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { getJobs, createJob, updateJob, getCandidates, addCandidate, moveStage, deleteCandidate, STAGES } from '../api/recruitment';
import Modal from '../components/Modal';
import { Skeleton } from '../components/Skeleton';

const STAGE_COLORS = {
  Application: '#607d8b',
  Screening:   '#ef6c00',
  Interview:   '#1565c0',
  Offer:       '#6a1b9a',
  Hired:       '#2e7d32',
  Rejected:    '#c62828',
};

export default function Recruitment() {
  const { isAdmin } = useAuth();
  const { addToast } = useToast();
  const [tab, setTab] = useState('jobs');
  const [jobs, setJobs] = useState([]);
  const [candidates, setCandidates] = useState([]);
  const [selectedJob, setSelectedJob] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showJobModal, setShowJobModal] = useState(false);
  const [showCandModal, setShowCandModal] = useState(false);
  const [stageFilter, setStageFilter] = useState('');

  const loadJobs = useCallback(async () => {
    setLoading(true);
    const data = await getJobs();
    setJobs(data);
    setLoading(false);
  }, []);

  const loadCandidates = useCallback(async (jobId = null) => {
    setLoading(true);
    const data = await getCandidates(jobId);
    setCandidates(data);
    setLoading(false);
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
    try {
      await moveStage(cand.id, stage);
      addToast(`Moved to ${stage}`, 'success');
      loadCandidates(selectedJob?.id);
    } catch (e) { addToast(e.message, 'error'); }
  };

  const handleDelete = async (cand) => {
    if (!window.confirm(`Remove ${cand.name}?`)) return;
    await deleteCandidate(cand.id);
    loadCandidates(selectedJob?.id);
  };

  const visibleCandidates = stageFilter ? candidates.filter(c => c.stage === stageFilter) : candidates;

  return (
    <div className="page-content">
      <div className="page-header">
        <div>
          <h1 className="page-title">Recruitment</h1>
          <p className="page-subtitle">Manage job openings and track candidates</p>
        </div>
        {isAdmin && tab === 'jobs' && (
          <button className="btn btn-primary" onClick={() => setShowJobModal(true)}>+ New Job</button>
        )}
      </div>
      <div className="page-toolbar">
        <div className="tab-group">
          <button className={`tab-btn${tab === 'jobs' ? ' active' : ''}`} onClick={() => setTab('jobs')}>
            Job Openings
          </button>
          <button className={`tab-btn${tab === 'candidates' ? ' active' : ''}`} onClick={() => setTab('candidates')}>
            Candidates {selectedJob && <span className="badge-count">{candidates.length}</span>}
          </button>
        </div>
        {isAdmin && tab === 'candidates' && selectedJob && (
          <button className="btn btn-primary" onClick={() => setShowCandModal(true)}>+ Add Candidate</button>
        )}
      </div>

      {tab === 'jobs' && (
        <div className="leave-card-list">
          {loading ? (
            Array.from({ length: 3 }).map((_, i) => <div key={i} className="leave-item-card"><Skeleton height={14} width="60%" /><Skeleton height={12} width="40%" style={{ marginTop: 8 }} /></div>)
          ) : jobs.length === 0 ? (
            <div className="card"><p className="text-center text-muted" style={{ padding: '32px 16px' }}>No job openings</p></div>
          ) : jobs.map(j => (
            <div key={j.id} className="leave-item-card" style={{ cursor: 'pointer' }} onClick={() => handleJobClick(j)}>
              <div className="leave-item-top">
                <div className="leave-item-info">
                  <div className="leave-item-type">{j.job_title}</div>
                  <div className="leave-item-dates">{j.department} · Target: {j.target_date || '—'}</div>
                  {j.description && <div className="text-muted" style={{ fontSize: 12, marginTop: 4 }}>{j.description}</div>}
                </div>
                <div className="leave-item-right">
                  {j.hired_count > 0 && <span className="duration-badge daily">{j.hired_count} hired</span>}
                  <span className="appraisal-status-badge" style={{ background: j.status === 'Open' ? '#2e7d32' : '#9e9e9e' }}>
                    {j.status}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'candidates' && (
        <>
          {selectedJob && (
            <div className="info-box" style={{ marginBottom: 12 }}>
              <strong>{selectedJob.job_title}</strong> — {selectedJob.department}
              <button className="btn btn-sm btn-secondary" style={{ marginLeft: 12 }} onClick={() => setTab('jobs')}>← Back</button>
            </div>
          )}
          <div className="tab-group" style={{ marginBottom: 12, flexWrap: 'wrap', gap: 6 }}>
            <button className={`tab-btn${!stageFilter ? ' active' : ''}`} onClick={() => setStageFilter('')}>All</button>
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
              <div className="card"><p className="text-center text-muted" style={{ padding: '32px 16px' }}>No candidates{stageFilter ? ` in ${stageFilter}` : ''}</p></div>
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
                      {c.stage}
                    </span>
                  </div>
                </div>
                {isAdmin && c.status === 'Active' && (
                  <div className="leave-item-actions" style={{ flexWrap: 'wrap', gap: 6 }}>
                    {STAGES.filter(s => s !== c.stage && s !== 'Rejected').map(s => (
                      <button key={s} className="btn btn-sm btn-secondary" style={{ fontSize: 11 }} onClick={() => handleMoveStage(c, s)}>
                        → {s}
                      </button>
                    ))}
                    <button className="btn btn-sm btn-danger" onClick={() => handleMoveStage(c, 'Rejected')}>Reject</button>
                    <button className="btn btn-sm btn-secondary" onClick={() => handleDelete(c)}>Delete</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {showJobModal && (
        <Modal title="New Job Opening" onClose={() => setShowJobModal(false)}>
          <JobForm onClose={() => setShowJobModal(false)} onCreated={loadJobs} />
        </Modal>
      )}

      {showCandModal && selectedJob && (
        <Modal title="Add Candidate" onClose={() => setShowCandModal(false)}>
          <CandidateForm jobId={selectedJob.id} onClose={() => setShowCandModal(false)} onCreated={() => loadCandidates(selectedJob.id)} />
        </Modal>
      )}
    </div>
  );
}

function JobForm({ onClose, onCreated }) {
  const { addToast } = useToast();
  const [form, setForm] = useState({ job_title: '', department: '', description: '', target_date: '' });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const handle = async (e) => {
    e.preventDefault();
    setSaving(true);
    try { await createJob(form); addToast('Job created', 'success'); onCreated(); onClose(); }
    catch (err) { addToast(err.message || 'Failed', 'error'); }
    finally { setSaving(false); }
  };
  return (
    <form className="form-stack" onSubmit={handle}>
      <div className="form-group"><label>Job Title *</label><input className="form-input" value={form.job_title} onChange={e => set('job_title', e.target.value)} required /></div>
      <div className="form-group"><label>Department *</label><input className="form-input" value={form.department} onChange={e => set('department', e.target.value)} required /></div>
      <div className="form-group"><label>Description</label><textarea className="form-input" rows={2} value={form.description} onChange={e => set('description', e.target.value)} /></div>
      <div className="form-group"><label>Target Date</label><input type="date" className="form-input" value={form.target_date} onChange={e => set('target_date', e.target.value)} /></div>
      <div className="form-actions">
        <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? <span className="spinner-sm" /> : 'Create'}</button>
      </div>
    </form>
  );
}

function CandidateForm({ jobId, onClose, onCreated }) {
  const { addToast } = useToast();
  const [form, setForm] = useState({ name: '', email: '', phone: '', cv_note: '' });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const handle = async (e) => {
    e.preventDefault();
    setSaving(true);
    try { await addCandidate({ job_id: jobId, ...form }); addToast('Candidate added', 'success'); onCreated(); onClose(); }
    catch (err) { addToast(err.message || 'Failed', 'error'); }
    finally { setSaving(false); }
  };
  return (
    <form className="form-stack" onSubmit={handle}>
      <div className="form-group"><label>Full Name *</label><input className="form-input" value={form.name} onChange={e => set('name', e.target.value)} required /></div>
      <div className="form-group"><label>Email *</label><input type="email" className="form-input" value={form.email} onChange={e => set('email', e.target.value)} required /></div>
      <div className="form-group"><label>Phone</label><input className="form-input" value={form.phone} onChange={e => set('phone', e.target.value)} /></div>
      <div className="form-group"><label>CV Notes</label><textarea className="form-input" rows={2} value={form.cv_note} onChange={e => set('cv_note', e.target.value)} /></div>
      <div className="form-actions">
        <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? <span className="spinner-sm" /> : 'Add'}</button>
      </div>
    </form>
  );
}
