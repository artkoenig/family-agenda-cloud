#!/usr/bin/env bash
# The health check of the Cube (#208, docs/adr/0003), every 5 minutes by family-agenda-health.timer,
# which scripts/deploy.sh installs. It collects the journal of the Docker daemon and its containers
# since the last run (the journald log driver of cube/compose.yaml) and each container's state, and
# hands both to the checker (routing/src/health-checker.ts) in the Routing module's image, run with
# no docker.sock, no journal, no network and read-only. The checker's rule file
# (routing/src/health-rules.ts) says which lines are errors; it writes at most one digest mail.
#
# This script sends that mail through the mailbox support@family-agenda.cloud (SMTP_* of the .env)
# to OPERATOR_ALERT_ADDRESS, and only then keeps the checker's state and the journal's cursor, so
# that a run whose mail fails is checked again in the next. Every run ends with a ping to
# HEALTH_HEARTBEAT_URL (healthchecks.io), a run that fails, its mail included, with one to its
# /fail instead: healthchecks.io mails the Operator when the pings stop or fail.
#
# The state lies in /var/lib/family-agenda-health, root's alone. HEALTH_ENV_FILE, HEALTH_STATE_DIR
# and HEALTH_CHECKER_IMAGE are for its test (routing/test/health-check-script.test.ts).
set -euo pipefail

ENV_FILE=${HEALTH_ENV_FILE:-/opt/family-agenda/.env}
STATE_DIR=${HEALTH_STATE_DIR:-/var/lib/family-agenda-health}
IMAGE=${HEALTH_CHECKER_IMAGE:-family-agenda-routing:local}
PROJECT=family-agenda
MAIL_FROM=support@family-agenda.cloud
# On the first run, or when the cursor is lost: the last quarter of an hour.
FIRST_SINCE=-15min

# A key of the .env, without the quotes around it; the default when it is not set or empty.
env_value() {
	local value
	value=$(sed -n "s/^$1=//p" "$ENV_FILE" | tail -n 1)
	value=${value%$'\r'}
	if [[ $value =~ ^\'(.*)\'$ || $value =~ ^\"(.*)\"$ ]]; then
		value=${BASH_REMATCH[1]}
	fi
	printf '%s' "${value:-${2:-}}"
}

log() {
	printf '{"time":"%s","level":"%s","message":"%s"}\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$1" "$2"
}

HEARTBEAT=
WORK=

# healthchecks.io: the URL for a run that went well, <URL>/fail for one that did not.
ping_heartbeat() {
	[[ -n $HEARTBEAT ]] || return 0
	curl -fsS -m 10 --retry 3 -o /dev/null --url "$HEARTBEAT$1" || log error "Could not ping the heartbeat"
}

finish() {
	local status=$?
	[[ -n $WORK ]] && rm -rf "$WORK"
	if [[ $status -eq 0 ]]; then
		ping_heartbeat ""
	else
		log error "The health check failed"
		ping_heartbeat /fail
	fi
	exit "$status"
}
trap finish EXIT

# The state of each container of the project, of docker inspect's: only what the checker needs,
# no environment and no labels but the service's. A container without a healthcheck has no Health at
# all, which `index` takes and `.State.Health` does not (Docker 29).
CONTAINER_FORMAT='{"id":{{json .Id}},"name":{{json .Name}},"service":{{json (index .Config.Labels "com.docker.compose.service")}},"status":{{json .State.Status}},"health":{{with index .State "Health"}}{{json .Status}}{{else}}""{{end}},"restartCount":{{.RestartCount}},"restartPolicy":{{json .HostConfig.RestartPolicy.Name}},"exitCode":{{.State.ExitCode}}}'

collect() {
	local since=(--since "$FIRST_SINCE")
	if [[ -s $STATE_DIR/cursor ]]; then
		since=(--after-cursor "$(<"$STATE_DIR/cursor")")
	fi
	docker ps -aq --no-trunc --filter "label=com.docker.compose.project=$PROJECT" | xargs -r docker inspect --format "$CONTAINER_FORMAT"
	journalctl -u docker.service -o json --no-pager "${since[@]}" \
		--output-fields=MESSAGE,CONTAINER_NAME,COM_DOCKER_COMPOSE_SERVICE
}

# Through the mailbox's SMTP server with TLS; the credentials go to curl on stdin, not as arguments.
send_mail() {
	local host port user password scheme=smtp
	host=$(env_value SMTP_HOST smtp.ionos.de)
	port=$(env_value SMTP_PORT 465)
	user=$(env_value SMTP_USER "$MAIL_FROM")
	password=$(env_value SMTP_PASSWORD)
	[[ -n $password ]] || { log error "SMTP_PASSWORD is not set in $ENV_FILE"; return 1; }
	[[ $port == 465 ]] && scheme=smtps
	local credentials="$user:$password"
	credentials=${credentials//\\/\\\\}
	credentials=${credentials//\"/\\\"}
	curl -sS -m 60 --ssl-reqd --url "$scheme://$host:$port" --mail-from "$MAIL_FROM" --mail-rcpt "$ALERT_ADDRESS" \
		--upload-file "$WORK/out/mail.txt" -K - <<<"user = \"$credentials\""
}

HEARTBEAT=$(env_value HEALTH_HEARTBEAT_URL)
ALERT_ADDRESS=$(env_value OPERATOR_ALERT_ADDRESS)
[[ -n $HEARTBEAT ]] || { log error "HEALTH_HEARTBEAT_URL is not set in $ENV_FILE"; exit 1; }
[[ -n $ALERT_ADDRESS ]] || { log error "OPERATOR_ALERT_ADDRESS is not set in $ENV_FILE"; exit 1; }

install -d -m 0700 "$STATE_DIR"
WORK=$(mktemp -d)
mkdir "$WORK/out"
collect >"$WORK/input"

OPERATOR_ALERT_ADDRESS=$ALERT_ADDRESS docker run --rm -i --network none --read-only --tmpfs /tmp \
	--user 0:0 --cap-drop ALL --security-opt no-new-privileges -e OPERATOR_ALERT_ADDRESS \
	-v "$STATE_DIR:/state:ro" -v "$WORK/out:/out" \
	--entrypoint node "$IMAGE" --import tsx src/health-main.ts /state /out <"$WORK/input"

if [[ -f $WORK/out/mail.txt ]]; then
	send_mail
	log info "Mailed the health check's findings to the Operator"
fi
install -m 0600 "$WORK/out/state.json" "$STATE_DIR/state.json"
if [[ -f $WORK/out/cursor ]]; then
	install -m 0600 "$WORK/out/cursor" "$STATE_DIR/cursor"
fi
