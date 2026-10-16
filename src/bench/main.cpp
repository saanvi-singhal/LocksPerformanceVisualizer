// main.cpp
// The benchmark harness.
//
// It starts N threads. Each thread does M times:
//     lock -> increment one shared counter -> busy loop (the "critical
//     section work") -> unlock
// and counts how many times it got the lock. After all threads finish we
// check that the counter equals N x M, and print one CSV line per run.
//
// Usage:
//   lock_bench --lock NAME [--threads N] [--iters M] [--cs empty|short|long]
//              [--runs R] [--pin] [--no-header]
//
// Lock names: none, mutex, peterson, bakery, tas, ttas, ticket, semaphore,
//             atomic (no lock, uses std::atomic fetch_add as the lock-free
//             reference).
//
// Owner: Person A.

#include <pthread.h>
#include <sched.h>

#include <atomic>
#include <chrono>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <memory>
#include <string>
#include <thread>
#include <vector>

#include "../locks/lock.h"
#include "../locks/bakery_lock.h"
#include "../locks/mutex_lock.h"
#include "../locks/no_lock.h"
#include "../locks/peterson_lock.h"
#include "../locks/semaphore_lock.h"
#include "../locks/tas_spin_lock.h"
#include "../locks/ticket_lock.h"
#include "../locks/ttas_spin_lock.h"
#include "metrics.h"

// ---------------------------------------------------------------------------
// Command line options
// ---------------------------------------------------------------------------

struct Options {
    std::string lock_name = "mutex";
    int threads = 4;
    long long iters = 100000;
    std::string cs = "empty";
    int runs = 1;
    bool pin = false;
    bool header = true;   // --no-header turns this off (used by run_all.sh)
};

void print_usage() {
    std::fprintf(stderr,
        "Usage: lock_bench --lock NAME [--threads N] [--iters M]\n"
        "                  [--cs empty|short|long] [--runs R] [--pin] [--no-header]\n"
        "Lock names: none, mutex, peterson, bakery, tas, ttas, ticket,\n"
        "            semaphore, atomic\n");
}

// Returns true if the options were valid. On error it prints a message.
bool parse_options(int argc, char** argv, Options& opt) {
    for (int i = 1; i < argc; i++) {
        std::string arg = argv[i];

        // Options that take a value need one more argument after them.
        bool has_value = (i + 1 < argc);

        if (arg == "--lock" && has_value) {
            i++;
            opt.lock_name = argv[i];
        } else if (arg == "--threads" && has_value) {
            i++;
            opt.threads = std::atoi(argv[i]);
        } else if (arg == "--iters" && has_value) {
            i++;
            opt.iters = std::atoll(argv[i]);
        } else if (arg == "--cs" && has_value) {
            i++;
            opt.cs = argv[i];
        } else if (arg == "--runs" && has_value) {
            i++;
            opt.runs = std::atoi(argv[i]);
        } else if (arg == "--pin") {
            opt.pin = true;
        } else if (arg == "--no-header") {
            opt.header = false;
        } else if (arg == "--help" || arg == "-h") {
            print_usage();
            std::exit(0);
        } else {
            std::fprintf(stderr, "Error: unknown or incomplete option '%s'\n", arg.c_str());
            return false;
        }
    }

    if (opt.threads < 1) {
        std::fprintf(stderr, "Error: --threads must be at least 1\n");
        return false;
    }
    if (opt.iters < 1) {
        std::fprintf(stderr, "Error: --iters must be at least 1\n");
        return false;
    }
    if (opt.runs < 1) {
        std::fprintf(stderr, "Error: --runs must be at least 1\n");
        return false;
    }
    if (opt.cs != "empty" && opt.cs != "short" && opt.cs != "long") {
        std::fprintf(stderr, "Error: --cs must be empty, short or long\n");
        return false;
    }
    return true;
}

// ---------------------------------------------------------------------------
// Locks
// ---------------------------------------------------------------------------

// Creates the lock with the given name. Returns nullptr for an unknown name.
// "atomic" is not handled here because it uses no lock object at all.
std::unique_ptr<Lock> create_lock(const std::string& name, int threads) {
    if (name == "none")      return std::unique_ptr<Lock>(new NoLock(threads));
    if (name == "mutex")     return std::unique_ptr<Lock>(new MutexLock(threads));
    if (name == "peterson")  return std::unique_ptr<Lock>(new PetersonLock(threads));
    if (name == "bakery")    return std::unique_ptr<Lock>(new BakeryLock(threads));
    if (name == "tas")       return std::unique_ptr<Lock>(new TasSpinLock(threads));
    if (name == "ttas")      return std::unique_ptr<Lock>(new TtasSpinLock(threads));
    if (name == "ticket")    return std::unique_ptr<Lock>(new TicketLock(threads));
    if (name == "semaphore") return std::unique_ptr<Lock>(new SemaphoreLock(threads));
    return nullptr;
}

// ---------------------------------------------------------------------------
// Critical-section work
// ---------------------------------------------------------------------------

// How many busy-loop steps to do inside the critical section.
int cs_length_to_spins(const std::string& cs) {
    if (cs == "short") return 100;
    if (cs == "long")  return 1000;
    return 0;  // "empty"
}

// Burns CPU time to simulate work inside the critical section.
// "sink" is volatile so the compiler cannot delete the loop as useless.
void busy_work(int spins) {
    volatile int sink = 0;
    for (int i = 0; i < spins; i++) {
        sink = sink + 1;
    }
}

// ---------------------------------------------------------------------------
// Per-thread acquisition counters
// ---------------------------------------------------------------------------

