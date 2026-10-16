#!/usr/bin/env bash
# run_all.sh
# Runs every experiment and appends the results to results/raw.csv.
#
# Sweep: every lock x thread counts (1, 2, 4, 8, 16 and 2 x cores)
#        x critical-section lengths (empty, short, long), 5 runs each.
# Combinations a lock does not support are skipped (Peterson needs exactly
# 2 threads).
#
# Usage:  scripts/run_all.sh
# Optional environment variables:
#   BIN    path to the lock_bench binary   (default: build/lock_bench)
#   ITERS  iterations per thread           (default: 100000)
#   RUNS   runs per combination            (default: 5)
#   PIN    set to 1 to pass --pin          (default: off)
#
# Owner: Person B.

set -euo pipefail

# Always work from the repository root, wherever the script is called from.
cd "$(dirname "$0")/.."

BIN="${BIN:-build/lock_bench}"
ITERS="${ITERS:-100000}"
RUNS="${RUNS:-5}"
PIN="${PIN:-0}"
OUT="results/raw.csv"

if [ ! -x "$BIN" ]; then
    echo "Error: $BIN not found. Build first (see README)." >&2
    exit 1
fi

LOCKS="none mutex peterson bakery tas ttas ticket semaphore atomic"
CS_LENGTHS="empty short long"

# Thread counts: the fixed list plus twice the number of cores
# (oversubscription). sort -u removes a duplicate if 2 x cores is already
# in the list.
CORES=$(nproc)
THREAD_COUNTS=$(printf '%s\n' 1 2 4 8 16 $((2 * CORES)) | sort -n -u)

PIN_FLAG=""
if [ "$PIN" = "1" ]; then
    PIN_FLAG="--pin"
fi

# Write the CSV header only once, when the file does not exist yet.
mkdir -p results
if [ ! -f "$OUT" ]; then
    "$BIN" --lock mutex --threads 1 --iters 1 --runs 1 | head -n 1 > "$OUT"
fi

echo "Cores: $CORES, thread counts: $(echo $THREAD_COUNTS), iters: $ITERS, runs: $RUNS"

for lock in $LOCKS; do
    for threads in $THREAD_COUNTS; do
        # Peterson's algorithm only works for exactly 2 threads.
        if [ "$lock" = "peterson" ] && [ "$threads" -ne 2 ]; then
            continue
        fi
        for cs in $CS_LENGTHS; do
            echo "Running lock=$lock threads=$threads cs=$cs"
            "$BIN" --lock "$lock" --threads "$threads" --iters "$ITERS" \
                   --cs "$cs" --runs "$RUNS" $PIN_FLAG --no-header >> "$OUT"
        done
    done
done

echo "Done. Results appended to $OUT"
