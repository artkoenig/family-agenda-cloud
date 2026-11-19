#!/bin/sh
# Checks the model of failover across the pool of cores (failover.qnt, #146). Run from anywhere,
# with quint 0.33.1 on the PATH (npm i -g @informalsystems/quint@0.33.1) or QUINT naming it:
#   sh spec/failover-check.sh [scenarios|simulation|counterexample]   (without a check, all of them)
# Not run in CI: run it after changing the spec or the failover of the Routing module.
# "No violation" from simulation is a sampling result, not a proof.
set -eu
cd "$(dirname "$0")"
QUINT="${QUINT:-quint}"
quint() { command "$QUINT" "$@"; }

scenarios() {
  for main in scenarios unfixedBreakRun unfixedAnswer503Run; do
    quint test failover_test.qnt --backend=typescript --main="$main"
  done
}

simulation() {
  # Replicas added, named, unnamed and stopped, cores changing state: safety.
  quint run failover_test.qnt --backend=typescript --main=checked --invariants safety \
    --witnesses someCallWentOn someCallArrivedTwice someCallEndedWithoutCore someCallFailedWhereItMayHaveRun \
    someCallWentOnPastARemovedCore --max-samples=3000 --max-steps=40
  # Core 0 serving and named throughout: liveness and the rotation.
  quint run failover_test.qnt --backend=typescript --main=steady --invariants safety reachesAServingCore spread \
    --witnesses someCallWentOn someCallArrivedTwice someCallFailedWhereItMayHaveRun --max-samples=3000 --max-steps=40
}

counterexample() {
  # Without each rule of the code, simulation must find safety violated: the spec keeps its counterexamples.
  for main in unfixedBreak unfixedAnswer503; do
    if quint run failover_test.qnt --backend=typescript --main="$main" --invariant=safety \
      --max-samples=3000 --max-steps=12 > /dev/null 2>&1; then
      echo "${main} no longer violates safety: the spec lost its counterexample." >&2
      exit 1
    fi
  done
}

case "${1:-all}" in
  scenarios|simulation|counterexample) "$1" ;;
  all) scenarios; simulation; counterexample ;;
  *) echo "Unknown check: $1 (scenarios, simulation, counterexample)" >&2; exit 2 ;;
esac
