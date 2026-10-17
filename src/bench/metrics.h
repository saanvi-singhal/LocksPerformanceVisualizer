// metrics.h
// Fairness calculation and CSV output for the benchmark.
//
// Kept separate from main.cpp so it can be owned and changed independently
// of the harness.
//
// Owner: Person B.

#ifndef METRICS_H
#define METRICS_H

#include <string>
#include <vector>

// Everything we measured in one benchmark run. The harness fills this in and
// hands it to print_csv_row().
struct RunResult {
    std::string lock_name;
    int threads;
    std::string cs;           // critical-section length: empty, short or long
    int run;                  // run number, starting at 1
    double total_ms;          // wall-clock time of the whole run
    long long total_ops;      // sum of the per-thread acquisition counts
    std::vector<long long> acquisitions;  // acquisitions made by each thread
    bool correct;             // counter == total_ops, and one thread reached M?
};

// Smallest and largest per-thread acquisition count.
long long min_acquisitions(const std::vector<long long>& acquisitions);
long long max_acquisitions(const std::vector<long long>& acquisitions);

// Fairness ratio = busiest thread / least busy thread.
// 1.0 means every thread got the lock equally often; larger is less fair.
// Returns a negative value if some thread got no acquisitions at all
// (the ratio would be infinite).
double fairness_ratio(const std::vector<long long>& acquisitions);

// Prints the CSV header line:
// lock,threads,cs,run,total_ms,ops_per_sec,min_acq,max_acq,fairness_ratio,correct
void print_csv_header();

// Prints one CSV line for one run, in the same column order as the header.
void print_csv_row(const RunResult& result);

#endif // METRICS_H
