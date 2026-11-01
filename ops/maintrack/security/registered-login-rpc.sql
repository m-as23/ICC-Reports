-- Local candidate RPC boundary. Owner must be a reviewed NOLOGIN/NOBYPASSRLS role
-- owning ONLY this private schema. No public EXECUTE or installer-supplied broad grant.
-- Deployment MUST attest function/table owners before selectively granting runtime.
CREATE FUNCTION mt_registered_identity.invitation_lookup(h text)
RETURNS TABLE(id uuid,employee_code text,epoch integer) LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT p.id,p.employee_code,p.epoch FROM mt_registered_identity.invitation i JOIN mt_registered_identity.principal p ON p.id=i.principal WHERE i.token_hash=h AND i.epoch=p.epoch AND i.expires>now() AND p.enabled
$$;
CREATE FUNCTION mt_registered_identity.credential_lookup(k text,code text)
RETURNS TABLE(id text,principal uuid,public_key bytea,counter bigint,epoch integer) LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT c.id,c.principal,c.public_key,c.counter,p.epoch FROM mt_registered_identity.credential c JOIN mt_registered_identity.principal p ON p.id=c.principal WHERE c.id=k AND p.employee_code=code AND NOT c.revoked AND p.enabled
$$;
CREATE FUNCTION mt_registered_identity.register_credential(h text,e integer,k text,pub bytea,n bigint)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE p mt_registered_identity.principal%ROWTYPE;
BEGIN
 SELECT u.* INTO p FROM mt_registered_identity.invitation i JOIN mt_registered_identity.principal u ON u.id=i.principal WHERE i.token_hash=h AND i.epoch=u.epoch AND i.expires>now() AND u.enabled FOR UPDATE OF u,i;
 IF NOT FOUND OR p.epoch<>e OR length(k)>1400 OR octet_length(pub)>4096 OR n<0 THEN RAISE EXCEPTION 'IDENTITY_REJECTED';END IF;
 IF (SELECT count(*) FROM mt_registered_identity.credential c WHERE c.principal=p.id AND NOT c.revoked)>=2 THEN RAISE EXCEPTION 'DEVICE_LIMIT';END IF;
 INSERT INTO mt_registered_identity.credential(id,principal,public_key,counter) VALUES(k,p.id,pub,n);
 DELETE FROM mt_registered_identity.invitation i WHERE i.principal=p.id;RETURN p.id;
END $$;
CREATE FUNCTION mt_registered_identity.consume_proof(k text,e integer,nonce_value text,expiry_ms bigint,old_n bigint,new_n bigint)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE c mt_registered_identity.credential%ROWTYPE;p mt_registered_identity.principal%ROWTYPE;
BEGIN
 -- Always lock principal before credential, matching operator register/recovery order.
 SELECT u.* INTO p FROM mt_registered_identity.principal u JOIN mt_registered_identity.credential x ON x.principal=u.id WHERE x.id=k FOR UPDATE OF u NOWAIT;
 IF NOT FOUND OR NOT p.enabled OR p.epoch<>e THEN RAISE EXCEPTION 'IDENTITY_REJECTED';END IF;
 SELECT x.* INTO c FROM mt_registered_identity.credential x WHERE x.id=k FOR UPDATE;
 IF NOT FOUND OR c.revoked OR c.counter<>old_n OR new_n<old_n OR nonce_value !~ '^[a-f0-9]{32}$' OR to_timestamp(expiry_ms/1000.0)<=clock_timestamp() OR to_timestamp(expiry_ms/1000.0)>clock_timestamp()+interval '2 minutes' THEN RAISE EXCEPTION 'IDENTITY_REJECTED';END IF;
 DELETE FROM mt_registered_identity.used_proof u WHERE u.principal=p.id AND u.expires<=now();
 IF (SELECT count(*) FROM mt_registered_identity.used_proof u WHERE u.principal=p.id)>=16 THEN RAISE EXCEPTION 'PRINCIPAL_PROOF_LIMIT';END IF;
 INSERT INTO mt_registered_identity.used_proof VALUES(p.id,nonce_value,to_timestamp(expiry_ms/1000.0)) ON CONFLICT DO NOTHING;
 IF NOT FOUND THEN RAISE EXCEPTION 'IDENTITY_REPLAY';END IF;
 UPDATE mt_registered_identity.credential SET counter=new_n WHERE id=k;RETURN true;
END $$;
CREATE FUNCTION mt_registered_identity.assert_current(k text,pid uuid,e integer)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 PERFORM p.id FROM mt_registered_identity.principal p WHERE p.id=pid AND p.epoch=e AND p.enabled FOR SHARE OF p;
 IF NOT FOUND THEN RETURN false;END IF;
 PERFORM c.id FROM mt_registered_identity.credential c WHERE c.id=k AND c.principal=pid AND NOT c.revoked FOR SHARE OF c;
 RETURN FOUND;
END $$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA mt_registered_identity FROM PUBLIC;
-- No operator invitation/revoke RPC. Operator uses separately authorized SQL identity.
-- No cross-schema access, session issuance, cleanup, role changes or dynamic SQL.
