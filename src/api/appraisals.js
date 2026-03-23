import { db } from '../db/index';
import { supabase, SUPABASE_MODE } from '../db/supabase';

const DEMO = import.meta.env.VITE_DEMO_MODE === 'true';

export async function getAppraisalTemplates() {
  if (SUPABASE_MODE) {
    const { data, error } = await supabase.from('appraisal_templates').select('*').order('name');
    if (error) throw error;
    return data || [];
  }
  if (DEMO) return db.appraisal_templates.toArray();
  return [];
}

export async function getAppraisals({ employeeId = '', appraiserId = '', status = '' } = {}) {
  if (SUPABASE_MODE) {
    let q = supabase.from('appraisals').select('*').order('created_at', { ascending: false });
    if (employeeId)  q = q.eq('employee_id', employeeId);
    if (appraiserId) q = q.eq('appraiser_id', appraiserId);
    if (status)      q = q.eq('status', status);
    const { data, error } = await q;
    if (error) throw error;
    return data || [];
  }
  if (DEMO) {
    let rows = await db.appraisals.toArray();
    if (employeeId) rows = rows.filter(a => a.employee_id === employeeId);
    if (appraiserId) rows = rows.filter(a => a.appraiser_id === appraiserId);
    if (status) rows = rows.filter(a => a.status === status);
    return rows.sort((a, b) => b.created_at.localeCompare(a.created_at));
  }
  return [];
}

export async function getAppraisal(id) {
  if (SUPABASE_MODE) {
    const { data } = await supabase.from('appraisals').select('*').eq('id', id).maybeSingle();
    return data || null;
  }
  if (DEMO) return db.appraisals.get(Number(id));
  return null;
}

export async function createAppraisal({ template_id, employee_id, employee_name, appraiser_id, appraiser_name, period }) {
  if (SUPABASE_MODE) {
    const { data: tmpl } = await supabase.from('appraisal_templates').select('name').eq('id', template_id).maybeSingle();
    const record = {
      template_id, template_name: tmpl?.name || '',
      employee_id, employee_name, appraiser_id, appraiser_name, period,
      status: 'Not Started',
    };
    const { data, error } = await supabase.from('appraisals').insert(record).select().single();
    if (error) throw error;
    return data;
  }
  const template = await db.appraisal_templates.get(Number(template_id));
  const record = {
    template_id: Number(template_id),
    template_name: template?.name || '',
    employee_id, employee_name,
    appraiser_id, appraiser_name,
    period,
    status: 'Not Started',
    self_scores: null, self_comment: null,
    manager_scores: null, manager_comment: null,
    final_score: null,
    created_at: new Date().toISOString(),
    submitted_at: null, completed_at: null,
  };
  const id = await db.appraisals.add(record);
  return { ...record, id };
}

export async function submitSelfAssessment(id, { scores, comment }) {
  if (SUPABASE_MODE) {
    const { data, error } = await supabase.from('appraisals').update({
      self_scores: scores, self_comment: comment,
      status: 'Self-Assessment Submitted', submitted_at: new Date().toISOString(),
    }).eq('id', id).select().single();
    if (error) throw error;
    return data;
  }
  const rec = await db.appraisals.get(Number(id));
  if (!rec) throw new Error('Appraisal not found');
  const updated = { ...rec, self_scores: scores, self_comment: comment, status: 'Self-Assessment Submitted', submitted_at: new Date().toISOString() };
  await db.appraisals.put(updated);
  return updated;
}

export async function submitManagerReview(id, { scores, comment }) {
  if (SUPABASE_MODE) {
    const ratingValues = Object.values(scores).filter(v => typeof v === 'number');
    const final_score = ratingValues.length > 0
      ? Math.round((ratingValues.reduce((s, v) => s + v, 0) / ratingValues.length) * 10) / 10
      : null;
    const { data, error } = await supabase.from('appraisals').update({
      manager_scores: scores, manager_comment: comment, final_score,
      status: 'Completed', completed_at: new Date().toISOString(),
    }).eq('id', id).select().single();
    if (error) throw error;
    return data;
  }
  const rec = await db.appraisals.get(Number(id));
  if (!rec) throw new Error('Appraisal not found');
  // Calculate final score as average of manager ratings
  const ratingValues = Object.values(scores).filter(v => typeof v === 'number');
  const final_score = ratingValues.length > 0
    ? Math.round((ratingValues.reduce((s, v) => s + v, 0) / ratingValues.length) * 10) / 10
    : null;
  const updated = { ...rec, manager_scores: scores, manager_comment: comment, final_score, status: 'Completed', completed_at: new Date().toISOString() };
  await db.appraisals.put(updated);
  return updated;
}

export async function saveManagerReviewDraft(id, { scores, comment }) {
  if (SUPABASE_MODE) {
    const { data, error } = await supabase.from('appraisals').update({
      manager_scores: scores, manager_comment: comment, status: 'Manager Review',
    }).eq('id', id).select().single();
    if (error) throw error;
    return data;
  }
  const rec = await db.appraisals.get(Number(id));
  if (!rec) throw new Error('Appraisal not found');
  const updated = { ...rec, manager_scores: scores, manager_comment: comment, status: 'Manager Review' };
  await db.appraisals.put(updated);
  return updated;
}

// ─── Template Management ──────────────────────────────────────────────────────

export async function createTemplate({ name, questions }) {
  if (!name?.trim()) throw new Error('Template name is required');
  if (!questions?.length) throw new Error('At least one question is required');
  if (SUPABASE_MODE) {
    const { data, error } = await supabase.from('appraisal_templates')
      .insert({ name: name.trim(), questions }).select().single();
    if (error) throw error;
    return data;
  }
  if (DEMO) {
    const id = await db.appraisal_templates.add({ name: name.trim(), questions });
    return { id, name: name.trim(), questions };
  }
  throw new Error('No backend available');
}

export async function updateTemplate(id, { name, questions }) {
  if (!name?.trim()) throw new Error('Template name is required');
  if (SUPABASE_MODE) {
    const { data, error } = await supabase.from('appraisal_templates')
      .update({ name: name.trim(), questions }).eq('id', id).select().single();
    if (error) throw error;
    return data;
  }
  if (DEMO) {
    const existing = await db.appraisal_templates.get(Number(id));
    if (!existing) throw new Error('Template not found');
    const updated = { ...existing, name: name.trim(), questions };
    await db.appraisal_templates.put(updated);
    return updated;
  }
  throw new Error('No backend available');
}

export async function deleteTemplate(id) {
  if (SUPABASE_MODE) {
    const { error } = await supabase.from('appraisal_templates').delete().eq('id', id);
    if (error) throw error;
    return;
  }
  if (DEMO) { await db.appraisal_templates.delete(Number(id)); return; }
}

export async function saveSelfAssessmentDraft(id, { scores, comment }) {
  if (SUPABASE_MODE) {
    const { data, error } = await supabase.from('appraisals').update({
      self_scores: scores, self_comment: comment, status: 'In Progress',
    }).eq('id', id).select().single();
    if (error) throw error;
    return data;
  }
  const rec = await db.appraisals.get(Number(id));
  if (!rec) throw new Error('Appraisal not found');
  const updated = { ...rec, self_scores: scores, self_comment: comment, status: 'In Progress' };
  await db.appraisals.put(updated);
  return updated;
}
