#!/usr/bin/env bash
# Checks from the outside that the Cube serves what it should.
# With LANDING_AUTH="user:password" it also fetches the pages behind Basic Auth.
set -euo pipefail

BASE="${BASE:-https://family-agenda.cloud}"
failed=0

check() { # name, expected, actual
	if [ "$2" = "$3" ]; then
		echo "ok    $1"
	else
		echo "FAIL  $1: expected '$2', got '$3'"
		failed=1
	fi
}

status() { curl -s -o /dev/null -w '%{http_code}' --max-time 15 "$@"; }

check "http redirects to https" 308 "$(status "http://${BASE#https://}/")"
check "landing page asks for Basic Auth" 401 "$(status "$BASE/")"
check "noindex header" "noindex, nofollow" \
	"$(curl -s -o /dev/null -D - --max-time 15 "$BASE/" | tr -d '\r' | awk -F': ' 'tolower($1)=="x-robots-tag"{print $2}')"

if [ -n "${LANDING_AUTH:-}" ]; then
	check "German page" 200 "$(status -u "$LANDING_AUTH" "$BASE/")"
	check "English page" 200 "$(status -u "$LANDING_AUTH" "$BASE/en/")"
	check "stylesheet" 200 "$(status -u "$LANDING_AUTH" "$BASE/landing.css")"
fi

exit "$failed"
