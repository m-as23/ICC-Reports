-- CP-06 SYNTHETIC SQL QA ONLY — run only inside disposable CI PostgreSQL. No customer or stock data.
-- Pinned upstream: m-as23/SpareParts-Search-Lab @ 07dbac0c2a63cf58336ae8a2df383cbcf9f283be
-- Isolated PostgreSQL smoke test: psql -v ON_ERROR_STOP=1 -f backend/sql/test_inventory.sql
-- Runs on disposable CI PostgreSQL, never on MainTrack.
BEGIN;
DO $test$
DECLARE
 v1 bigint;v2 bigint;v3 bigint;v4 bigint;
 q numeric;
 n bigint;
BEGIN
 INSERT INTO inv_lab.versions(filename,file_sha256,created_by)
 VALUES('v1.xlsx',repeat('a',64),'QA_OWNER') RETURNING id INTO v1;
 INSERT INTO inv_lab.items(version_id,code,description,quantity,location)
 VALUES(v1,'C1','Motor 90L',5,'A1'),(v1,'C2','Contactor',9,'B1');
 PERFORM inv_lab.seal_version(v1,'QA_OWNER');
 PERFORM inv_lab.publish_version(v1,NULL,'QA_OWNER');
 IF (SELECT current_version_id FROM inv_lab.active)<>v1
 THEN RAISE EXCEPTION 'V1 was not activated'; END IF;
 BEGIN
   UPDATE inv_lab.items SET quantity=99 WHERE version_id=v1 AND code='C1';
   RAISE EXCEPTION 'MUTATION_ALLOWED: sealed snapshot changed';
 EXCEPTION WHEN check_violation THEN NULL;
 END;
 INSERT INTO inv_lab.versions(filename,file_sha256,parent_version_id,created_by)
 VALUES('v2.xlsx',repeat('b',64),v1,'QA_OWNER') RETURNING id INTO v2;
 INSERT INTO inv_lab.items(version_id,code,description,quantity,location)
 VALUES(v2,'C1','Motor 90L',7,'A1'),(v2,'C2','Contactor',9,'B1'),(v2,'C3','Fuse',0,'B2');
 IF (SELECT count(*) FROM inv_lab.compare_version(v2) WHERE change_type='CHANGED')<>1
   OR (SELECT count(*) FROM inv_lab.compare_version(v2) WHERE change_type='NEW')<>1
 THEN RAISE EXCEPTION 'Wrong V1 vs V2 diff'; END IF;
 PERFORM inv_lab.seal_version(v2,'QA_OWNER');
 PERFORM inv_lab.publish_version(v2,v1,'QA_OWNER');
 IF (SELECT status FROM inv_lab.versions WHERE id=v1)<>'archived'
 THEN RAISE EXCEPTION 'V1 must be archived'; END IF;
 -- Two pending snapshots share V2. Only one can win approval.
 INSERT INTO inv_lab.versions(filename,file_sha256,parent_version_id,created_by)
 VALUES('v3.xlsx',repeat('c',64),v2,'QA_OWNER') RETURNING id INTO v3;
 INSERT INTO inv_lab.items(version_id,code,description,quantity,location)
 VALUES(v3,'C1','Motor 90L',7,'A1'),(v3,'C2','Contactor',11,'B1'),(v3,'C3','Fuse',0,'B2');
 INSERT INTO inv_lab.versions(filename,file_sha256,parent_version_id,created_by)
 VALUES('stale-v3.xlsx',repeat('d',64),v2,'QA_OWNER') RETURNING id INTO v4;
 INSERT INTO inv_lab.items(version_id,code,description,quantity,location)
 VALUES(v4,'C1','Motor 90L',90,'A1'),(v4,'C2','Contactor',9,'B1');
 IF (SELECT count(*) FROM inv_lab.compare_version(v3) WHERE change_type='CHANGED')<>1
 THEN RAISE EXCEPTION 'V3 must compare against V2'; END IF;
 PERFORM inv_lab.seal_version(v3,'QA_OWNER');
 PERFORM inv_lab.seal_version(v4,'QA_OWNER');
 PERFORM inv_lab.publish_version(v3,v2,'QA_OWNER');
 BEGIN
   PERFORM inv_lab.publish_version(v4,v2,'QA_OWNER');
   RAISE EXCEPTION 'STALE_CANDIDATE_WAS_APPROVED';
 EXCEPTION WHEN serialization_failure THEN NULL;
 END;
 IF (SELECT current_version_id FROM inv_lab.active)<>v3
 THEN RAISE EXCEPTION 'V3 must remain current after stale rejection'; END IF;
 IF (SELECT status FROM inv_lab.versions WHERE id=v4)<>'pending'
 THEN RAISE EXCEPTION 'Stale V4 must remain pending until re-compare'; END IF;
 IF (SELECT count(*) FROM inv_lab.versions WHERE status='archived')<>2
 THEN RAISE EXCEPTION 'Archive must preserve all previously approved versions'; END IF;
 -- A rollback itself becomes a new, approved version. No historical deletion.
 INSERT INTO inv_lab.versions(filename,file_sha256,parent_version_id,source_version_id,created_by)
 VALUES('restore-v1.xlsx',repeat('e',64),v3,v1,'QA_OWNER') RETURNING id INTO v4;
 INSERT INTO inv_lab.items(version_id,code,description,quantity,location,extra)
 SELECT v4,code,description,quantity,location,extra
 FROM inv_lab.items WHERE version_id=v1;
 PERFORM inv_lab.seal_version(v4,'QA_OWNER');
 PERFORM inv_lab.publish_version(v4,v3,'QA_OWNER');
 IF (SELECT status FROM inv_lab.versions WHERE id=v4)<>'current'
 OR (SELECT current_version_id FROM inv_lab.active)<>v4
 THEN RAISE EXCEPTION 'Restored snapshot must be current'; END IF;
 SELECT quantity INTO q FROM inv_lab.items WHERE version_id=v4 AND code='C1';
 IF q<>5 THEN RAISE EXCEPTION 'Rollback should restore the old quantity'; END IF;
 IF (SELECT count(*) FROM inv_lab.versions WHERE status='archived')<>3
 THEN RAISE EXCEPTION 'All older approved versions must remain in archive'; END IF;
 SELECT count(*) INTO n FROM inv_lab.audit WHERE event='PUBLISHED';
 IF n<>4 THEN RAISE EXCEPTION 'Audit trail must contain all four approvals'; END IF;
END;
$test$;
ROLLBACK; -- Nothing persists after this smoke test.
