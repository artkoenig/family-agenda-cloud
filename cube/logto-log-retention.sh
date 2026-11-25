#!/usr/bin/env bash
# Deletes Logto's sign-in log older than 30 days (logto-log-retention.sql), once a day: the
# logto-log-retention service of cube/compose.yaml runs it as Logto's role over Postgres's local
# socket, which libpq's PG* variables name. With --once it runs once and exits with its result.
#
# Logto 1.46.0 itself never deletes from its `logs` table, and has no setting for it: no code of
# packages/core or packages/cli deletes from it (its queries are packages/core/src/queries/log.ts,
# which inserts, counts and finds only), and no alteration of packages/schemas/alterations adds a
# job. The `auditLogsRetentionDays` of packages/core/src/utils/subscription/types.ts is a quota
# of Logto Cloud's subscription plans; nothing in packages/core deletes by it.
#
# Every run writes one JSON line: level `info` with the number of rows deleted, or level `error`
# with psql's message, which the health cron's rule for JSON logs reports (#208). After an error it
# tries again in an hour, after a success in a day.
#
# At its start it first waits for Postgres, up to five minutes: after a reboot of the host Docker
# starts every container at once, as `depends_on` holds for `docker compose up` only. --once does
# not wait.
set -uo pipefail

SQL=${LOGTO_LOG_RETENTION_SQL:-/logto-log-retention.sql}
DAY=86400
HOUR=3600
WAIT=${LOGTO_LOG_RETENTION_WAIT:-300}

json_string() {
	local text=${1//\\/\\\\}
	text=${text//\"/\\\"}
	text=${text//$'\n'/ }
	text=${text//$'\t'/ }
	text=${text//$'\r'/ }
	printf '"%s"' "$text"
}

log() {
	local level=$1 message=$2 fields=$3
	printf '{"time":"%s","level":"%s","message":%s,%s}\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$level" "$(json_string "$message")" "$fields"
}

prune() {
	local output
	output=$(psql -X -q -At -v ON_ERROR_STOP=1 -f "$SQL" 2>&1)
	local status=$?
	if [[ $status -eq 0 && $output =~ ^[0-9]+$ ]]; then
		log info "Deleted Logto's sign-in log older than 30 days" "\"deleted\":$output"
	else
		log error "Could not delete Logto's sign-in log older than 30 days" "\"error\":$(json_string "$output")"
		return 1
	fi
}

if [[ ${1:-} == --once ]]; then
	prune
	exit
fi

pause() {
	sleep "$1" &
	wait $!
}

# A Postgres that stays away is left to prune, which logs it as an error.
wait_for_postgres() {
	local deadline=$((SECONDS + WAIT))
	until pg_isready -q || ((SECONDS >= deadline)); do
		pause 1
	done
}

# As the container's first process, bash would ignore `docker stop`'s TERM: it ends the wait.
trap 'exit 0' TERM INT
wait_for_postgres
while true; do
	if prune; then pause "$DAY"; else pause "$HOUR"; fi
done
