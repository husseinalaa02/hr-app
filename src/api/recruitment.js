import { db } from '../db/index';
import { MOCK_JOBS, MOCK_CANDIDATES } from './mock';
import { supabase, SUPABASE_MODE } from '../db/supabase';

const DEMO = import.meta.env.VITE_DEMO_MODE === 'true';

export const STAGES = ['Application', 'Screening', 'Interview', 'Offer', 'Hired', 'Rejected'];

export async function getJobs({ status = '' } = {}) {
  if (SUPABASE_MODE) {
    let query = supabase.from('recruitment_jobs').select('*');
    if (status) query = query.eq('status', status);
    const { data, error } = await query.order('created_at', { ascending: false });
    if (error) return [];
    return data || [];
  }
  if (DEMO) {
    let rows = await db.recruitment_jobs.toArray();
    if (rows.length === 0) rows = [...MOCK_JOBS];
    if (status) rows = rows.filter(j => j.status === status);
    return rows.sort((a, b) => b.created_at.localeCompare(a.created_at));
  }
  return db.recruitment_jobs.toArray();
}

export async function getJob(id) {
  if (SUPABASE_MODE) {
    const { data } = await supabase.from('recruitment_jobs').select('*').eq('id', id).single();
    return data || null;
  }
  return db.recruitment_jobs.get(Number(id));
}

export async function createJob({ job_title, department, description, target_date }) {
  if (SUPABASE_MODE) {
    const { data: inserted, error } = await supabase.from('recruitment_jobs').insert({ job_title, department, description, target_date: target_date || null, status: 'Open', hired_count: 0, created_at: new Date().toISOString().slice(0, 10) }).select().single();
    if (error) throw error;
    return inserted;
  }
  const record = {
    job_title, department, description,
    target_date: target_date || null,
    status: 'Open',
    hired_count: 0,
    created_at: new Date().toISOString().slice(0, 10),
  };
  const id = await db.recruitment_jobs.add(record);
  return { ...record, id };
}

export async function updateJob(id, data) {
  if (SUPABASE_MODE) {
    const { data: updated, error } = await supabase.from('recruitment_jobs').update(data).eq('id', id).select().single();
    if (error) throw error;
    return updated;
  }
  const existing = await db.recruitment_jobs.get(Number(id));
  if (!existing) throw new Error('Job not found');
  const updated = { ...existing, ...data };
  await db.recruitment_jobs.put(updated);
  return updated;
}

export async function getCandidates(jobId = null) {
  if (SUPABASE_MODE) {
    let query = supabase.from('recruitment_candidates').select('*');
    if (jobId) query = query.eq('job_id', jobId);
    const { data, error } = await query.order('applied_at', { ascending: false });
    if (error) return [];
    return data || [];
  }
  if (DEMO) {
    let rows = await db.recruitment_candidates.toArray();
    if (jobId) rows = rows.filter(c => c.job_id === Number(jobId));
    return rows.sort((a, b) => b.applied_at.localeCompare(a.applied_at));
  }
  return db.recruitment_candidates.toArray();
}

export async function addCandidate({ job_id, name, email, phone, cv_note = '' }) {
  if (SUPABASE_MODE) {
    const { data: inserted, error } = await supabase.from('recruitment_candidates').insert({ job_id: Number(job_id), name, email, phone, cv_note, stage: 'Application', status: 'Active', applied_at: new Date().toISOString().slice(0, 10) }).select().single();
    if (error) throw error;
    return inserted;
  }
  const record = {
    job_id: Number(job_id), name, email, phone, cv_note,
    stage: 'Application',
    status: 'Active',
    applied_at: new Date().toISOString().slice(0, 10),
  };
  const id = await db.recruitment_candidates.add(record);
  return { ...record, id };
}

export async function moveStage(candidateId, stage) {
  if (SUPABASE_MODE) {
    const status = stage === 'Hired' ? 'Hired' : stage === 'Rejected' ? 'Rejected' : 'Active';
    const { data: updated, error } = await supabase.from('recruitment_candidates').update({ stage, status }).eq('id', candidateId).select().single();
    if (error) throw error;
    if (stage === 'Hired') {
      const { data: job } = await supabase.from('recruitment_jobs').select('hired_count').eq('id', updated.job_id).single();
      if (job) await supabase.from('recruitment_jobs').update({ hired_count: (job.hired_count || 0) + 1 }).eq('id', updated.job_id);
    }
    return updated;
  }
  const rec = await db.recruitment_candidates.get(Number(candidateId));
  if (!rec) throw new Error('Candidate not found');
  const status = stage === 'Hired' ? 'Hired' : stage === 'Rejected' ? 'Rejected' : 'Active';
  const updated = { ...rec, stage, status };
  await db.recruitment_candidates.put(updated);

  // Update hired_count on job
  if (stage === 'Hired') {
    const job = await db.recruitment_jobs.get(Number(rec.job_id));
    if (job) await db.recruitment_jobs.put({ ...job, hired_count: (job.hired_count || 0) + 1 });
  }
  return updated;
}

export async function deleteCandidate(id) {
  if (SUPABASE_MODE) {
    const { error } = await supabase.from('recruitment_candidates').delete().eq('id', id);
    if (error) throw error;
    return;
  }
  await db.recruitment_candidates.delete(Number(id));
}
