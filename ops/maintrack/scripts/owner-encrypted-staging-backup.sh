#!/usr/bin/env bash
# Owner-initiated, encrypted local staging DB export. NO default execution.
# Requires locally configured PostgreSQL read-capable backup credentials and age.
set -Eeuo pipefail
umask 077
REF='tdnkeskczcsukcujwinu'
if [[ "${MAINTRACK_BACKUP_CONSENT:-}" != 'ALLOW_ENCRYPTED_STAGING_DB_EXPORT' ]]; then
  echo 'BLOCKED: explicit local owner backup consent required' >&2; exit 3
fi
for key in PGHOST PGUSER PGDATABASE PGPASSWORD AGE_BACKUP_RECIPIENT BACKUP_OUTPUT_DIRECTORY; do
  if [[ -z "${!key:-}" ]]; then
    echo "BLOCKED: missing non-logged configuration: ${key}" >&2; exit 3
  fi
done
if [[ "$PGHOST" != "db.${REF}.supabase.co" && "$PGUSER" != *"${REF}"* ]]; then
  echo 'BLOCKED: configured database does not identify the reviewed Staging project' >&2; exit 3
fi
if [[ "$AGE_BACKUP_RECIPIENT" != age1* ]]; then
  echo 'BLOCKED: a public age X25519 recipient is required' >&2; exit 3
fi
for executable in pg_dump age; do
  if ! command -v "$executable" >/dev/null 2>&1; then
    echo "BLOCKED: install ${executable}" >&2; exit 3
  fi
done
mkdir -p -m 700 -- "$BACKUP_OUTPUT_DIRECTORY"
backupdir="$(cd "$BACKUP_OUTPUT_DIRECTORY" && pwd -P)"
repo="$(git rev-parse --show-toplevel 2>/dev/null || true)"
if [[ -n "$repo" ]]; then
  case "$backupdir/" in "$repo/"*) echo 'BLOCKED: backup cannot be written inside a Git repository' >&2; exit 3;; esac
fi
name="maintrack-staging-$(date -u +%Y%m%dT%H%M%SZ).pgdump.age"
tmp="$backupdir/.${name}.incomplete"
final="$backupdir/${name}"
if [[ -e "$tmp" || -e "$final" ]];then
  echo 'BLOCKED: backup output already exists' >&2; exit 3
fi
trap 'rm -f -- "$tmp"' EXIT
# pg_dump uses PGHOST/PGUSER/PGDATABASE/PGPASSWORD only from the local environment.
# Plaintext database content flows only through an encrypted Unix pipe.
pg_dump --format=custom --no-owner --no-privileges \
 | age -r "$AGE_BACKUP_RECIPIENT" -o "$tmp"
test -s "$tmp" || { echo 'BLOCKED: zero-byte encrypted backup' >&2; exit 3; }
chmod 600 "$tmp"
mv -n -- "$tmp" "$final"
trap - EXIT
echo 'PASS: encrypted local backup created. Offsite upload and actual restore verification STILL REQUIRED.'
echo "Ciphertext path: $final"
