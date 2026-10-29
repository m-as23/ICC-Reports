-- REVIEW ONLY: no Cloud/DB execution by this file's author.
-- FIRST disable all inventoryDraft entrypoints and independently reconcile Storage.
BEGIN;
LOCK TABLE inv_lab.upload_intents IN ACCESS EXCLUSIVE MODE NOWAIT;
DO $$ BEGIN
 IF current_user IS DISTINCT FROM (SELECT pg_get_userbyid(relowner) FROM pg_class WHERE oid='inv_lab.upload_intents'::regclass) THEN RAISE EXCEPTION 'REVIEWED_TABLE_OWNER_REQUIRED'; END IF;
 IF EXISTS(SELECT 1 FROM inv_lab.upload_intents) THEN RAISE EXCEPTION 'RETAIN_DURABLE_OWNERSHIP_UNTIL_RECONCILED'; END IF;
END $$;
-- No CASCADE and no Storage remove, version/item deletion or audit deletion.
DROP TABLE inv_lab.upload_intents;
COMMIT;
