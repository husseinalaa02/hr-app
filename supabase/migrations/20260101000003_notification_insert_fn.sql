-- Migration 003: Add insert_notification security-definer function (C2/C3)
-- and notifications DELETE policy for "Clear read" feature (L2).
-- Also adds the link column to notifications for deep-link routing.

-- Add link column (safe no-op if already exists)
alter table notifications add column if not exists link text;

create or replace function insert_notification(
  p_recipient_id text,
  p_type         text default 'info',
  p_message      text default '',
  p_link         text default null
) returns void language plpgsql security definer as $$
declare
  v_caller    text := auth_employee_id();
  v_valid_types text[] := array['info','leave','payroll','appraisal','expense','recruitment'];
begin
  -- Authorization: caller must be authenticated
  if v_caller is null then
    raise exception 'insert_notification: unauthenticated caller';
  end if;

  -- Authorization: caller must be the recipient OR a manager of the recipient OR admin/hr_manager
  if v_caller <> p_recipient_id
    and auth_role() not in ('admin', 'hr_manager')
    and not exists (
      select 1 from employees
      where name = p_recipient_id and reports_to = v_caller
    )
  then
    raise exception 'insert_notification: caller % is not authorized to notify %', v_caller, p_recipient_id;
  end if;

  -- Validate message length
  if length(p_message) > 1000 then
    raise exception 'insert_notification: message exceeds 1000 characters';
  end if;

  -- Validate type
  if p_type <> all(v_valid_types) then
    raise exception 'insert_notification: invalid type "%"', p_type;
  end if;

  insert into notifications(recipient_id, type, message, link, read, created_at)
  values (p_recipient_id, p_type, p_message, p_link, false, now());
end;
$$;

-- L2: allow employees to delete their own read notifications
drop policy if exists "notif_delete" on notifications;
create policy "notif_delete" on notifications for delete to authenticated
  using (recipient_id = auth_employee_id() and read = true);
