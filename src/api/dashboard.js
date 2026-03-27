import { db } from '../db/index';
import { MOCK_ANNOUNCEMENTS } from './mock';
import { supabase, SUPABASE_MODE } from '../db/supabase';
import { cached, invalidate } from '../utils/cache';

const DEMO = import.meta.env.VITE_DEMO_MODE === 'true';

export async function getAnnouncements() {
  return cached('announcements', async () => {
    if (SUPABASE_MODE) {
      const { data, error } = await supabase.from('announcements').select('name, title, content, notice_date, created_at').order('created_at', { ascending: false }).limit(20);
      if (error) return [];
      return data || [];
    }
    if (DEMO) {
      const rows = await db.announcements.toArray();
      return rows.length > 0 ? rows : [...MOCK_ANNOUNCEMENTS];
    }
    return [];
  }, 1_800_000); // 30 min — announcements change rarely
}

export async function createAnnouncement({ title, content, notice_date }) {
  if (SUPABASE_MODE) {
    const record = { name: `ANN-${crypto.randomUUID()}`, title, content, notice_date, created_at: new Date().toISOString() };
    const { data, error } = await supabase.from('announcements').insert(record).select().single();
    if (error) throw error;
    invalidate('announcements');
    return data;
  }
  if (DEMO) {
    const record = { name: `ANN-${crypto.randomUUID()}`, title, content, notice_date, created_at: new Date().toISOString() };
    await db.announcements.put(record);
    invalidate('announcements');
    return record;
  }
  throw new Error('No backend available');
}

export async function deleteAnnouncement(name) {
  if (SUPABASE_MODE) {
    const { error } = await supabase.from('announcements').delete().eq('name', name);
    if (error) throw error;
    invalidate('announcements');
    return;
  }
  if (DEMO) {
    await db.announcements.delete(name);
    invalidate('announcements');
  }
}
