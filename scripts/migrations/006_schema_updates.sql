-- Migration 006: Attendance unique constraint; updated_at on key tables;
-- recruitment_jobs.created_at type fix (M4, M7, M8)

-- M4: unique attendance per employee/date
do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'attendance_unique'
  ) then
    alter table attendance add constraint attendance_unique
      unique (employee, attendance_date);
  end if;
end $$;

-- M7: updated_at on tables that were missing it
alter table leave_apps             add column if not exists updated_at timestamptz default now();
alter table expenses               add column if not exists updated_at timestamptz default now();
alter table announcements          add column if not exists updated_at timestamptz default now();
alter table recruitment_candidates add column if not exists updated_at timestamptz default now();
alter table recruitment_jobs       add column if not exists updated_at timestamptz default now();

-- M8: fix recruitment_jobs.created_at from date to timestamptz
-- Only changes type if it is currently 'date'; safe no-op otherwise.
do $$ begin
  if exists (
    select 1 from information_schema.columns
    where table_name = 'recruitment_jobs'
      and column_name = 'created_at'
      and data_type = 'date'
  ) then
    alter table recruitment_jobs alter column created_at type timestamptz
      using created_at::timestamptz;
    alter table recruitment_jobs alter column created_at set default now();
  end if;
end $$;
