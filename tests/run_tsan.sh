#!/usr/bin/env bash
# run_tsan.sh
# Builds the ThreadSanitizer binary and runs selected locks through it.
#
# ThreadSanitizer instruments every memory access and reports data races at
# runtime. We run it on every lock.
#
# Expected outcomes:
#   none            : TSan WILL report races (intended — it has no exclusion).
#   peterson_relaxed: TSan WILL report races (relaxed ordering is broken).
#   every other lock: TSan should be CLEAN.
#
# Usage:  tests/run_tsan.sh
# Optional environment variables:
#   ITERS      iterations per thread      (default: 50000)
#   RUNS       runs per lock              (default: 3)
#   TIMEOUT    seconds allowed per lock   (default: 120)
#
# Owner: Person A.

set -uo pipefail
cd "$(dirname "$0")/.."

TSAN_BIN="build-tsan/lock_bench"
ITERS="${ITERS:-50000}"
RUNS="${RUNS:-3}"
TIMEOUT="${TIMEOUT:-120}"

# ---- Build the TSan binary --------------------------------------------------
# Configure once, then ALWAYS run the build step. It only recompiles what has
# changed, and it makes sure we never test an out-of-date binary.
if [ ! -f build-tsan/CMakeCache.txt ]; then
    cmake -S . -B build-tsan -DENABLE_TSAN=ON -DCMAKE_BUILD_TYPE=Debug
fi
cmake --build build-tsan || exit 1

echo ""
echo "=== ThreadSanitizer run ==="
echo "Binary : $TSAN_BIN"
echo "Iters  : $ITERS per thread, $RUNS runs per lock"
echo ""

# Set to 1 if a lock that should be CLEAN shows a race or times out.
FAILED=0

# Helper: run one lock and summarise what TSan said.
run_tsan_lock() {
    local lock="$1"
    local threads="$2"
    local label="$3"  # expected: CLEAN or RACY
    local iters="$4"  # iterations per thread for this lock

    echo "--- $lock ($threads threads, $iters iters, expected: $label) ---"

    # TSan writes its reports to stderr. Capture both stdout and stderr.
    local out
    local status=0
    out=$(timeout "$TIMEOUT" "$TSAN_BIN" --lock "$lock" --threads "$threads" \
                      --iters "$iters" --runs "$RUNS" --no-header 2>&1) || status=$?

    if [ "$status" -eq 124 ]; then
        echo "  TIMEOUT after ${TIMEOUT}s"
        FAILED=1
    fi

    if echo "$out" | grep -q "ThreadSanitizer"; then
        echo "  TSan: DATA RACE DETECTED"
        if [ "$label" = "CLEAN" ]; then
            FAILED=1
        fi
    else
        echo "  TSan: no races reported"
    fi

    # Also print the correctness column summary.
    local bad
    bad=$(echo "$out" | grep -v "ThreadSanitizer" | awk -F, '$10 == "false"' | wc -l)
    echo "  Correctness: $bad of $RUNS runs incorrect"
    echo ""
}

# peterson_relaxed gets far fewer iterations: under TSan a racy program is
# extremely slow (TSan checks and de-duplicates race reports on almost every
# access; 10000 iterations take about 8 s instead of 9 ms for seq_cst
# peterson). The race is reported within the first iterations anyway.
RELAXED_ITERS=2000

run_tsan_lock "none"              4 "RACY"  "$ITERS"
run_tsan_lock "mutex"             4 "CLEAN" "$ITERS"
run_tsan_lock "peterson"          2 "CLEAN" "$ITERS"
run_tsan_lock "peterson_relaxed"  2 "RACY"  "$RELAXED_ITERS"
run_tsan_lock "bakery"            4 "CLEAN" "$ITERS"
run_tsan_lock "tas"               4 "CLEAN" "$ITERS"
run_tsan_lock "ttas"              4 "CLEAN" "$ITERS"
run_tsan_lock "ticket"            4 "CLEAN" "$ITERS"
run_tsan_lock "semaphore"         4 "CLEAN" "$ITERS"
run_tsan_lock "atomic"            4 "CLEAN" "$ITERS"

if [ $FAILED -ne 0 ]; then
    echo "=== TSan run FAILED: a lock expected to be CLEAN raced or timed out ==="
    exit 1
fi
echo "=== TSan run complete: all results as expected ==="
exit 0
