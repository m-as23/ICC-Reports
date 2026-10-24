-- OWNER-AUTHORIZED CLEAN LAUNCH: MainTrack-Staging only.
-- Removes ALL current test users/reports/catalog/inventory records.
-- Creates OWNER with the current PILOT01 password and forces password change.
-- Run once in the intended project. A second run fails before deletion.
BEGIN;
SET LOCAL lock_timeout='10s';
SET LOCAL statement_timeout='60s';
LOCK TABLE public.mt_users IN ACCESS EXCLUSIVE MODE;
LOCK TABLE inv_lab.active IN ACCESS EXCLUSIVE MODE;
CREATE TEMP TABLE final_owner_bootstrap ON COMMIT DROP AS SELECT password_hash FROM public.mt_users WHERE employee_code='PILOT01' AND role='owner' AND active;
CREATE TEMP TABLE final_inventory_generation ON COMMIT DROP AS SELECT generation+1 AS generation FROM inv_lab.active;
CREATE TEMP TABLE final_archive_keys ON COMMIT DROP AS SELECT DISTINCT file_storage_key FROM inv_lab.versions WHERE file_storage_key IS NOT NULL;
DO $$ BEGIN IF (SELECT count(*) FROM final_owner_bootstrap)<>1 THEN RAISE EXCEPTION 'EXACT_OWNER_BOOTSTRAP_REQUIRED'; END IF; END $$;
TRUNCATE TABLE public.mt_audit,public.mt_leave_balance_adjustments,public.mt_leave_balances,public.mt_leave_ledger,public.mt_leave_requests,public.mt_notifications,public.mt_outbox,public.mt_overtime_requests,public.mt_reports,public.mt_sessions,public.mt_substitute_time_adjustments,public.mt_substitute_time_ledger,public.mt_login_attempts,public.mt_login_rate_guard,public.mt_users,public.mt_components,public.mt_machines,public.mt_sections,public.mt_technicians,inv_lab.active,inv_lab.audit,inv_lab.search_budget,inv_lab.semantic_items,inv_lab.semantic_documents,inv_lab.semantic_versions,inv_lab.items,inv_lab.versions RESTART IDENTITY;
ALTER SEQUENCE public.mt_wo_number_seq RESTART WITH 1;
INSERT INTO public.mt_users(employee_code,name,role,active,password_hash,must_change) SELECT 'OWNER','محمد أشرف','owner',true,password_hash,true FROM final_owner_bootstrap;
INSERT INTO inv_lab.active(singleton,current_version_id,generation) SELECT true,NULL,COALESCE((SELECT generation FROM final_inventory_generation),1);
DO $$ BEGIN
 IF (SELECT count(*) FROM public.mt_users)<>1 OR NOT EXISTS(SELECT 1 FROM public.mt_users WHERE employee_code='OWNER' AND role='owner' AND active AND must_change) THEN RAISE EXCEPTION 'FINAL_OWNER_INVALID'; END IF;
 IF EXISTS(SELECT 1 FROM public.mt_reports) OR EXISTS(SELECT 1 FROM public.mt_sessions) OR EXISTS(SELECT 1 FROM inv_lab.items) THEN RAISE EXCEPTION 'TEST_DATA_REMAINING'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.mt_users u JOIN final_owner_bootstrap b ON u.password_hash=b.password_hash WHERE u.employee_code='OWNER') THEN RAISE EXCEPTION 'OWNER_PASSWORD_CONTINUITY_FAILED'; END IF;
END $$;
SELECT json_build_object('status','DATABASE_RESET_COMPLETE','newOwnerCode','OWNER','passwordChangeRequired',true,'cutoverAt',transaction_timestamp(),'privateArchivesPendingDeletion',COALESCE((SELECT json_agg(file_storage_key) FROM final_archive_keys),'[]'::json)) AS clean_launch_result;
COMMIT;
