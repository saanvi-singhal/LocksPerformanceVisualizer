// peterson_lock.h
// PetersonLock: Peterson's software solution for exactly TWO threads.
//
// TODO (Person A): implement Peterson's algorithm.
//
// What it must do:
//   - Keep one flag per thread ("I want to enter") and a single "turn"
//     variable.
//   - lock(tid):   flag[tid] = true; turn = other; then wait while
//                  flag[other] is true AND turn == other.
//   - unlock(tid): flag[tid] = false.
//   - Use std::atomic with sequentially consistent ordering
//     (std::memory_order_seq_cst). Without it the CPU may reorder the store
//     to flag[tid] after the load of flag[other], and both threads can enter
//     the critical section together.
//   - Works for 2 threads only (tid is 0 or 1). The harness already refuses
//     any other thread count.
//
// Until it is implemented this stub behaves like NoLock (no mutual
// exclusion) and prints a warning the first time it is used.

#ifndef PETERSON_LOCK_H
#define PETERSON_LOCK_H

#include <atomic>
#include <iostream>

#include "lock.h"

class PetersonLock : public Lock {
public:
    explicit PetersonLock(int max_threads) : Lock(max_threads) {}

    void lock(int /*tid*/) override { warn_not_implemented(); }

    void unlock(int /*tid*/) override {}

    const char* name() override { return "peterson"; }

private:
    // exchange(true) returns the old value, so only the very first caller
    // sees false and prints the warning.
    void warn_not_implemented() {
        if (!warned_.exchange(true)) {
            std::cerr << "WARNING: PetersonLock is NOT IMPLEMENTED yet; "
                         "it behaves like NoLock (no mutual exclusion)!\n";
        }
    }

    std::atomic<bool> warned_{false};
};

#endif // PETERSON_LOCK_H
