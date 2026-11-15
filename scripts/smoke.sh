#!/usr/bin/env bash
# Checks from the outside that the Cube serves what it should.
# With LANDING_AUTH="user:password" it also fetches the pages behind Basic Auth.
#
# SMOKE_FAMILY_ID is required: the id of an active Family kept for this check (the Operator
# creates it once with `routing create`, see docs/runbook/setup.md). Its address must answer,
# and an id no Family has must get 404 from the Router.
set -euo pipefail

BASE="${BASE:-https://family-agenda.cloud}"
APP_BASE="${APP_BASE:-https://app.family-agenda.cloud}"
# No Family has this id: the Routing module creates random (version 4) ids only.
UNKNOWN_FAMILY_ID=00000000-0000-0000-0000-000000000000
failed=0

if [ -z "${SMOKE_FAMILY_ID:-}" ]; then
	echo "Set SMOKE_FAMILY_ID to the id of the Family kept for the smoke check (docs/runbook/setup.md)." >&2
	exit 2
fi

check() { # name, expected, actual
	if [ "$2" = "$3" ]; then
		echo "ok    $1"
	else
		echo "FAIL  $1: expected '$2', got '$3'"
		failed=1
	fi
}

status() { curl -s -o /dev/null -w '%{http_code}' --max-time 15 "$@"; }

# "answers" for a status of the Family's core, a page or a redirect such as to sign-in; else "status <code>".
core_answer_or_status() { case "$1" in 2?? | 3??) echo answers ;; *) echo "status $1" ;; esac }

check "http redirects to https" 308 "$(status "http://${BASE#https://}/")"
check "landing page asks for Basic Auth" 401 "$(status "$BASE/")"
check "noindex header" "noindex, nofollow" \
	"$(curl -s -o /dev/null -D - --max-time 15 "$BASE/" | tr -d '\r' | awk -F': ' 'tolower($1)=="x-robots-tag"{print $2}')"

if [ -n "${LANDING_AUTH:-}" ]; then
	check "German page" 200 "$(status -u "$LANDING_AUTH" "$BASE/")"
	check "English page" 200 "$(status -u "$LANDING_AUTH" "$BASE/en/")"
	check "stylesheet" 200 "$(status -u "$LANDING_AUTH" "$BASE/landing.css")"
fi

check "known Family answers" answers "$(core_answer_or_status "$(status "$APP_BASE/$SMOKE_FAMILY_ID/")")"
check "unknown Family gets 404" 404 "$(status "$APP_BASE/$UNKNOWN_FAMILY_ID/")"

exit "$failed"
