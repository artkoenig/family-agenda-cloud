#!/bin/sh
# Checks the model of the Scheduler's due work per Family (scheduler.qnt, #147). Run from anywhere,
# with quint 0.33.1 on the PATH (npm i -g @informalsystems/quint@0.33.1) or QUINT naming it:
#   sh spec/scheduler-check.sh [scenarios|simulation|counterexample]   (without a check, all of them)
# Not run in CI: run it after changing the spec or the Scheduler of the Routing module.
# "No violation" from simulation is a sampling result, not a proof.
set -eu
cd "$(dirname "$0")"
QUINT="${QUINT:-quint}"
quint() { command "$QUINT" "$@"; }

scenarios() {
  for main in scenarios unfixedExpiryRun unfixedMarginRun unfixedPolicyRun lateNotServingRun unfixedOrderRun; do
    quint test scheduler_test.qnt --backend=typescript --main="$main"
  done
}

simulation() {
  # The code: three Families, two processes of one slot, two cores. Safety and the bound on starvation.
  quint run scheduler_test.qnt --backend=typescript --main=checked --invariants safety noStarvation \
    --witnesses someRunSucceeded someRunFailed someFamilyWaitedForItsRetry someCallWentOn \
    someRetryWasPastWhenRecorded someFailedTwiceInARow someSlotsAllBusy --max-samples=500 --max-steps=400
  # The code with a process dying mid-run: its job expires and the Family is called again.
  quint run scheduler_test.qnt --backend=typescript --main=crashing --invariants safety noStarvation \
    --witnesses someProcessCrashed someJobExpired --max-samples=1000 --max-steps=300
}

counterexample() {
  # Without each rule of the code, simulation must find the property violated: the spec keeps its
  # counterexamples. lateNotServing is the code before #147's fix.
  for check in unfixedExpiry:noOverlap unfixedMargin:noOverlap unfixedPolicy:noOverlap \
    unfixedOrder:noStarvation lateNotServing:noOverlap; do
    main="${check%%:*}"; invariant="${check#*:}"
    if quint run scheduler_test.qnt --backend=typescript --main="$main" --invariant="$invariant" \
      --max-samples=1000 --max-steps=200 > /dev/null 2>&1; then
      echo "${main} no longer violates ${invariant}: the spec lost its counterexample." >&2
      exit 1
    fi
  done
}

case "${1:-all}" in
  scenarios|simulation|counterexample) "$1" ;;
  all) scenarios; simulation; counterexample ;;
  *) echo "Unknown check: $1 (scenarios, simulation, counterexample)" >&2; exit 2 ;;
esac
