#!/usr/bin/env bash
# Walks the Operator through "Setting up Logto" (docs/runbook/setup.md): the steps that need the
# console in a browser and the mailbox's password. Secrets are typed hidden and go straight into
# the Cube's .env; none is printed. Run from the repository root.
set -euo pipefail
source "$(dirname "$0")/lib.sh"

step() { printf '\n\033[1m== %s\033[0m\n' "$1"; }
wait_enter() { read -rp "Press Enter when done. " _; }

# Replaces KEY=… in the Cube's .env with the value read from stdin.
set_env() {
	cube_ssh "cd $CUBE_DIR && umask 077 && IFS= read -r v && grep -v '^$1=' .env > .env.new && printf '%s=%s\n' '$1' \"\$v\" >> .env.new && mv .env.new .env"
}

step "1/5 Console administrator"
ssh "${SSH_OPTS[@]}" -fN -o ExitOnForwardFailure=yes -L 3002:localhost:3002 "$CUBE_HOST"
trap 'pkill -f "3002:localhost:3002 $CUBE_HOST" || true' EXIT
echo "Tunnel open. Open http://localhost:3002, create the console's administrator,"
echo "and store it in the password manager."
wait_enter

step "2/5 Machine-to-machine application"
echo "Console: Applications → Create application → Machine-to-machine"
echo "  name: Family Agenda management"
echo "  then assign the role: Logto Management API access"
read -rp "App ID: " app_id
read -rsp "App secret (hidden): " app_secret; echo
printf '%s\n' "$app_id" | set_env IDP_MANAGEMENT_CLIENT_ID
printf '%s\n' "$app_secret" | set_env IDP_MANAGEMENT_CLIENT_SECRET
echo "Written to the .env."

step "3/5 logto-setup"
read -rsp "Password of no-reply@family-agenda.cloud (hidden): " smtp_password; echo
printf '%s\n' "$smtp_password" | cube_ssh "cd $CUBE_DIR && umask 077 && IFS= read -r SMTP_PASSWORD && export SMTP_PASSWORD \
	LOGTO_M2M_APP_ID=\$(sed -n 's/^IDP_MANAGEMENT_CLIENT_ID=//p' .env) \
	LOGTO_M2M_APP_SECRET=\$(sed -n 's/^IDP_MANAGEMENT_CLIENT_SECRET=//p' .env) \
	&& docker compose run -T --rm --no-deps -e LOGTO_M2M_APP_ID -e LOGTO_M2M_APP_SECRET \
		-e LOGTO_ENDPOINT=https://auth.family-agenda.cloud -e IDP_EVENTS_URL=http://router:8080/idp/events \
		-e SMTP_HOST=smtp.ionos.de -e SMTP_PORT=465 -e SMTP_USER=no-reply@family-agenda.cloud -e SMTP_PASSWORD \
		-e SMTP_FROM=no-reply@family-agenda.cloud core logto-setup > /root/logto-setup.out 2>&1; s=\$?; \
	grep -vE '^(OIDC_CLIENT_SECRET|IDP_WEBHOOK_SECRET|IDP_MANAGEMENT_CLIENT_SECRET)=' /root/logto-setup.out; exit \$s"
cube_ssh "grep -q '^Registration open' /root/logto-setup.out" || { echo "logto-setup did not open registration; see above." >&2; exit 1; }

step "4/5 Printed values into the .env"
for key in OIDC_CLIENT_ID OIDC_CLIENT_SECRET IDP_WEBHOOK_SECRET; do
	cube_ssh "sed -n 's/^$key=//p' /root/logto-setup.out" | set_env "$key"
	echo "$key written."
done
cube_ssh "rm /root/logto-setup.out"

step "5/5 Deploy"
"$(dirname "$0")/deploy.sh"
echo
client_id=$(cube_ssh "sed -n 's/^OIDC_CLIENT_ID=//p' $CUBE_DIR/.env")
echo "Done. Register (no landing-page link yet, #130):"
echo "https://auth.family-agenda.cloud/oidc/auth?client_id=$client_id&redirect_uri=https%3A%2F%2Fapp.family-agenda.cloud%2Fsso%2Fcallback&response_type=code&scope=openid%20email&first_screen=register"
echo "After the code mail, the callback may show an error; the Family exists anyway: routing families."
