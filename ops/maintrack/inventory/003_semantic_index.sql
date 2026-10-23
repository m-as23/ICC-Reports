-- Private additive cache only: stock rows and version approval remain unchanged.
BEGIN;
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;
CREATE TABLE IF NOT EXISTS inv_lab.semantic_documents(
 model text NOT NULL,hash text NOT NULL CHECK(hash ~ '^[a-f0-9]{64}$'),
 embedding extensions.vector(256),PRIMARY KEY(model,hash)
);
CREATE TABLE IF NOT EXISTS inv_lab.semantic_versions(
 version_id bigint NOT NULL REFERENCES inv_lab.versions(id),model text NOT NULL,
 token uuid,lease_until timestamptz,ready boolean NOT NULL DEFAULT false,
 PRIMARY KEY(version_id,model)
);
CREATE TABLE IF NOT EXISTS inv_lab.semantic_items(
 version_id bigint NOT NULL,code text NOT NULL,model text NOT NULL,hash text NOT NULL,
 PRIMARY KEY(version_id,model,code),
 FOREIGN KEY(version_id,code) REFERENCES inv_lab.items(version_id,code),
 FOREIGN KEY(model,hash) REFERENCES inv_lab.semantic_documents(model,hash)
);
ALTER TABLE inv_lab.semantic_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE inv_lab.semantic_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE inv_lab.semantic_items ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON inv_lab.semantic_documents,inv_lab.semantic_versions,inv_lab.semantic_items FROM PUBLIC;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN REVOKE ALL ON inv_lab.semantic_documents,inv_lab.semantic_versions,inv_lab.semantic_items FROM anon; END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN REVOKE ALL ON inv_lab.semantic_documents,inv_lab.semantic_versions,inv_lab.semantic_items FROM authenticated; END IF;
END $$;
COMMIT;
