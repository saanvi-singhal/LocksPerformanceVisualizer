// bakery_lock.h
// BakeryLock: Lamport's Bakery algorithm, software mutual exclusion for N threads.
//
// TODO (Person A): implement the Bakery algorithm.
//
// What it must do:
//   - Keep two arrays sized by max_threads_: choosing[i] (thread i is picking
//     a number) and number[i] (thread i's ticket, 0 = not interested).
//   - lock(tid):   choosing[tid] = true;
//                  number[tid] = 1 + max of all numbers;
//                  choosing[tid] = false;
//                  then for every other thread j: wait while choosing[j],
//                  then wait while number[j] != 0 and
//                  (number[j], j) < (number[tid], tid).
//   - unlock(tid): number[tid] = 0.
//   - Use std::atomic with sequentially consistent ordering for both arrays.
//   - Note for the report: every lock() scans all N threads, so the cost
//     grows with the thread count.
//
// Until it is implemented this stub behaves like NoLock (no mutual
// exclusion) and prints a warning the first time it is used.

#ifndef BAKERY_LOCK_H
#define BAKERY_LOCK_H

#include <atomic>
#include <iostream>

#include "lock.h"

class BakeryLock : public Lock {
public:
    explicit BakeryLock(int max_threads) : Lock(max_threads) {}

    void lock(int /*tid*/) override { warn_not_implemented(); }

    void unlock(int /*tid*/) override {}

    const char* name() override { return "bakery"; }

private:
    // exchange(true) returns the old value, so only the very first caller
    // sees false and prints the warning.
    void warn_not_implemented() {
        if (!warned_.exchange(true)) {
            std::cerr << "WARNING: BakeryLock is NOT IMPLEMENTED yet; "
                         "it behaves like NoLock (no mutual exclusion)!\n";
        }
    }

    std::atomic<bool> warned_{false};
};

#endif // BAKERY_LOCK_H
