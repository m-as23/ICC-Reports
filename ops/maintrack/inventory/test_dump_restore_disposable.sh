#!/usr/bin/env bash
# Synthetic inventory backup round-trip, exclusively inside the CI Postgres service.
# This does NOT certify recovery of Supabase, Storage objects, secrets, APK or OTA.
set -euo pipefail
[[ "${CI:-}" == true && "${GITHUB_ACTIONS:-}" == true ]] || { echo 'REFUSED: GitHub disposable CI only'; exit 2; }
[[ "${MT047_POSTGRES_CONTAINER:-}" =~ ^[0-9a-f]{64}$ ]] || { echo 'REFUSED: missing CI service container'; exit 2; }
container="$MT047_POSTGRES_CONTAINER"
[[ "$(docker inspect --format '{{.Config.Image}}' "$container")" == 'postgres:16' ]] || { echo 'REFUSED: unexpected service image'; exit 2; }
source_db=inventory_047_disposable
restored_db=inventory_047_restored
pg() { docker exec -i "$container" psql -X -q -A -t -v ON_ERROR_STOP=1 -U qa_owner -d "$1"; }
[[ "$(pg "$source_db" <<< 'SELECT count(*) FROM inv_lab.versions;')" == 0 ]] || { echo 'REFUSED: source is not empty synthetic database'; exit 2; }
[[ "$(pg postgres <<< "SELECT count(*) FROM pg_database WHERE datname='inventory_047_restored';")" == 0 ]] || { echo 'REFUSED: restore destination already exists'; exit 2; }
scratch_dir="$(mktemp -d)"
trap 'rm -rf "$scratch_dir"' EXIT
umask 077
# Reuse the full V1/V2/V3/stale/rollback fixture, retaining its synthetic rows
# in this disposable service so pg_dump contains real history, not empty tables.
python3 - <<'PY' | pg "$source_db"
from pathlib import Path
source = Path('ops/maintrack/inventory/test_inventory_disposable.sql').read_text()
ending = 'ROLLBACK; -- Nothing persists after this smoke test.'
if source.count(ending) != 1:
    raise SystemExit('REFUSED: synthetic fixture rollback marker changed')
print(source.replace(ending, 'COMMIT; -- Retained only for disposable dump/restore test.'))
PY
snapshot() {
  pg "$1" <<'SQL'
SELECT jsonb_build_object(
 'versions',(SELECT jsonb_agg(to_jsonb(v) ORDER BY id) FROM inv_lab.versions v),
 'items',(SELECT jsonb_agg(to_jsonb(i) ORDER BY version_id,code) FROM inv_lab.items i),
 'active',(SELECT jsonb_agg(to_jsonb(a) ORDER BY singleton) FROM inv_lab.active a),
 'audit',(SELECT jsonb_agg(to_jsonb(a) ORDER BY id) FROM inv_lab.audit a)
);
SQL
}
snapshot "$source_db" > "$scratch_dir/before.json"
docker exec "$container" pg_dump -U qa_owner -d "$source_db" --schema=inv_lab --format=custom > "$scratch_dir/inventory.dump"
test -s "$scratch_dir/inventory.dump"
docker exec "$container" createdb -U qa_owner "$restored_db"
# Keep ACLs; do NOT pass --no-acl. Roles are shared within this disposable cluster.
docker exec -i "$container" pg_restore -U qa_owner -d "$restored_db" --exit-on-error --single-transaction < "$scratch_dir/inventory.dump"
snapshot "$restored_db" > "$scratch_dir/after.json"
cmp "$scratch_dir/before.json" "$scratch_dir/after.json"
echo 'PASS_DUMP_RESTORE_ALL_ROWS: versions/items/active/audit match exactly'
pg "$restored_db" <<'SQL'
DO $assert$
DECLARE next_id bigint; max_id bigint;
BEGIN
 IF (SELECT count(*) FROM inv_lab.versions)<>5
 OR (SELECT count(*) FROM inv_lab.versions WHERE status='archived')<>3
 OR (SELECT count(*) FROM inv_lab.audit WHERE event='PUBLISHED')<>4
 OR (SELECT generation FROM inv_lab.active)<>4
 THEN RAISE EXCEPTION 'Restored archive or active pointer is incomplete'; END IF;
 IF EXISTS(SELECT 1 FROM pg_constraint WHERE connamespace='inv_lab'::regnamespace AND NOT convalidated)
 THEN RAISE EXCEPTION 'Unvalidated restored constraint'; END IF;
 BEGIN
   UPDATE inv_lab.items SET quantity=999 WHERE version_id=(SELECT current_version_id FROM inv_lab.active);
   RAISE EXCEPTION 'SEALED_ITEMS_MUTABLE_AFTER_RESTORE';
 EXCEPTION WHEN check_violation THEN NULL;
 END;
 SELECT max(id) INTO max_id FROM inv_lab.versions;
 INSERT INTO inv_lab.versions(filename,file_sha256,created_by)
 VALUES('after-restore-synthetic.xlsx',repeat('f',64),'QA_OWNER') RETURNING id INTO next_id;
 IF next_id<=max_id THEN RAISE EXCEPTION 'Restored identity sequence regressed'; END IF;
END;
$assert$;
SQL
# Check actual restored privileges, including inherited PUBLIC permissions.
pg "$restored_db" <<'SQL'
DO $assert$
BEGIN
 IF has_schema_privilege('mt047_untrusted_web','inv_lab','USAGE')
 OR EXISTS(SELECT 1 FROM pg_class c WHERE CASE WHEN c.relnamespace='inv_lab'::regnamespace AND c.relkind IN ('r','p') THEN has_table_privilege('mt047_untrusted_web',c.oid,'SELECT,INSERT,UPDATE,DELETE') ELSE false END)
 OR EXISTS(SELECT 1 FROM pg_class c WHERE CASE WHEN c.relnamespace='inv_lab'::regnamespace AND c.relkind='S' THEN has_sequence_privilege('mt047_untrusted_web',c.oid,'USAGE,SELECT,UPDATE') ELSE false END)
 OR EXISTS(SELECT 1 FROM pg_proc p WHERE p.pronamespace='inv_lab'::regnamespace AND has_function_privilege('mt047_untrusted_web',p.oid,'EXECUTE'))
 THEN RAISE EXCEPTION 'RESTORED_ACL_EXPOSES_PRIVATE_INVENTORY'; END IF;
END;
$assert$;
SQL
# Mutation testing: a lost item must change the comparison, so a false-green
# round-trip cannot be produced by comparing empty or identical file paths.
snapshot "$restored_db" > "$scratch_dir/pre-corruption.json"
pg "$restored_db" <<'SQL'
ALTER TABLE inv_lab.items DISABLE TRIGGER inv_immutable_items;
DELETE FROM inv_lab.items WHERE (version_id,code)=(SELECT version_id,code FROM inv_lab.items ORDER BY version_id,code LIMIT 1);
ALTER TABLE inv_lab.items ENABLE TRIGGER inv_immutable_items;
SQL
snapshot "$restored_db" > "$scratch_dir/corrupted.json"
if cmp -s "$scratch_dir/pre-corruption.json" "$scratch_dir/corrupted.json"; then
  echo 'FAIL: data loss escaped snapshot comparison'; exit 1
fi
echo 'PASS_RESTORE_GUARDS: immutable history, sequences, private ACL and data-loss detection'
echo 'SCOPE: synthetic inventory PostgreSQL only; FULL_APP_RESTORE_VERIFIED remains false'
