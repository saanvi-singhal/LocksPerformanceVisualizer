#!/usr/bin/env bash
# run_all.sh
# Runs every experiment and appends the results to results/raw.csv.
#
# Sweep: every lock x thread counts (1, 2, 4, 8, 16 and 2 x cores)
#        x critical-section lengths (empty, short, long), 5 runs each.
# Combinations a lock does not support are skipped (both Peterson variants
# need exactly 2 threads).
#
# Every lock_bench call is limited by "timeout". If one combination takes
# longer (for example a spinlock with more threads than cores), it is
# reported as TIMEOUT, listed at the end, and the sweep carries on.
#
# Usage:  scripts/run_all.sh
# Optional environment variables:
#   BIN      path to the lock_bench binary   (default: build/lock_bench)
#   ITERS    iterations per thread           (default: 100000)
#   RUNS     runs per combination            (default: 5)
#   PIN      set to 1 to pass --pin          (default: off)
#   TIMEOUT  seconds per combination         (default: 120)
#   OVERSUB_ITERS  iterations per thread for the 2 x cores thread count
#                  (default: 1000, see below)
#
# Oversubscription (2 x cores threads) uses fewer iterations. With more
# threads than cores, locks that hand over to one specific next thread
# (ticket, bakery) slow down to a few thousand operations per second,
# because that thread is often not running. With the normal ITERS one run
# would take many minutes. ops_per_sec is a rate, so it is still comparable
# with the other thread counts.
#
# Owner: Person B.

set -euo pipefail

# Always work from the repository root, wherever the script is called from.
cd "$(dirname "$0")/.."

BIN="${BIN:-build/lock_bench}"
ITERS="${ITERS:-100000}"
RUNS="${RUNS:-5}"
PIN="${PIN:-0}"
TIMEOUT="${TIMEOUT:-120}"
OVERSUB_ITERS="${OVERSUB_ITERS:-1000}"
OUT="results/raw.csv"

if [ ! -x "$BIN" ]; then
    echo "Error: $BIN not found. Build first (see README)." >&2
    exit 1
fi

LOCKS="none mutex peterson peterson_relaxed bakery tas ttas ticket semaphore atomic"
CS_LENGTHS="empty short long"

# Thread counts: the fixed list plus twice the number of cores
# (oversubscription). sort -u removes a duplicate if 2 x cores is already
# in the list.
CORES=$(nproc)
OVERSUB_THREADS=$((2 * CORES))
THREAD_COUNTS=$(printf '%s\n' 1 2 4 8 16 $OVERSUB_THREADS | sort -n -u)

PIN_FLAG=""
if [ "$PIN" = "1" ]; then
    PIN_FLAG="--pin"
fi

# Write the CSV header only once, when the file does not exist yet.
mkdir -p results
if [ ! -f "$OUT" ]; then
    "$BIN" --lock mutex --threads 1 --iters 1 --runs 1 | head -n 1 > "$OUT"
fi

echo "Cores: $CORES, thread counts: $(echo $THREAD_COUNTS), iters: $ITERS" \
     "($OVERSUB_ITERS at $OVERSUB_THREADS threads), runs: $RUNS, timeout: ${TIMEOUT}s"

TIMED_OUT=""

for lock in $LOCKS; do
    for threads in $THREAD_COUNTS; do
        # Peterson's algorithm (both variants) only works for exactly 2 threads.
        if [ "$lock" = "peterson" ] || [ "$lock" = "peterson_relaxed" ]; then
            if [ "$threads" -ne 2 ]; then
                continue
            fi
        fi
        # Fewer iterations for the oversubscribed thread count (see top).
        iters="$ITERS"
        if [ "$threads" -eq "$OVERSUB_THREADS" ]; then
            iters="$OVERSUB_ITERS"
        fi
        for cs in $CS_LENGTHS; do
            echo "Running lock=$lock threads=$threads cs=$cs iters=$iters"
            # "|| status=$?" stops set -e from ending the script on a timeout.
            status=0
            timeout "$TIMEOUT" "$BIN" --lock "$lock" --threads "$threads" \
                --iters "$iters" --cs "$cs" --runs "$RUNS" $PIN_FLAG \
                --no-header >> "$OUT" || status=$?
            # timeout exits with status 124 when it had to stop the program.
            if [ "$status" -eq 124 ]; then
                echo "  TIMEOUT after ${TIMEOUT}s (runs finished before it are kept)"
                TIMED_OUT="$TIMED_OUT $lock/$threads/$cs"
            elif [ "$status" -ne 0 ]; then
                echo "Error: lock_bench failed with status $status" >&2
                exit 1
            fi
        done
    done
done

if [ -n "$TIMED_OUT" ]; then
    echo "Timed out (lock/threads/cs):$TIMED_OUT"
fi
echo "Done. Results appended to $OUT"
