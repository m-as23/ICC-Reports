-- MainTrack follow-up STAGING migration: approved 8-hour compensatory leave.
-- Annual leave and existing 0.5-day requests are preserved.
-- Multi-day compensatory policy remains pending; one full or half day per request.
BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '15s';

ALTER TABLE public.mt_leave_requests
  DROP CONSTRAINT mt_leave_requests_type_check;
ALTER TABLE public.mt_leave_requests
  ADD CONSTRAINT mt_leave_requests_type_check CHECK (
    type IN ('annual','casual','sick','other','compensatory')
    AND (duration_kind<>'HALF_DAY' OR type IN ('annual','compensatory'))
    AND (type<>'compensatory' OR
      (start_date=end_date AND days IN (0.5,1)))
  );
COMMIT;