// Each thread counts its own acquisitions in its own slot. The slots are
// padded to 64 bytes (the size of one CPU cache line) with alignas(64).
//
// Why: without padding, several threads' counters would sit in the same
// cache line. Every write by one thread would then invalidate that line in
// the other cores' caches ("false sharing"), even though the threads never
// touch each other's counters. That extra cache traffic would slow every
// lock down and distort the measurements.
struct alignas(64) PaddedCount {
    long long value = 0;
};

// ---------------------------------------------------------------------------
// One benchmark run
// ---------------------------------------------------------------------------

// Everything the worker threads share during one run.
struct SharedState {
    Lock* lock = nullptr;          // nullptr when running the "atomic" mode

    // The shared counter protected by the lock. It is volatile so that the
    // compiler really does a separate load and store on every increment.
    // Without volatile, with NoLock the optimizer could merge the M
    // increments into one "counter += M" and hide the race we want to show.
    volatile long long counter = 0;

    // Used only by the "atomic" mode: incremented with fetch_add, no lock.
    std::atomic<long long> atomic_counter{0};

    // All threads wait for this flag before starting, so thread creation
    // time is not included in the measurement.
    std::atomic<bool> start{false};

    long long iters = 0;
    int cs_spins = 0;
    std::vector<PaddedCount> acquisitions;  // one padded slot per thread
};

// The code every worker thread runs.
void worker(SharedState* state, int tid) {
    // Wait until the main thread says "go".
    while (!state->start.load()) {
        std::this_thread::yield();
    }

    for (long long i = 0; i < state->iters; i++) {
        if (state->lock == nullptr) {
            // Lock-free reference: one atomic instruction, no lock.
            state->atomic_counter.fetch_add(1);
            busy_work(state->cs_spins);
        } else {
            state->lock->lock(tid);
            state->counter = state->counter + 1;   // the critical section
            busy_work(state->cs_spins);
            state->lock->unlock(tid);
        }

        // Only this thread writes to its own slot, so no lock is needed.
        state->acquisitions[tid].value++;
    }
}

// Pins thread number tid to CPU core (tid mod number of cores).
void pin_thread(std::thread& t, int tid) {
    int cores = (int)std::thread::hardware_concurrency();
    if (cores < 1) {
        cores = 1;
    }

    cpu_set_t cpus;
    CPU_ZERO(&cpus);
    CPU_SET(tid % cores, &cpus);

    int err = pthread_setaffinity_np(t.native_handle(), sizeof(cpu_set_t), &cpus);
    if (err != 0) {
        std::fprintf(stderr, "Warning: could not pin thread %d (error %d)\n", tid, err);
    }
}

// Runs the benchmark once and returns what was measured.
RunResult run_once(const Options& opt, int run_number) {
    SharedState state;
    state.iters = opt.iters;
    state.cs_spins = cs_length_to_spins(opt.cs);
    state.acquisitions.resize(opt.threads);

    // A fresh lock for every run, so no state carries over between runs.
    std::unique_ptr<Lock> lock;
    if (opt.lock_name != "atomic") {
        lock = create_lock(opt.lock_name, opt.threads);
        state.lock = lock.get();
    }

    // Start the threads. They wait on the start flag.
    std::vector<std::thread> threads;
    for (int tid = 0; tid < opt.threads; tid++) {
        threads.push_back(std::thread(worker, &state, tid));
        if (opt.pin) {
            pin_thread(threads[tid], tid);
        }
    }

    // Start the clock, release the threads, and wait for all of them.
    std::chrono::steady_clock::time_point begin = std::chrono::steady_clock::now();
    state.start.store(true);
    for (int tid = 0; tid < opt.threads; tid++) {
        threads[tid].join();
    }
    std::chrono::steady_clock::time_point end = std::chrono::steady_clock::now();

    // Correctness check: every increment must have been counted.
    long long expected = (long long)opt.threads * opt.iters;
    long long final_count;
    if (opt.lock_name == "atomic") {
        final_count = state.atomic_counter.load();
    } else {
        final_count = state.counter;
    }

    RunResult result;
    result.lock_name = opt.lock_name;
    result.threads = opt.threads;
    result.cs = opt.cs;
    result.run = run_number;
    result.total_ms = std::chrono::duration<double, std::milli>(end - begin).count();
    result.total_ops = expected;
    result.correct = (final_count == expected);
    for (int tid = 0; tid < opt.threads; tid++) {
        result.acquisitions.push_back(state.acquisitions[tid].value);
    }
    return result;
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

int main(int argc, char** argv) {
    Options opt;
    if (!parse_options(argc, argv, opt)) {
        print_usage();
        return 1;
    }

    // Check the lock name before starting any threads.
    if (opt.lock_name != "atomic" && create_lock(opt.lock_name, opt.threads) == nullptr) {
        std::fprintf(stderr, "Error: unknown lock '%s'\n", opt.lock_name.c_str());
        print_usage();
        return 1;
    }

    // Peterson's algorithm is defined for exactly two threads.
    if (opt.lock_name == "peterson" && opt.threads != 2) {
        std::fprintf(stderr,
            "Error: PetersonLock works for exactly 2 threads, but --threads is %d.\n"
            "       Run it with --threads 2, or use bakery for N threads.\n",
            opt.threads);
        return 1;
    }

    if (opt.header) {
        print_csv_header();
    }

    for (int run = 1; run <= opt.runs; run++) {
        RunResult result = run_once(opt, run);
        print_csv_row(result);
        std::fflush(stdout);  // show each line as soon as the run finishes
    }
    return 0;
}
