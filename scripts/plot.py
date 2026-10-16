#!/usr/bin/env python3
"""plot.py - turn results/raw.csv into PNG graphs in results/graphs/.

For every (lock, threads, cs) combination we take the MEDIAN over the runs,
so one noisy run does not distort a graph. Then we draw, one line per lock:

  throughput_vs_threads_<cs>.png   ops/sec against thread count, one file per
                                   critical-section length
  fairness_vs_threads_<cs>.png     fairness ratio against thread count, one
                                   file per critical-section length
  time_vs_cs_<N>threads.png        total time against critical-section length,
                                   one file per thread count

Usage:  python3 scripts/plot.py [path/to/raw.csv]

Owner: Person B.
"""

import os
import sys

import matplotlib

matplotlib.use("Agg")  # draw straight to files, no window needed
import matplotlib.pyplot as plt
import pandas as pd

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_CSV = os.path.join(REPO_ROOT, "results", "raw.csv")
GRAPH_DIR = os.path.join(REPO_ROOT, "results", "graphs")

CS_ORDER = ["empty", "short", "long"]

# A fixed colour and marker for every lock, so a lock looks the same in every
# graph. The eight real locks use a colour-blind-checked palette; NoLock is
# grey and dashed because it is the deliberately broken reference.
LOCK_STYLE = {
    "mutex":     {"color": "#2a78d6", "marker": "o", "linestyle": "-"},
    "peterson":  {"color": "#eb6834", "marker": "s", "linestyle": "-"},
    "bakery":    {"color": "#1baf7a", "marker": "^", "linestyle": "-"},
    "tas":       {"color": "#eda100", "marker": "v", "linestyle": "-"},
    "ttas":      {"color": "#e87ba4", "marker": "D", "linestyle": "-"},
    "ticket":    {"color": "#008300", "marker": "P", "linestyle": "-"},
    "semaphore": {"color": "#6250d6", "marker": "X", "linestyle": "-"},
    "atomic":    {"color": "#e34948", "marker": "*", "linestyle": "-"},
    "none":      {"color": "#8a8985", "marker": "o", "linestyle": "--"},
}
LOCK_ORDER = list(LOCK_STYLE.keys())


def load_medians(csv_path):
    """Read the raw CSV and return one row per (lock, threads, cs) with medians."""
    df = pd.read_csv(csv_path)
    # An empty fairness_ratio means a thread starved (ratio is infinite);
    # pandas reads it as NaN, so those runs are left out of the median.
    medians = (
        df.groupby(["lock", "threads", "cs"], as_index=False)
        [["total_ms", "ops_per_sec", "fairness_ratio"]]
        .median()
    )
    return medians


def style_axes(ax, title, xlabel, ylabel):
    """Common look for every graph: light grid, labels, legend."""
    ax.set_title(title)
    ax.set_xlabel(xlabel)
    ax.set_ylabel(ylabel)
    ax.grid(True, color="#e0e0e0", linewidth=0.8)
    ax.set_axisbelow(True)
    # Legend to the right of the plot so it never hides a line.
    ax.legend(title="lock", fontsize="small", loc="upper left", bbox_to_anchor=(1.01, 1))


def plot_line(ax, x, y, lock):
    """One line for one lock, in that lock's fixed style."""
    style = LOCK_STYLE.get(lock, {"color": "black", "marker": "o", "linestyle": "-"})
    ax.plot(x, y, label=lock, linewidth=2, markersize=7, **style)


def save(fig, filename):
    path = os.path.join(GRAPH_DIR, filename)
    fig.tight_layout()
    fig.savefig(path, dpi=150)
    plt.close(fig)
    print("wrote", path)


def plot_vs_threads(medians, column, ylabel, file_prefix, title_prefix):
    """One graph per cs length: column against thread count, one line per lock."""
    for cs in CS_ORDER:
        subset = medians[medians["cs"] == cs]
        if subset.empty:
            continue
        fig, ax = plt.subplots(figsize=(8, 5))
        for lock in LOCK_ORDER:
            rows = subset[subset["lock"] == lock].sort_values("threads")
            # Peterson has only one point (2 threads); still draw it.
            if not rows.empty:
                plot_line(ax, rows["threads"], rows[column], lock)
        thread_counts = sorted(subset["threads"].unique())
        ax.set_xscale("log", base=2)
        ax.set_xticks(thread_counts)
        ax.set_xticklabels([str(t) for t in thread_counts])
        style_axes(ax, title_prefix + " (cs = " + cs + ")", "threads", ylabel)
        save(fig, file_prefix + "_" + cs + ".png")


def plot_time_vs_cs(medians):
    """One graph per thread count: total time against cs length."""
    for threads in sorted(medians["threads"].unique()):
        subset = medians[medians["threads"] == threads]
        fig, ax = plt.subplots(figsize=(8, 5))
        for lock in LOCK_ORDER:
            rows = subset[subset["lock"] == lock]
            if rows.empty:
                continue
            # Put the rows in empty -> short -> long order.
            rows = rows.set_index("cs").reindex(CS_ORDER).dropna(subset=["total_ms"])
            plot_line(ax, rows.index, rows["total_ms"], lock)
        style_axes(ax, "Total time vs critical-section length (" + str(threads) + " threads)",
                   "critical-section length", "total time (ms)")
        save(fig, "time_vs_cs_" + str(threads) + "threads.png")


def main():
    csv_path = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_CSV
    if not os.path.exists(csv_path):
        print("Error:", csv_path, "not found. Run scripts/run_all.sh first.")
        sys.exit(1)

    os.makedirs(GRAPH_DIR, exist_ok=True)
    medians = load_medians(csv_path)

    plot_vs_threads(medians, "ops_per_sec", "operations per second",
                    "throughput_vs_threads", "Throughput vs threads")
    plot_vs_threads(medians, "fairness_ratio", "fairness ratio (max/min, 1 = fair)",
                    "fairness_vs_threads", "Fairness vs threads")
    plot_time_vs_cs(medians)


if __name__ == "__main__":
    main()
