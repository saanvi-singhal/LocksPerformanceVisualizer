#!/usr/bin/env python3
"""plot.py - turn results/raw.csv into PNG graphs in results/graphs/.

For every (lock, threads, cs) combination we take the MEDIAN over the runs,
so one noisy run does not distort a graph. Then we draw, one line per lock:

  throughput_vs_threads_<cs>.png     operations per second against thread
                                     count, one file per critical-section
                                     length
  fairness_vs_threads_<cs>.png       fairness ratio against thread count, one
                                     file per critical-section length
  time_per_op_vs_cs_<N>threads.png   average time per lock acquisition
                                     against critical-section length, one file
                                     per thread count

Why ops/s and time per operation, and not total time: threads stop as soon
as the first thread has done its M iterations (the fairness window), so
different locks do different amounts of work in one run. A rate is
comparable; a total time is not.

Both y axes use a log scale, because the values span several powers of ten
(for example the oversubscribed spinlocks are 1000x slower).

Usage:  python3 scripts/plot.py [path/to/raw.csv]

Owner: Person B.
"""

import os
import sys

import matplotlib

matplotlib.use("Agg")  # draw straight to files, no window needed
import matplotlib.pyplot as plt
import matplotlib.ticker as ticker
import pandas as pd

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_CSV = os.path.join(REPO_ROOT, "results", "raw.csv")
GRAPH_DIR = os.path.join(REPO_ROOT, "results", "graphs")

CS_ORDER = ["empty", "short", "long"]

# A fixed colour and marker for every lock, so a lock looks the same in every
# graph. The order of this table is also the legend order, grouped by kind:
# sleeping locks, hardware spinlocks, software locks, then the references.
# The two deliberately broken locks are dashed. peterson_relaxed also has a
# hollow marker, because both Peterson variants have only one point
# (2 threads), where a dashed line would not be visible.
LOCK_STYLE = {
    "mutex":            {"color": "#2a78d6", "marker": "o", "linestyle": "-"},
    "semaphore":        {"color": "#6250d6", "marker": "X", "linestyle": "-"},
    "tas":              {"color": "#eda100", "marker": "v", "linestyle": "-"},
    "ttas":             {"color": "#e87ba4", "marker": "D", "linestyle": "-"},
    "ticket":           {"color": "#008300", "marker": "P", "linestyle": "-"},
    "peterson":         {"color": "#eb6834", "marker": "s", "linestyle": "-"},
    "peterson_relaxed": {"color": "#eb6834", "marker": "s", "linestyle": "--",
                         "markerfacecolor": "white", "markeredgewidth": 2},
    "bakery":           {"color": "#1baf7a", "marker": "^", "linestyle": "-"},
    "atomic":           {"color": "#e34948", "marker": "*", "linestyle": "-"},
    "none":             {"color": "#8a8985", "marker": "o", "linestyle": "--"},
}
LOCK_ORDER = list(LOCK_STYLE.keys())

# Labels used in the legend, so the broken locks are clearly marked.
LOCK_LABEL = {
    "peterson_relaxed": "peterson_relaxed (broken)",
    "atomic": "atomic (no lock, reference)",
    "none": "none (no lock, broken)",
}

# The fairness of something that is not a working lock means nothing, so the
# two broken locks are left out of the fairness graphs.
NOT_IN_FAIRNESS = ["none", "peterson_relaxed"]


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
    # Average wall time per lock acquisition, in microseconds.
    medians["us_per_op"] = 1e6 / medians["ops_per_sec"]
    return medians


def human_number(value, _position):
    """Tick label like 500, 20k, 3M, so nobody has to count zeros."""
    if value >= 1e6:
        return "%gM" % (value / 1e6)
    if value >= 1e3:
        return "%gk" % (value / 1e3)
    return "%g" % value


def log_y_axis(ax):
    """Log-scale y axis with labels at 1, 2 and 5 times each power of ten."""
    ax.set_yscale("log")
    ax.yaxis.set_major_locator(ticker.LogLocator(base=10, subs=(1.0, 2.0, 5.0)))
    ax.yaxis.set_major_formatter(ticker.FuncFormatter(human_number))
    ax.yaxis.set_minor_locator(ticker.NullLocator())


def style_axes(ax, title, xlabel, ylabel):
    """Common look for every graph: light grid, labels, legend."""
    ax.set_title(title)
    ax.set_xlabel(xlabel)
    ax.set_ylabel(ylabel)
    ax.grid(True, which="major", color="#e0e0e0", linewidth=0.8)
    ax.set_axisbelow(True)
    # Legend to the right of the plot so it never hides a line.
    ax.legend(title="lock", fontsize="small", loc="upper left", bbox_to_anchor=(1.01, 1))


