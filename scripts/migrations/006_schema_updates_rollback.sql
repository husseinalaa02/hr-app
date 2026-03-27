-- Rollback 006: Remove attendance unique constraint and updated_at columns

alter table attendance             drop constraint if exists attendance_unique;
alter table leave_apps             drop column if exists updated_at;
alter table expenses               drop column if exists updated_at;
alter table announcements          drop column if exists updated_at;
alter table recruitment_candidates drop column if exists updated_at;
alter table recruitment_jobs       drop column if exists updated_at;
-- Note: recruitment_jobs.created_at type change is not reverted (data loss risk).
