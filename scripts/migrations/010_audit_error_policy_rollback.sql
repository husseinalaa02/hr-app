-- Rollback 010: Remove the permissive ERROR-action audit_logs INSERT policy
drop policy if exists "audit_error_insert" on audit_logs;
