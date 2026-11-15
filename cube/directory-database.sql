-- Run by the directory-database service on every deploy, as the superuser over the local socket.
-- Idempotent: it creates what is missing and sets the Routing module's password from the .env, so
-- that changing DIRECTORY_DATABASE_PASSWORD and deploying again rotates it.

-- The Routing module's role: it owns the Directory and creates each Family's database and role
-- (CREATEDB, CREATEROLE), but is no superuser.
SELECT 'CREATE ROLE routing' WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'routing') \gexec
ALTER ROLE routing LOGIN CREATEDB CREATEROLE NOSUPERUSER PASSWORD :'password';

SELECT 'CREATE DATABASE directory OWNER routing' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'directory') \gexec

-- A Family's role connects to its own database only.
REVOKE ALL ON DATABASE directory FROM PUBLIC;
REVOKE ALL ON DATABASE postgres FROM PUBLIC;

-- The image set the superuser's password from POSTGRES_PASSWORD on its first start; without it the
-- superuser is reachable over the local socket alone, which only this service mounts.
ALTER ROLE postgres PASSWORD NULL;
