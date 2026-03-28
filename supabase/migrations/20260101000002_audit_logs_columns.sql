-- Migration 002: Add user_name and ip_address to audit_logs (C1)
-- Run in Supabase SQL Editor. Safe to re-run (IF NOT EXISTS guards).

alter table audit_logs add column if not exists user_name  text default '';
alter table audit_logs add column if not exists ip_address text default '127.0.0.1';
