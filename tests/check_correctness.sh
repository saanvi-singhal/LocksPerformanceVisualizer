#!/usr/bin/env bash
# check_correctness.sh
# Runs every implemented lock with 4 threads and 100000 iterations and fails
# (non-zero exit status) if any run reports correct=false.
#
# - NoLock ("none") is expected to fail: its result is printed but it does
#   not affect the pass/fail result.
# - Peterson only supports 2 threads, so it is run with 2 threads.
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

LOCKS="none mutex peterson bakery tas ttas ticket semaphore atomic"
FAILED=0
ERR_FILE=$(mktemp)

for lock in $LOCKS; do
    threads=4
    if [ "$lock" = "peterson" ]; then
        threads=2
    fi

    output=$("$BIN" --lock "$lock" --threads "$threads" --iters "$ITERS" \
                    --runs "$RUNS" --no-header 2> "$ERR_FILE")
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

    if [ "$lock" = "none" ]; then
        echo "INFO  $lock: $bad_runs of $RUNS runs incorrect (expected, not counted)"
    elif [ "$bad_runs" -eq 0 ]; then
        echo "PASS  $lock ($threads threads)"
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