def plot_line(ax, x, y, lock):
    """One line for one lock, in that lock's fixed style."""
    style = LOCK_STYLE.get(lock, {"color": "black", "marker": "o", "linestyle": "-"})
    label = LOCK_LABEL.get(lock, lock)
    ax.plot(x, y, label=label, linewidth=2, markersize=7, **style)


def save(fig, filename):
    path = os.path.join(GRAPH_DIR, filename)
    fig.tight_layout()
    fig.savefig(path, dpi=150)
    plt.close(fig)
    print("wrote", path)


def thread_tick_labels(thread_counts):
    """Thread counts as tick labels; the largest one (2 x cores) gets a '*'."""
    largest = max(thread_counts)
    labels = []
    for t in thread_counts:
        if t == largest and len(thread_counts) > 1:
            labels.append(str(t) + "*")
        else:
            labels.append(str(t))
    return labels


def add_oversub_note(fig, thread_counts):
    """Footnote explaining the '*' on the largest thread count."""
    largest = max(thread_counts)
    fig.text(0.01, 0.01,
             "* " + str(largest) + " threads = 2 x cores (oversubscribed), "
             "run with fewer iterations per thread",
             fontsize="small", color="#555555")


def plot_vs_threads(medians, column, ylabel, file_prefix, title_prefix, skip_locks):
    """One graph per cs length: column against thread count, one line per lock."""
    for cs in CS_ORDER:
        subset = medians[medians["cs"] == cs]
        if subset.empty:
            continue
        fig, ax = plt.subplots(figsize=(9, 5.5))
        for lock in LOCK_ORDER:
            if lock in skip_locks:
                continue
            rows = subset[subset["lock"] == lock].sort_values("threads")
            rows = rows.dropna(subset=[column])
            # Peterson has only one point (2 threads); still draw it.
            if not rows.empty:
                plot_line(ax, rows["threads"], rows[column], lock)
        thread_counts = sorted(subset["threads"].unique())
        ax.set_xscale("log", base=2)
        ax.set_xticks(thread_counts)
        ax.set_xticklabels(thread_tick_labels(thread_counts))
        ax.xaxis.set_minor_locator(ticker.NullLocator())
        log_y_axis(ax)
        style_axes(ax, title_prefix + " (critical section: " + cs + ")",
                   "number of threads", ylabel)
        add_oversub_note(fig, thread_counts)
        save(fig, file_prefix + "_" + cs + ".png")


def plot_time_per_op_vs_cs(medians):
    """One graph per thread count: time per operation against cs length."""
    all_threads = sorted(medians["threads"].unique())
    for threads in all_threads:
        subset = medians[medians["threads"] == threads]
        fig, ax = plt.subplots(figsize=(9, 5.5))
        for lock in LOCK_ORDER:
            rows = subset[subset["lock"] == lock]
            if rows.empty:
                continue
            # Put the rows in empty -> short -> long order.
            rows = rows.set_index("cs").reindex(CS_ORDER).dropna(subset=["us_per_op"])
            plot_line(ax, rows.index, rows["us_per_op"], lock)
        log_y_axis(ax)
        title = "Time per operation vs critical-section length (" + str(threads) + " threads"
        if threads == max(all_threads) and len(all_threads) > 1:
            title += ", oversubscribed"
        title += ")"
        style_axes(ax, title, "critical-section length",
                   "average time per lock acquisition (microseconds)")
        save(fig, "time_per_op_vs_cs_" + str(threads) + "threads.png")


def main():
    csv_path = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_CSV
    if not os.path.exists(csv_path):
        print("Error:", csv_path, "not found. Run scripts/run_all.sh first.")
        sys.exit(1)

    os.makedirs(GRAPH_DIR, exist_ok=True)
    medians = load_medians(csv_path)

    plot_vs_threads(medians, "ops_per_sec", "operations per second (log scale)",
                    "throughput_vs_threads", "Throughput vs threads", [])
    plot_vs_threads(medians, "fairness_ratio",
                    "fairness ratio = max / min acquisitions (1 = fair, log scale)",
                    "fairness_vs_threads", "Fairness vs threads", NOT_IN_FAIRNESS)
    plot_time_per_op_vs_cs(medians)


if __name__ == "__main__":
    main()
