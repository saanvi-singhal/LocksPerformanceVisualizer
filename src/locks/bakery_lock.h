// bakery_lock.h
// BakeryLock: Lamport's Bakery algorithm, software mutual exclusion for N threads.
//
// Idea: like a bakery where customers take a numbered ticket and are served in
// order. Each thread picks a number one higher than the current maximum, then
// waits until no thread with a smaller (or equal-but-lower-id) number is in
// the critical section. Thread id breaks ties, so the ordering is total.
//
// choosing[i] is true while thread i is reading the numbers to pick its own.
// Without it, thread j could read number[i] == 0 before i has stored its
// actual number and skip the wait entirely.
//
// Works for any number of threads up to max_threads.
// Memory ordering: all operations use seq_cst.
//
// Owner: Person A.

#ifndef BAKERY_LOCK_H
#define BAKERY_LOCK_H

#include <atomic>
#include <vector>

#include "lock.h"

// One atomic value padded to a whole 64-byte cache line (see the comment on
// choosing_ and number_ below for why).
struct alignas(64) PaddedAtomicBool {
    std::atomic<bool> value{false};
};
struct alignas(64) PaddedAtomicInt {
    std::atomic<int> value{0};
};

class BakeryLock : public Lock {
public:
    // Allocate per-thread arrays, all zeroed / false.
    explicit BakeryLock(int max_threads)
        : Lock(max_threads),
          choosing_(max_threads),
          number_(max_threads)
    {
        for (int i = 0; i < max_threads; i++) {
            choosing_[i].value.store(false, std::memory_order_seq_cst);
            number_[i].value.store(0,     std::memory_order_seq_cst);
        }
    }

    void lock(int tid) override {
        // --- Phase 1: pick a ticket number ---

        // Signal that we are in the middle of choosing.
        choosing_[tid].value.store(true, std::memory_order_seq_cst);

        // Read all current numbers and take one more than the maximum.
        int max_num = 0;
        for (int i = 0; i < max_threads_; i++) {
            int n = number_[i].value.load(std::memory_order_seq_cst);
            if (n > max_num) {
                max_num = n;
            }
        }
        number_[tid].value.store(max_num + 1, std::memory_order_seq_cst);

        // Done choosing; other threads may now read our number.
        choosing_[tid].value.store(false, std::memory_order_seq_cst);

        // --- Phase 2: wait for our turn ---
        for (int j = 0; j < max_threads_; j++) {
            if (j == tid) {
                continue;  // do not compare against ourselves
            }

            // Wait while thread j is still in the middle of choosing its number.
            // If we read its number before it has stored it we might see 0 and
            // skip the next wait by mistake.
            while (choosing_[j].value.load(std::memory_order_seq_cst)) {
                // Spin.
            }

            // Wait while thread j holds a ticket that beats ours.
            // Tie-break by thread id: (number[j], j) < (number[tid], tid).
            while (true) {
                int nj  = number_[j].value.load(std::memory_order_seq_cst);
                int nme = number_[tid].value.load(std::memory_order_seq_cst);

                // j has no ticket (left the CS or has not entered yet): skip.
                if (nj == 0) {
                    break;
                }

                // j's ticket beats ours: keep waiting.
                if (nj < nme) {
                    continue;
                }

                // Same ticket number: lower thread id wins.
                if (nj == nme && j < tid) {
                    continue;
                }

                // Our ticket beats j's (or j tied but we have lower id): enter.
                break;
            }
        }
    }

    // unlock(tid): set our ticket to 0 (not interested).
    void unlock(int tid) override {
        number_[tid].value.store(0, std::memory_order_seq_cst);
    }

    const char* name() override { return "bakery"; }

private:
    // Each element is padded to its own 64-byte cache line. Without padding,
    // up to 16 threads' entries share one line, so every time ONE thread
    // writes its own entry, the line is invalidated in every other core that
    // is spinning on a DIFFERENT thread's entry (false sharing).

    // choosing_[i] is true while thread i is reading numbers to pick its own.
    std::vector<PaddedAtomicBool> choosing_;

    // number_[i] is thread i's ticket; 0 means the thread is not interested.
    std::vector<PaddedAtomicInt> number_;
};

#endif // BAKERY_LOCK_H
