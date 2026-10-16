// tas_spin_lock.h
// TasSpinLock: test-and-set spinlock, the simplest hardware-based lock.
//
// TODO (Person B): implement the test-and-set spinlock.
//
// What it must do:
//   - Keep one std::atomic<bool> "locked" flag, initially false.
//   - lock(tid):   loop on locked.exchange(true) until it returns false.
//                  exchange is an atomic read-modify-write: it sets the flag
//                  and returns the old value in one indivisible step.
//   - unlock(tid): locked.store(false).
//   - Note for the report: every spin is a write to the shared cache line,
//     so waiting threads keep stealing the line from each other.
//
// Until it is implemented this stub behaves like NoLock (no mutual
// exclusion) and prints a warning the first time it is used.

#ifndef TAS_SPIN_LOCK_H
#define TAS_SPIN_LOCK_H

#include <atomic>
#include <iostream>

#include "lock.h"

class TasSpinLock : public Lock {
public:
    explicit TasSpinLock(int max_threads) : Lock(max_threads) {}

    void lock(int /*tid*/) override { warn_not_implemented(); }

    void unlock(int /*tid*/) override {}

    const char* name() override { return "tas"; }

private:
    // exchange(true) returns the old value, so only the very first caller
    // sees false and prints the warning.
    void warn_not_implemented() {
        if (!warned_.exchange(true)) {
            std::cerr << "WARNING: TasSpinLock is NOT IMPLEMENTED yet; "
                         "it behaves like NoLock (no mutual exclusion)!\n";
        }
    }

    std::atomic<bool> warned_{false};
};

#endif // TAS_SPIN_LOCK_H
