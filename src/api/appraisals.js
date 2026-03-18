import { db } from '../db/index';
import { SUPABASE_MODE } from '../db/supabase';

const DEMO = import.meta.env.VITE_DEMO_MODE === 'true';

function assertDemoOrThrow() {
  if (SUPABASE_MODE && !DEMO) {
    throw new Error('Appraisals are not yet available in production mode.');
  }
}

export async function getAppraisalTemplates() {
  assertDemoOrThrow();
  return db.appraisal_templates.toArray();
}

export async function getAppraisals({ employeeId = '', appraiserId = '', status = '' } = {}) {
  assertDemoOrThrow();
  if (DEMO) {
    let rows = await db.appraisals.toArray();
    if (employeeId) rows = rows.filter(a => a.employee_id === employeeId);
    if (appraiserId) rows = rows.filter(a => a.appraiser_id === appraiserId);
    if (status) rows = rows.filter(a => a.status === status);
    return rows.sort((a, b) => b.created_at.localeCompare(a.created_at));
  }
  return db.appraisals.toArray();
}

export async function getAppraisal(id) {
  assertDemoOrThrow();
  return db.appraisals.get(Number(id));
}

export async function createAppraisal({ template_id, employee_id, employee_name, appraiser_id, appraiser_name, period }) {
  assertDemoOrThrow();
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
  assertDemoOrThrow();
  const rec = await db.appraisals.get(Number(id));
  if (!rec) throw new Error('Appraisal not found');
  const updated = { ...rec, self_scores: scores, self_comment: comment, status: 'Self-Assessment Submitted', submitted_at: new Date().toISOString() };
  await db.appraisals.put(updated);
  return updated;
}

export async function submitManagerReview(id, { scores, comment }) {
  assertDemoOrThrow();
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
  assertDemoOrThrow();
  const rec = await db.appraisals.get(Number(id));
  if (!rec) throw new Error('Appraisal not found');
  const updated = { ...rec, manager_scores: scores, manager_comment: comment, status: 'Manager Review' };
  await db.appraisals.put(updated);
  return updated;
}

export async function saveSelfAssessmentDraft(id, { scores, comment }) {
  assertDemoOrThrow();
  const rec = await db.appraisals.get(Number(id));
  if (!rec) throw new Error('Appraisal not found');
  const updated = { ...rec, self_scores: scores, self_comment: comment, status: 'In Progress' };
  await db.appraisals.put(updated);
  return updated;
}
