-- Rollback 009: No-op — plaintext passwords cannot be restored after clearing.
-- This migration is intentionally irreversible for security reasons.
-- If needed, reset employee passwords via the Supabase Auth dashboard.

select 'Rollback not applicable: passwords cleared for security reasons' as notice;
