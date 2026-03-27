-- Migration 003: Add insert_notification security-definer function (C2)
-- and notifications DELETE policy for "Clear read" feature (L2).

create or replace function insert_notification(
  p_recipient_id text,
  p_title        text,
  p_message      text,
  p_type         text default 'info'
) returns void language plpgsql security definer as $$
begin
  insert into notifications(recipient_id, title, message, type)
  values (p_recipient_id, p_title, p_message, p_type);
end;
$$;

-- L2: allow employees to delete their own read notifications
drop policy if exists "notif_delete" on notifications;
create policy "notif_delete" on notifications for delete to authenticated
  using (recipient_id = auth_employee_id() and read = true);
