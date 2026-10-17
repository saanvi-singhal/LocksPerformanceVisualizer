#!/usr/bin/env python3
"""export_results.py - turn results/raw.csv into frontend/public/data/results.json.

The dashboard in frontend/ reads only this JSON file, so it works without
re-running the benchmark. The file contains:

  machine           the text of results/machine.txt, plus its "Key: value"
                    lines as a dictionary
  sweep             from results/sweep.txt: the commit and date of the sweep,
                    iterations per thread for each thread count, runs
  thread_counts     every thread count in the data, sorted
  cs_lengths        empty, short, long
  medians           one row per (lock, threads, cs): the MEDIAN over the runs
                    of ops/s and fairness ratio, plus time per operation
  correctness       one row per (lock, threads): how many runs were correct,
                    over all critical-section lengths
  oversubscription  for every lock and cs length: ops/s at "cores" threads
                    and at 2 x cores threads, and how much throughput is kept

Usage:  python3 scripts/export_results.py [path/to/raw.csv]

Owner: Person B.
"""

import datetime
import json
import math
import os
import sys

import pandas as pd

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_CSV = os.path.join(REPO_ROOT, "results", "raw.csv")
MACHINE_TXT = os.path.join(REPO_ROOT, "results", "machine.txt")
SWEEP_TXT = os.path.join(REPO_ROOT, "results", "sweep.txt")
OUT_JSON = os.path.join(REPO_ROOT, "frontend", "public", "data", "results.json")

CS_ORDER = ["empty", "short", "long"]


def clean(value, digits):
    """Round a number for the JSON file. NaN (no value) becomes null."""
    if value is None or (isinstance(value, float) and math.isnan(value)):
        return None
    return round(float(value), digits)


def read_machine():
    """Return the text of machine.txt and its 'Key: value' lines as a dict."""
    if not os.path.exists(MACHINE_TXT):
        return {"text": "", "fields": {}}
    with open(MACHINE_TXT) as f:
        text = f.read()
    fields = {}
    last_key = None
    for line in text.splitlines():
        if line.startswith(" ") and last_key is not None:
            # An indented line continues the previous field.
            fields[last_key] += " " + line.strip()
        elif ":" in line:
            key, value = line.split(":", 1)
            last_key = key.strip()
            fields[last_key] = value.strip()
    return {"text": text, "fields": fields}


def read_sweep():
    """Read results/sweep.txt (written by run_all.sh): commit, date,
    iterations per thread count and runs. Missing file -> empty values."""
    sweep = {"commit": None, "date": None, "iterations": {}, "runs": None}
    if not os.path.exists(SWEEP_TXT):
        return sweep
    with open(SWEEP_TXT) as f:
        for line in f:
            if ":" not in line:
                continue
            key, value = line.split(":", 1)
            key = key.strip()
            value = value.strip()
            if key == "Commit":
                sweep["commit"] = value
            elif key == "Date":
                sweep["date"] = value
            elif key == "Runs per combination":
                sweep["runs"] = int(value)
            elif key == "Iterations per thread":
                # "1=100000 2=100000 ... 32=1000"
                for pair in value.split():
                    threads, iters = pair.split("=")
                    sweep["iterations"][threads] = int(iters)
    return sweep


def main():
    csv_path = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_CSV
    if not os.path.exists(csv_path):
        print("Error:", csv_path, "not found. Run scripts/run_all.sh first.")
        sys.exit(1)

    df = pd.read_csv(csv_path)
    # "correct" is read as a bool column; make sure of it.
    df["correct"] = df["correct"].astype(str).str.lower() == "true"

    # --- medians per (lock, threads, cs) -----------------------------------
    grouped = df.groupby(["lock", "threads", "cs"])
    medians = []
    for (lock, threads, cs), rows in grouped:
        ops = rows["ops_per_sec"].median()
        # An empty fairness value means some thread got no acquisitions in
        # that run, so max/min is not defined. With the short runs at 2 x cores
        # threads this happens when some threads had not started yet when the
        # first thread finished (a start-up effect). Those runs are skipped;
        # if EVERY run was like that, there is no fairness value (null).
        fairness = rows["fairness_ratio"].dropna()
        fairness_median = fairness.median() if len(fairness) > 0 else None
        medians.append({
            "lock": lock,
            "threads": int(threads),
            "cs": cs,
            "runs": int(len(rows)),
            "ops_per_sec": clean(ops, 0),
            "fairness_ratio": clean(fairness_median, 4),
            # How many runs had no defined fairness (a thread with zero acquisitions).
            "fairness_undefined_runs": int(rows["fairness_ratio"].isna().sum()),
            # Average wall time per lock acquisition, in microseconds.
            "us_per_op": clean(1e6 / ops, 5),
        })

    # --- correctness per (lock, threads), all cs lengths together ----------
    correctness = []
    for (lock, threads), rows in df.groupby(["lock", "threads"]):
        correctness.append({
            "lock": lock,
            "threads": int(threads),
            "correct_runs": int(rows["correct"].sum()),
            "runs": int(len(rows)),
        })

    # --- oversubscription: cores threads vs 2 x cores threads --------------
    thread_counts = sorted(int(t) for t in df["threads"].unique())
    oversub_threads = max(thread_counts)
    base_threads = oversub_threads // 2
    lookup = {}
    for row in medians:
        lookup[(row["lock"], row["threads"], row["cs"])] = row["ops_per_sec"]
    oversub_rows = []
    for lock in sorted(df["lock"].unique()):
        for cs in CS_ORDER:
            base = lookup.get((lock, base_threads, cs))
            over = lookup.get((lock, oversub_threads, cs))
            if base is None or over is None:
                continue  # for example Peterson, which only runs at 2 threads
            oversub_rows.append({
                "lock": lock,
                "cs": cs,
                "base_ops_per_sec": base,
                "oversub_ops_per_sec": over,
                "retained_percent": clean(100.0 * over / base, 3),
            })

    result = {
        "generated": datetime.date.today().isoformat(),
        "source": os.path.relpath(csv_path, REPO_ROOT),
        "machine": read_machine(),
        "sweep": read_sweep(),
        "thread_counts": thread_counts,
        "cs_lengths": CS_ORDER,
        "medians": medians,
        "correctness": correctness,
        "oversubscription": {
            "base_threads": base_threads,
            "oversub_threads": oversub_threads,
            "rows": oversub_rows,
        },
    }

    os.makedirs(os.path.dirname(OUT_JSON), exist_ok=True)
    with open(OUT_JSON, "w") as f:
        json.dump(result, f, indent=1)
        f.write("\n")
    print("wrote", OUT_JSON, "(" + str(len(medians)) + " median rows)")


if __name__ == "__main__":
    main()
