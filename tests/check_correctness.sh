#!/usr/bin/env bash
# check_correctness.sh
# Runs every implemented lock with 4 threads (Peterson variants: 2) and
# 100000 iterations, RUNS times each, and fails (non-zero exit status) if
# any run reports correct=false.
#
# A run is correct when the shared counter equals the sum of the per-thread
# acquisition counts (no lost updates) and at least one thread reached M.
# (Threads stop as soon as the first one finishes its M iterations, so the
# total is not simply threads x M; see SharedState::stop in main.cpp.)
#
# - NoLock ("none") is expected to fail: its result is printed but does not
#   affect the pass/fail result.
# - peterson and peterson_relaxed only support 2 threads.
# - peterson_relaxed is EXPECTED to be incorrect sometimes (it uses relaxed
#   ordering intentionally); it is therefore treated like "none" — its result
#   is printed as INFO and not counted as a failure.
# - Locks that are still stubs print "NOT IMPLEMENTED" on stderr; they are
#   reported as SKIP until they are implemented.
#
# Usage:  tests/check_correctness.sh
# Optional environment variables:
#   BIN   path to the lock_bench binary   (default: build/lock_bench)
#   RUNS  runs per lock                   (default: 5)
#
# Owner: Person A.

set -uo pipefail

# Always work from the repository root, wherever the script is called from.
cd "$(dirname "$0")/.."

BIN="${BIN:-build/lock_bench}"
RUNS="${RUNS:-5}"
ITERS=100000

if [ ! -x "$BIN" ]; then
    echo "Error: $BIN not found. Build first (see README)." >&2
    exit 1
fi

# none and peterson_relaxed are expected to be incorrect; listed here so we
# print INFO instead of FAIL for them.
EXPECTED_BAD="none peterson_relaxed"

# All lock names to test, in a sensible order.
LOCKS="none mutex peterson peterson_relaxed bakery tas ttas ticket semaphore atomic"
FAILED=0
ERR_FILE=$(mktemp)

for lock in $LOCKS; do
    threads=4
    # Peterson variants only support exactly 2 threads.
    if [ "$lock" = "peterson" ] || [ "$lock" = "peterson_relaxed" ]; then
        threads=2
    fi

    output=$("$BIN" --lock "$lock" --threads "$threads" --iters "$ITERS" \
                    --runs "$RUNS" --no-header 2>"$ERR_FILE")
    status=$?

    if [ $status -ne 0 ]; then
        echo "ERROR $lock: lock_bench exited with status $status"
        cat "$ERR_FILE"
        FAILED=1
        continue
    fi

    if grep -q "NOT IMPLEMENTED" "$ERR_FILE"; then
        echo "SKIP  $lock (not implemented yet)"
        continue
    fi

    # Column 10 of the CSV is "correct". Count the runs where it is false.
    bad_runs=$(echo "$output" | awk -F, '$10 == "false"' | wc -l)

    # Check whether this lock is expected to be incorrect.
    is_expected_bad=0
    for bad in $EXPECTED_BAD; do
        if [ "$lock" = "$bad" ]; then
            is_expected_bad=1
            break
        fi
    done

    if [ "$is_expected_bad" -eq 1 ]; then
        echo "INFO  $lock: $bad_runs of $RUNS runs incorrect (expected for this lock)"
    elif [ "$bad_runs" -eq 0 ]; then
        echo "PASS  $lock ($threads threads, $RUNS runs)"
    else
        echo "FAIL  $lock: $bad_runs of $RUNS runs incorrect"
        FAILED=1
    fi
done

rm -f "$ERR_FILE"

if [ $FAILED -ne 0 ]; then
    echo "Correctness check FAILED"
    exit 1
fi
echo "Correctness check passed"
exit 0
