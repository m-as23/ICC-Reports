-- Owner adjustments are additive journals. Do not rewrite or delete previously approved overtime/leave entries.
BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='15s';
CREATE TABLE IF NOT EXISTS public.mt_leave_balance_adjustments(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES public.mt_users(id),
 delta_days numeric(7,1) NOT NULL CHECK(delta_days<>0),
 balance_before numeric(7,1),
 balance_after numeric(7,1) CHECK(balance_after IS NULL OR balance_after>=0),
 reason text NOT NULL CHECK(length(btrim(reason)) BETWEEN 3 AND 250),
 approved_by uuid NOT NULL REFERENCES public.mt_users(id),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS mt_leave_adj_user_created_idx ON public.mt_leave_balance_adjustments(user_id,created_at DESC);
CREATE INDEX IF NOT EXISTS mt_leave_adj_approved_by_idx ON public.mt_leave_balance_adjustments(approved_by);
CREATE TABLE IF NOT EXISTS public.mt_substitute_time_adjustments(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES public.mt_users(id),
 delta_minutes integer NOT NULL CHECK(delta_minutes<>0),
 reason text NOT NULL CHECK(length(btrim(reason)) BETWEEN 3 AND 250),
 approved_by uuid NOT NULL REFERENCES public.mt_users(id),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS mt_sub_adj_user_created_idx ON public.mt_substitute_time_adjustments(user_id,created_at DESC);
CREATE INDEX IF NOT EXISTS mt_sub_adj_approved_by_idx ON public.mt_substitute_time_adjustments(approved_by);
ALTER TABLE public.mt_leave_balance_adjustments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mt_substitute_time_adjustments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.mt_leave_balance_adjustments FROM anon,authenticated;
REVOKE ALL ON public.mt_substitute_time_adjustments FROM anon,authenticated;
COMMIT;
