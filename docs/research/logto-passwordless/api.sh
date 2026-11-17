#!/bin/sh
# Calls Logto's Management API as the trial's machine-to-machine app: api.sh METHOD PATH [JSON]
set -eu
BASE=${LOGTO:-http://localhost:3201}
TOKEN=$(curl -s -u "${M2M_ID:-trialm2m}:${M2M_SECRET:-trialm2msecret0123456789}" "$BASE/oidc/token" \
  -d grant_type=client_credentials -d resource=https://default.logto.app/api -d scope=all | sed 's/.*"access_token":"\([^"]*\)".*/\1/')
curl -s -X "$1" "$BASE$2" -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' ${3:+-d "$3"}
