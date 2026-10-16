#!/usr/bin/env bash
# run_tsan.sh
# Builds the ThreadSanitizer binary and runs selected locks through it.
#
# ThreadSanitizer instruments every memory access and reports data races at
# runtime. We run it on:
#   - peterson / peterson_relaxed (Person A's locks)
#   - bakery                      (Person A's lock)
#   - none                        (expected to show races)
#
# Expected outcomes:
#   none            : TSan WILL report races (intended — it has no exclusion).
#   peterson        : TSan should be CLEAN (seq_cst is correct).
#   peterson_relaxed: TSan WILL report races (relaxed ordering is broken).
#   bakery          : TSan should be CLEAN.
#
# Usage:  tests/run_tsan.sh
# Optional environment variables:
#   TSAN_BIN   path to the TSan binary    (default: build-tsan/lock_bench)
#   ITERS      iterations per thread      (default: 50000)
#   RUNS       runs per lock              (default: 3)
#
# Owner: Person A.

set -uo pipefail
cd "$(dirname "$0")/.."

TSAN_BIN="${TSAN_BIN:-build-tsan/lock_bench}"
ITERS="${ITERS:-50000}"
RUNS="${RUNS:-3}"

# ---- Build the TSan binary if it does not exist yet -------------------------
if [ ! -x "$TSAN_BIN" ]; then
    echo "TSan binary not found at $TSAN_BIN — building now..."
    cmake -S . -B build-tsan -DENABLE_TSAN=ON -DCMAKE_BUILD_TYPE=Debug
    cmake --build build-tsan
fi

echo ""
echo "=== ThreadSanitizer run ==="
echo "Binary : $TSAN_BIN"
echo "Iters  : $ITERS per thread, $RUNS runs per lock"
echo ""

# Helper: run one lock and summarise what TSan said.
run_tsan_lock() {
    local lock="$1"
    local threads="$2"
    local label="$3"  # expected: CLEAN or RACY

    echo "--- $lock ($threads threads, expected: $label) ---"

    # TSan writes its reports to stderr. Capture both stdout and stderr.
    local out
    out=$("$TSAN_BIN" --lock "$lock" --threads "$threads" \
                      --iters "$ITERS" --runs "$RUNS" --no-header 2>&1)

    if echo "$out" | grep -q "ThreadSanitizer"; then
        echo "  TSan: DATA RACE DETECTED"
    else
        echo "  TSan: no races reported"
    fi

    # Also print the correctness column summary.
    local bad
    bad=$(echo "$out" | grep -v "ThreadSanitizer" | awk -F, '$10 == "false"' | wc -l)
    echo "  Correctness: $bad of $RUNS runs incorrect"
    echo ""
}

run_tsan_lock "none"              4 "RACY"
run_tsan_lock "peterson"          2 "CLEAN"
run_tsan_lock "peterson_relaxed"  2 "RACY"
run_tsan_lock "bakery"            4 "CLEAN"

echo "=== TSan run complete ==="
