-- Run by the directory-database service on every deploy, as the superuser over the local socket.
-- Idempotent: it creates what is missing and sets the Routing module's password from the .env, so
-- that changing DIRECTORY_DATABASE_PASSWORD and deploying again rotates it.

-- The Routing module's role: it owns the Directory and creates each Family's database and role
-- (CREATEDB, CREATEROLE), but is no superuser.
SELECT 'CREATE ROLE routing' WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'routing') \gexec
ALTER ROLE routing LOGIN CREATEDB CREATEROLE NOSUPERUSER PASSWORD :'password';

SELECT 'CREATE DATABASE directory OWNER routing' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'directory') \gexec

-- The cores' role for registration: it owns the one database every core shares for the Identity
-- Provider's processed events and the pending family.created deliveries, and nothing else.
SELECT 'CREATE ROLE registration' WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'registration') \gexec
ALTER ROLE registration LOGIN NOCREATEDB NOCREATEROLE NOSUPERUSER PASSWORD :'registration_password';

SELECT 'CREATE DATABASE registration OWNER registration' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'registration') \gexec

-- Logto's role: it owns Logto's database, and creates the roles Logto's tables are guarded with
-- (logto_tenant_*), over which alone it has a say. `db seed` refuses to run without CREATEROLE.
SELECT 'CREATE ROLE logto' WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'logto') \gexec
ALTER ROLE logto LOGIN NOCREATEDB CREATEROLE NOSUPERUSER PASSWORD :'logto_password';

SELECT 'CREATE DATABASE logto OWNER logto' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'logto') \gexec

-- A Family's role connects to its own database only. Logto's database keeps PUBLIC's CONNECT: the
-- logto_tenant_* roles `db seed` creates connect with it; its tables grant PUBLIC nothing.
REVOKE ALL ON DATABASE directory FROM PUBLIC;
REVOKE ALL ON DATABASE registration FROM PUBLIC;
REVOKE ALL ON DATABASE postgres FROM PUBLIC;

-- The image set the superuser's password from POSTGRES_PASSWORD on its first start; without it the
-- superuser is reachable over the local socket alone, which only this service mounts.
ALTER ROLE postgres PASSWORD NULL;
