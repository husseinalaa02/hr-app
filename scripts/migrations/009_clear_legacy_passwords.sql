-- Migration 009: Clear legacy plaintext passwords from employees table.
-- The password column was kept only for the initial auth migration; all accounts
-- should now authenticate via Supabase Auth. Clearing this column removes PII
-- and eliminates the risk of stale credentials being used.

update employees set password = null where password is not null;
