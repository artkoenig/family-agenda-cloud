# Shared by the scripts in this directory. Sourced, not run.

CUBE_HOST="${CUBE_HOST:-root@family-agenda.cloud}"
CUBE_DIR="/opt/family-agenda"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/id_ed25519_family_agenda_cloud}"
SSH_OPTS=(-i "$SSH_KEY" -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new)
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cube_ssh() {
	ssh "${SSH_OPTS[@]}" "$CUBE_HOST" "$@"
}
