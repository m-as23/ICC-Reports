-- MainTrack v0.4.7: disposable PostgreSQL integration contract (NO linked Supabase).
-- Mirrors ONLY confirmed MainTrack-Staging column types. The transaction ALWAYS
-- rolls back; real user data, tokens, secrets and employee accounts are forbidden.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE TYPE public.mt_role AS ENUM ('owner','engineer','technician');
CREATE TABLE public.mt_users (
 id uuid PRIMARY KEY,
 role public.mt_role NOT NULL,
 active boolean NOT NULL DEFAULT true,
 must_change boolean NOT NULL DEFAULT false,
 token_version integer NOT NULL DEFAULT 1
);
CREATE TABLE public.mt_sessions (
 token_hash text PRIMARY KEY,
 user_id uuid NOT NULL REFERENCES public.mt_users(id),
 expires_at timestamptz NOT NULL,
 token_version integer NOT NULL
);
INSERT INTO public.mt_users(id,role,active,must_change,token_version) VALUES
 ('00000000-0000-4000-8000-000000000001','owner',true,false,1),
 ('00000000-0000-4000-8000-000000000002','engineer',true,false,1),
 ('00000000-0000-4000-8000-000000000003','technician',true,false,1),
 ('00000000-0000-4000-8000-000000000004','owner',false,false,1),
 ('00000000-0000-4000-8000-000000000005','owner',true,true,1),
 ('00000000-0000-4000-8000-000000000006','owner',true,false,2),
 ('00000000-0000-4000-8000-000000000007','owner',true,false,1);
INSERT INTO public.mt_sessions(token_hash,user_id,expires_at,token_version)
SELECT encode(digest(repeat(n.ch,64),'sha256'),'hex'),
       ('00000000-0000-4000-8000-00000000000'||n.id)::uuid,
       CASE WHEN n.id=7 THEN now()-interval '1 hour' ELSE now()+interval '1 hour' END,
       1
FROM (VALUES(1,'a'),(2,'b'),(3,'c'),(4,'d'),(5,'e'),(6,'f'),(7,'7')) AS n(id,ch);
-- Select matches the production candidate session adapter's actual SQL predicate.
CREATE TEMP VIEW synthetic_verified AS
SELECT s.token_hash,u.id::text AS user_id,u.role::text AS role,u.active,
       u.must_change AS must_change
FROM public.mt_sessions s INNER JOIN public.mt_users u ON u.id=s.user_id
WHERE s.expires_at>now() AND s.token_version=u.token_version AND u.active=true;
DO $contract$
DECLARE v integer;
BEGIN
 SELECT count(*) INTO v FROM synthetic_verified;
 IF v<>4 THEN RAISE EXCEPTION 'SESSION_VALIDITY_BROKEN expected=4 got=%',v; END IF;
 SELECT count(*) INTO v FROM synthetic_verified WHERE must_change=false;
 IF v<>3 THEN RAISE EXCEPTION 'PASSWORD_RESET_MUST_BLOCK expected=3 got=%',v; END IF;
 SELECT count(*) INTO v FROM synthetic_verified WHERE role='owner' AND must_change=false;
 IF v<>1 THEN RAISE EXCEPTION 'OWNER_ROLE_SPOOFING_RISK expected=1 got=%',v; END IF;
 SELECT count(*) INTO v FROM synthetic_verified WHERE role IN ('engineer','technician') AND must_change=false;
 IF v<>2 THEN RAISE EXCEPTION 'ENGINEER_TECHNICIAN_ROLE_DRIFT expected=2 got=%',v; END IF;
 RAISE NOTICE 'PASS: 3 active eligible sessions; disabled, expired, token-version mismatch and must-change cases denied';
END
$contract$;
-- Password reset or explicit server revocation invalidates a previously valid owner token.
UPDATE public.mt_users SET token_version=token_version+1
WHERE id='00000000-0000-4000-8000-000000000001';
DO $contract$
DECLARE v integer;
BEGIN
 SELECT count(*) INTO v FROM synthetic_verified WHERE role='owner' AND must_change=false;
 IF v<>0 THEN RAISE EXCEPTION 'REVOKED_OWNER_SESSION_ACCEPTED'; END IF;
 SELECT count(*) INTO v FROM synthetic_verified WHERE must_change=false;
 IF v<>2 THEN RAISE EXCEPTION 'SCOPE_WIDENED_AFTER_REVOKE'; END IF;
 RAISE NOTICE 'PASS: owner session revoked immediately on token_version change';
END
$contract$;
ROLLBACK;
