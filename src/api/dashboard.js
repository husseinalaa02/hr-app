import { db } from '../db/index';
import { MOCK_ANNOUNCEMENTS } from './mock';
import { supabase, SUPABASE_MODE } from '../db/supabase';

const DEMO = import.meta.env.VITE_DEMO_MODE === 'true';

export async function getAnnouncements() {
  if (SUPABASE_MODE) {
    const { data, error } = await supabase.from('announcements').select('*').order('creation', { ascending: false }).limit(5);
    if (error) return [];
    return data || [];
  }
  if (DEMO) {
    const rows = await db.announcements.toArray();
    return rows.length > 0 ? rows : [...MOCK_ANNOUNCEMENTS];
  }
  return [];
}
