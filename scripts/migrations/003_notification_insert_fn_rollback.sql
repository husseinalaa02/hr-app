-- Rollback 003: Remove insert_notification function and notif_delete policy

drop function if exists insert_notification(text, text, text, text);
drop policy if exists "notif_delete" on notifications;
