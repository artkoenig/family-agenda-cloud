#!/usr/bin/env bash
# Checks that the core image cube/compose.yaml pins loads every plugin image it pins: each plugin
# is started and asked for its description, and the core image judges the plugin contract version
# it names by the core's own rule (loadProblem of @family-agenda/plugin-contract). A core does not
# load a plugin built for a newer plugin contract, and says so only in a Family's Admin area.
# Run by the Cube workflow; needs docker, jq and curl, and reaches no Cube.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$(mktemp)"
STARTED=()

cleanup() {
	rm -f "$ENV_FILE"
	if ((${#STARTED[@]} > 0)); then docker rm -f "${STARTED[@]}" >/dev/null 2>&1 || true; fi
}
trap cleanup EXIT

# Every key of cube/.env.example set to a placeholder, as the Cube workflow resolves the project.
sed -E -e 's/^([A-Z_]+)=.*/\1=placeholder/' "$REPO_ROOT/cube/.env.example" >"$ENV_FILE"
config="$(docker compose -f "$REPO_ROOT/cube/compose.yaml" --env-file "$ENV_FILE" config --format json)"

core_image="$(jq -r '.services.core.image' <<<"$config")"
# The plugin-<id> services; plugin-<id>-egress are their Egress Proxies, run from the core image.
plugins="$(jq -r '.services | to_entries[] | select(.key | test("^plugin-[a-z0-9]+$")) | "\(.key) \(.value.image)"' <<<"$config")"
if [[ -z "$plugins" ]]; then
	echo "cube/compose.yaml has no plugin-<id> service." >&2
	exit 1
fi

# The description of the plugin listening on the local port $1, once it answers.
description_of() {
	for _ in $(seq 1 30); do
		if curl -fsS --max-time 5 "http://127.0.0.1:$1/description" 2>/dev/null; then return 0; fi
		sleep 1
	done
	return 1
}

failed=0
while read -r service image; do
	container="plugin-contracts-$service-$$"
	docker run -d --name "$container" -p 127.0.0.1::8080 "$image" >/dev/null
	STARTED+=("$container")
	port="$(docker port "$container" 8080/tcp | head -n 1 | sed -E 's/.*:([0-9]+)$/\1/')"
	if ! description="$(description_of "$port")"; then
		echo "$service ($image) gave no description." >&2
		docker logs "$container" >&2 || true
		failed=1
		continue
	fi
	version="$(jq -r '.contractVersion' <<<"$description")"
	# The core's answer: empty where it loads a plugin of that version, else why it does not.
	problem="$(docker run --rm "$core_image" node --import tsx -e \
		'import("@family-agenda/plugin-contract").then((contract) => console.log(contract.loadProblem(process.argv[1]) ?? ""))' \
		"$version")"
	if [[ -n "$problem" ]]; then
		echo "$service ($image) is not loadable by $core_image: $problem" >&2
		failed=1
	else
		echo "$service: plugin contract $version, loadable"
	fi
done <<<"$plugins"

exit "$failed"
