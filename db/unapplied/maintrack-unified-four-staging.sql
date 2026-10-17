-- MainTrack unified update (staging draft). NOT APPLIED.
-- Existing annual leave balances and historical ledgers are preserved.
-- Duration policy beyond the explicitly approved 4h half day remains unchanged/pending.
BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '15s';

ALTER TABLE public.mt_leave_requests
  ALTER COLUMN days TYPE numeric(7,1) USING days::numeric(7,1);
ALTER TABLE public.mt_leave_requests
  ADD COLUMN IF NOT EXISTS duration_kind text NOT NULL DEFAULT 'FULL_DAY';
ALTER TABLE public.mt_leave_requests
  DROP CONSTRAINT mt_leave_requests_days_check,
  DROP CONSTRAINT mt_leave_requests_calendar_days_check,
  DROP CONSTRAINT mt_leave_requests_type_check;
ALTER TABLE public.mt_leave_requests
  ADD CONSTRAINT mt_leave_duration_kind_chk CHECK (duration_kind IN ('FULL_DAY','HALF_DAY')),
  ADD CONSTRAINT mt_leave_requests_days_check CHECK (days BETWEEN 0.5 AND 60),
  ADD CONSTRAINT mt_leave_requests_calendar_days_check CHECK (
    (duration_kind='FULL_DAY' AND days=(end_date-start_date+1))
    OR (duration_kind='HALF_DAY' AND start_date=end_date AND days=0.5)
  ),
  ADD CONSTRAINT mt_leave_requests_type_check CHECK (
   type IN ('annual','casual','sick','other','compensatory')
   AND (duration_kind<>'HALF_DAY' OR type IN ('annual','compensatory'))
   AND (type<>'compensatory' OR duration_kind='HALF_DAY')
  );

CREATE TABLE IF NOT EXISTS public.mt_overtime_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL UNIQUE,
  requester_id uuid NOT NULL REFERENCES public.mt_users(id),
  client_request_id uuid NOT NULL UNIQUE,
  request_digest text NOT NULL,
  work_date date NOT NULL,
  start_time time NOT NULL,
  end_time time NOT NULL,
  minutes integer NOT NULL CHECK(minutes BETWEEN 1 AND 1440),
  compensation_kind text NOT NULL CHECK(compensation_kind IN ('FINANCIAL','SUBSTITUTE')),
  reason text NOT NULL DEFAULT '',
  status public.mt_leave_status NOT NULL DEFAULT 'PENDING',
  created_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz,
  decided_by uuid REFERENCES public.mt_users(id),
  decision_reason text NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS mt_overtime_user_created_idx
 ON public.mt_overtime_requests(requester_id,created_at DESC);
CREATE INDEX IF NOT EXISTS mt_overtime_status_created_idx
 ON public.mt_overtime_requests(status,created_at DESC);

-- Immutable credit/debit journal; the historical overtime request is never decremented.
CREATE TABLE IF NOT EXISTS public.mt_substitute_time_ledger (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES public.mt_users(id),
 delta_minutes integer NOT NULL CHECK(delta_minutes <> 0),
 overtime_id uuid REFERENCES public.mt_overtime_requests(id),
 leave_id uuid REFERENCES public.mt_leave_requests(id),
 approved_by uuid NOT NULL REFERENCES public.mt_users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT mt_substitute_ledger_one_source CHECK (
  (overtime_id IS NOT NULL AND leave_id IS NULL AND delta_minutes > 0)
  OR (overtime_id IS NULL AND leave_id IS NOT NULL AND delta_minutes < 0))
);
CREATE UNIQUE INDEX IF NOT EXISTS mt_sub_time_overtime_uq
 ON public.mt_substitute_time_ledger(overtime_id) WHERE overtime_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS mt_sub_time_leave_uq
 ON public.mt_substitute_time_ledger(leave_id) WHERE leave_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS mt_sub_time_user_idx
 ON public.mt_substitute_time_ledger(user_id,created_at DESC);

-- No direct access through the public Data API; app authorization is server-side.
ALTER TABLE public.mt_overtime_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mt_substitute_time_ledger ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.mt_overtime_requests FROM anon,authenticated;
REVOKE ALL ON public.mt_substitute_time_ledger FROM anon,authenticated;
COMMIT;
