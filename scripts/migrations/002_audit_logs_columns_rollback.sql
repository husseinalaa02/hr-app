-- Rollback 002: Remove user_name and ip_address from audit_logs

alter table audit_logs drop column if exists user_name;
alter table audit_logs drop column if exists ip_address;
