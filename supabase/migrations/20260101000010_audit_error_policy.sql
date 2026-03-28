-- Migration 010: Add permissive audit_logs INSERT policy for ERROR actions
-- ─────────────────────────────────────────────────────────────────────────────
-- Problem: The audit_insert policy added in Round 6 enforces
--   user_id = auth_employee_id() AND role = auth_role()
-- This blocks the ErrorBoundary (App.jsx) from logging React errors because it
-- runs as 'system' user_id (a class component with no auth context access).
--
-- Fix: Add a second INSERT policy that allows any authenticated user to insert
-- when action = 'ERROR', but only with their own user_id (or NULL).
-- This prevents rogue users from attributing fake ERROR rows to other employees.
-- Supabase RLS applies OR logic across multiple INSERT policies — an insert
-- succeeds if ANY policy permits it.

do $$ begin
  if exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename  = 'audit_logs'
      and policyname = 'audit_error_insert'
  ) then
    execute $policy$
      drop policy "audit_error_insert" on audit_logs
    $policy$;
  end if;

  execute $policy$
    create policy "audit_error_insert" on audit_logs
      for insert to authenticated
      with check (
        action = 'ERROR'
        and (user_id is null or user_id = auth_employee_id())
      )
  $policy$;
end $$;
