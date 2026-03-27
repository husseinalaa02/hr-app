-- Rollback 007: Rename announcements.created_at → creation; remove checkins.created_at

do $$ begin
  if exists (
    select 1 from information_schema.columns
    where table_name = 'announcements' and column_name = 'created_at'
  ) then
    alter table announcements rename column created_at to creation;
  end if;
end $$;

alter table checkins drop column if exists created_at;
