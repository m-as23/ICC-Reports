-- QA migration: permit overtime approval notifications without compromising
-- existing report/leave notification types. No existing rows are modified.
-- A failed notification insert previously rolled back the entire approval transaction.
BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='15s';
ALTER TABLE public.mt_notifications DROP CONSTRAINT mt_notifications_type_check;
ALTER TABLE public.mt_notifications ADD CONSTRAINT mt_notifications_type_check
 CHECK (type IN ('report','leaveDecision','leaveBalance','overtimeDecision'));
COMMIT;
