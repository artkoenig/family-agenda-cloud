#!/usr/bin/env bash
# One-time setup of a fresh Cube (Debian): Docker, unattended upgrades, SSH with keys only,
# and the directory of the Compose project. Safe to run again.
set -euo pipefail
source "$(dirname "$0")/lib.sh"

cube_ssh 'bash -s' <<'REMOTE'
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive

apt-get update -q
apt-get install -y -q ca-certificates curl rsync unattended-upgrades

# Docker from Docker's own apt repository.
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc
. /etc/os-release
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/debian $VERSION_CODENAME stable" \
	> /etc/apt/sources.list.d/docker.list
apt-get update -q
apt-get install -y -q docker-ce docker-ce-cli containerd.io docker-compose-plugin

# Security updates on their own, reboot at 04:00 when one asks for it.
cat > /etc/apt/apt.conf.d/20auto-upgrades <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
EOF
cat > /etc/apt/apt.conf.d/52family-agenda <<'EOF'
Unattended-Upgrade::Automatic-Reboot "true";
Unattended-Upgrade::Automatic-Reboot-Time "04:00";
EOF

# SSH with keys only.
cat > /etc/ssh/sshd_config.d/60-family-agenda.conf <<'EOF'
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin prohibit-password
EOF
sshd -t
systemctl reload ssh

install -m 0700 -d /opt/family-agenda
# Where the blob-mount service mounts the bucket of the Families' blobs (cube/compose.yaml). Root's,
# so that a core cannot write blobs onto the Cube's disk while the bucket is not mounted.
install -m 0755 -d /var/lib/family-agenda-blobs

docker --version
docker compose version
REMOTE
