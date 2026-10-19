-- PREPARED ONLY. Never executed by npm start, test, or a deployment build.
-- Requires separate approval for a NEW dedicated instance/database and role changes.
-- Run AFTER the three schema migrations as the isolated migration administrator.
BEGIN;
DO $$ BEGIN
 IF current_database() <> 'carefa_companion_phase3' THEN
  RAISE EXCEPTION 'Refusing role changes outside the exact proposed isolated database';
 END IF;
END $$;
CREATE ROLE carefa_companion_runtime LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION;
REVOKE ALL ON DATABASE carefa_companion_phase3 FROM PUBLIC;
GRANT CONNECT ON DATABASE carefa_companion_phase3 TO carefa_companion_runtime;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO carefa_companion_runtime;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.oauth_sessions TO carefa_companion_runtime;
GRANT SELECT,INSERT,UPDATE ON public.companion_links,public.companion_consents TO carefa_companion_runtime;
COMMIT;
-- Set the runtime role's random password only using an approved secret-management
-- procedure/private psql prompt. Never embed it in this script, shell history or chat.
-- Runtime receives no role membership, object ownership, DDL or collection-table grants.
