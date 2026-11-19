#!/bin/sh
# Checks the model of a Family's lifecycle (familyLifecycle.qnt, #148). Run from anywhere,
# with quint 0.33.1 on the PATH (npm i -g @informalsystems/quint@0.33.1) or QUINT naming it:
#   sh spec/familyLifecycle-check.sh [scenarios|simulation|counterexample]   (without a check, all of them)
# Not run in CI: run it after changing the spec or the lifecycle commands of the Routing module.
# "No violation" from simulation is a sampling result, not a proof.
set -eu
cd "$(dirname "$0")"
QUINT="${QUINT:-quint}"
quint() { command "$QUINT" "$@"; }

scenarios() {
  for main in scenarios unlockedScenarios; do
    quint test familyLifecycle_test.qnt --backend=typescript --main="$main"
  done
}

simulation() {
  # Every command, failures, a Scheduler job and a request: safety, and a deletion begun finishes.
  quint run familyLifecycle_test.qnt --backend=typescript --main=checked --invariants safety deletionFinishes \
    --witnesses someActive someSuspended someResumed someDeletionBegun someDeleted someServed \
    --max-samples=3000 --max-steps=40
  # Deliveries only: one more delivery always makes the Family active and whole.
  quint run familyLifecycle_test.qnt --backend=typescript --main=deliveries --invariants safety deliveryFinishes \
    --witnesses someActive someServed --max-samples=3000 --max-steps=40
}

# Simulation must find `invariant` violated in `main`: the spec keeps its counterexample.
violated() {
  main="$1" invariant="$2"
  if quint run familyLifecycle_test.qnt --backend=typescript --main="$main" --invariant="$invariant" \
    --max-samples=10000 --max-steps=40 > /dev/null 2>&1; then
    echo "${main} no longer violates ${invariant}: the spec lost its counterexample." >&2
    exit 1
  fi
}

counterexample() {
  # Without the Family's lock, deliveries side by side interleave and create the Family twice.
  violated unlocked sectionsApart
  violated unlocked createdOnce
  # What the code keeps (familyLifecycle.qnt, ACCEPTED).
  violated checked nothingReachesDeleted
  violated resumes activeIsScheduled
}

case "${1:-all}" in
  scenarios|simulation|counterexample) "$1" ;;
  all) scenarios; simulation; counterexample ;;
  *) echo "Unknown check: $1 (scenarios, simulation, counterexample)" >&2; exit 2 ;;
esac
