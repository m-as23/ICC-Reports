-- MainTrack QA only: explicit overtime classification, preserving historic/pilot rows.
-- Legacy records receive UNSPECIFIED rather than falsely claiming a shift type.
BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='15s';
ALTER TABLE public.mt_overtime_requests
 ADD COLUMN IF NOT EXISTS work_kind text NOT NULL DEFAULT 'UNSPECIFIED';
ALTER TABLE public.mt_overtime_requests
 ADD CONSTRAINT mt_overtime_work_kind_check CHECK (work_kind IN ('AFTER_SHIFT','INDEPENDENT_DAY','UNSPECIFIED'));
COMMIT;
