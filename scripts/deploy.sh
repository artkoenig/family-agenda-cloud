#!/usr/bin/env bash
# Copies the Compose project and the landing page to the Cube and brings the services up.
# .env and key files exist only on the Cube; they are neither copied nor deleted.
set -euo pipefail
source "$(dirname "$0")/lib.sh"

RSYNC_SSH="ssh ${SSH_OPTS[*]}"

cube_ssh "test -f $CUBE_DIR/.env" || {
	echo "Missing $CUBE_DIR/.env on the Cube. See cube/.env.example." >&2
	exit 1
}

# --inplace keeps the inode of the Caddyfile, which is mounted as a single file.
rsync -rlt --delete --inplace -e "$RSYNC_SSH" \
	--exclude '.env' --exclude '*.key' --exclude '.env.example' --exclude '/site/' \
	"$REPO_ROOT/cube/" "$CUBE_HOST:$CUBE_DIR/"

rsync -rlt --delete -e "$RSYNC_SSH" --exclude '.DS_Store' \
	"$REPO_ROOT/site/" "$CUBE_HOST:$CUBE_DIR/site/"

cube_ssh "cd $CUBE_DIR && docker compose pull -q && docker compose up -d --remove-orphans \
	&& docker compose exec -T caddy caddy reload --config /etc/caddy/Caddyfile"
