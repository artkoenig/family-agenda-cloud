#!/bin/sh
# Gives the throwaway Logto a machine-to-machine app (trialm2m) with Management API access,
# without clicking through the console. Run once after `docker compose -p logto-trial up -d`.
set -eu
sql() { docker compose -p logto-trial exec -T postgres psql -U logto -d logto -At -c "$1"; }
sql "insert into applications (tenant_id,id,name,secret,type,oidc_client_metadata,custom_client_metadata)
     values ('default','trialm2m','trial m2m','trialm2msecret0123456789','MachineToMachine',
             '{\"redirectUris\":[],\"postLogoutRedirectUris\":[]}','{}')"
sql "insert into application_secrets (tenant_id,application_id,name,value)
     values ('default','trialm2m','s1','trialm2msecret0123456789')"
sql "insert into applications_roles (tenant_id,id,application_id,role_id)
     select 'default','trialm2mrole','trialm2m',id from roles
     where tenant_id='default' and name='Logto Management API access'"
