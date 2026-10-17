// metrics.cpp
// Fairness calculation and CSV output. See metrics.h for the description.
//
// Owner: Person B.

#include "metrics.h"

#include <cstdio>

long long min_acquisitions(const std::vector<long long>& acquisitions) {
    long long smallest = acquisitions[0];
    for (size_t i = 1; i < acquisitions.size(); i++) {
        if (acquisitions[i] < smallest) {
            smallest = acquisitions[i];
        }
    }
    return smallest;
}

long long max_acquisitions(const std::vector<long long>& acquisitions) {
    long long largest = acquisitions[0];
    for (size_t i = 1; i < acquisitions.size(); i++) {
        if (acquisitions[i] > largest) {
            largest = acquisitions[i];
        }
    }
    return largest;
}

double fairness_ratio(const std::vector<long long>& acquisitions) {
    long long smallest = min_acquisitions(acquisitions);
    long long largest = max_acquisitions(acquisitions);
    if (smallest == 0) {
        return -1.0;  // some thread starved completely
    }
    return (double)largest / (double)smallest;
}

void print_csv_header() {
    std::printf("lock,threads,cs,run,total_ms,ops_per_sec,"
                "min_acq,max_acq,fairness_ratio,correct\n");
}

void print_csv_row(const RunResult& result) {
    // Operations per second = total operations / time in seconds.
    double seconds = result.total_ms / 1000.0;
    double ops_per_sec = 0.0;
    if (seconds > 0.0) {
        ops_per_sec = (double)result.total_ops / seconds;
    }

    std::printf("%s,%d,%s,%d,%.3f,%.0f,%lld,%lld,",
                result.lock_name.c_str(),
                result.threads,
                result.cs.c_str(),
                result.run,
                result.total_ms,
                ops_per_sec,
                min_acquisitions(result.acquisitions),
                max_acquisitions(result.acquisitions));

    // An empty fairness field means "infinite" (a thread starved).
    double ratio = fairness_ratio(result.acquisitions);
    if (ratio >= 0.0) {
        std::printf("%.4f", ratio);
    }

    std::printf(",%s\n", result.correct ? "true" : "false");
}
