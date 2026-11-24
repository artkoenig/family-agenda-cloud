#!/usr/bin/env bash
# Copies the Compose project, the Routing module's source and the landing page to the Cube, builds
# the Routing module's image there and brings the services up. The one way to deploy, a new core
# version included (the core image of cube/compose.yaml): after filling the .env nothing is done
# by hand, and the cores prepare each Family when they first open it. .env and key files exist only on the Cube; they are neither copied nor
# deleted.
set -euo pipefail
source "$(dirname "$0")/lib.sh"

RSYNC_SSH="ssh ${SSH_OPTS[*]}"

cube_ssh "test -f $CUBE_DIR/.env" || {
	echo "Missing $CUBE_DIR/.env on the Cube. See cube/.env.example." >&2
	exit 1
}
cube_ssh "test -d /var/lib/family-agenda-blobs" || {
	echo "Missing /var/lib/family-agenda-blobs on the Cube. Run scripts/bootstrap.sh." >&2
	exit 1
}

# --inplace keeps the inode of the Caddyfile, which is mounted as a single file.
rsync -rlt --delete --inplace -e "$RSYNC_SSH" \
	--exclude '.env' --exclude '*.key' --exclude '.env.example' --exclude '/site' --exclude '/routing' \
	"$REPO_ROOT/cube/" "$CUBE_HOST:$CUBE_DIR/"

rsync -rlt --delete -e "$RSYNC_SSH" --exclude '.DS_Store' \
	"$REPO_ROOT/site/" "$CUBE_HOST:$CUBE_DIR/site/"

# compose.yaml builds the Routing module from ./routing and ./site/legal, which are links in the
# repository (cube/routing, cube/site) and copies on the Cube.
rsync -rlt --delete -e "$RSYNC_SSH" \
	--exclude 'node_modules/' --exclude 'reports/' --exclude '.stryker-tmp/' --exclude '.DS_Store' \
	"$REPO_ROOT/routing/" "$CUBE_HOST:$CUBE_DIR/routing/"

# --wait returns once every service is running or healthy and the one-shot directory-database
# has finished. Then Logto gets Family Agenda's mails (routing mail-templates) and its sign-in
# screen (routing sign-in-experience), which the core's logto-setup resets on every run, with
# registration open or closed as the .env's REGISTRATION says.
cube_ssh "cd $CUBE_DIR && docker compose pull -q --ignore-buildable && docker compose build -q \
	&& docker compose up -d --wait --remove-orphans \
	&& docker compose exec -T caddy caddy reload --config /etc/caddy/Caddyfile \
	&& docker compose exec -T router routing mail-templates \
	&& docker compose exec -T router routing sign-in-experience"

# The health check (cube/health/health-check.sh): its timer every 5 minutes, and the journal that
# holds the containers' logs for 14 days. journald starts anew only when its settings changed.
# After the services, so that its first run finds the Routing module's image it runs the checker in.
cube_ssh "cd $CUBE_DIR/health \
	&& if ! cmp -s journald.conf /etc/systemd/journald.conf.d/family-agenda.conf; then \
		install -D -m 0644 journald.conf /etc/systemd/journald.conf.d/family-agenda.conf && systemctl restart systemd-journald; fi \
	&& install -m 0644 family-agenda-health.service family-agenda-health.timer /etc/systemd/system/ \
	&& systemctl daemon-reload && systemctl enable --now family-agenda-health.timer"
