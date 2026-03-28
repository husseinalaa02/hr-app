-- Migration 007: Rename announcements.creation → created_at (M9)
-- Also adds created_at to checkins (L6).

-- M9: rename creation column to created_at (only if old name still exists)
do $$ begin
  if exists (
    select 1 from information_schema.columns
    where table_name = 'announcements' and column_name = 'creation'
  ) then
    alter table announcements rename column creation to created_at;
  end if;
end $$;

-- L6: add created_at to checkins
alter table checkins add column if not exists created_at timestamptz default now();
