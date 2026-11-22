#!/bin/sh
# Checks the model of tenant isolation in routing and egress (tenantIsolation.qnt, #149). Run from
# anywhere, with quint 0.33.1 on the PATH (npm i -g @informalsystems/quint@0.33.1) or QUINT naming it:
#   sh spec/tenantIsolation-check.sh [scenarios|simulation|counterexample]   (without a check, all of them)
# Not run in CI: run it after changing the spec or how the Routing module finds a Family.
# "No violation" from simulation is a sampling result, not a proof.
set -eu
cd "$(dirname "$0")"
QUINT="${QUINT:-quint}"
quint() { command "$QUINT" "$@"; }

scenarios() {
  for main in scenarios headerTrustedRun ticketAnyFamilyRun; do
    quint test tenantIsolation_test.qnt --backend=typescript --main="$main"
  done
}

simulation() {
  # 3 Families, 2 cores, requests and runs, Families suspended, resumed and deleted: safety.
  quint run tenantIsolation_test.qnt --backend=typescript --main=checked --invariants safety \
    --witnesses someCallRefused someCoreWorked somePluginCalled someHostOpened someCoreClosed \
    someDatabaseDropped someWorkAfterSuspend someWorkAfterDelete someHostOpenedAfterStop \
    --max-samples=3000 --max-steps=40
}

counterexample() {
  # The finding, and each rule of the code left out: simulation must find the property violated.
  for check in checked:noActAfterStop headerTrusted:isolation noStatusCheck:noContextWhenInactive \
    ticketAnyFamily:ticketIsolation; do
    main="${check%%:*}"; invariant="${check#*:}"
    if quint run tenantIsolation_test.qnt --backend=typescript --main="$main" --invariant="$invariant" \
      --max-samples=3000 --max-steps=30 > /dev/null 2>&1; then
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
