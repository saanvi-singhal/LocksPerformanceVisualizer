// ttas_spin_lock.h
// TtasSpinLock: test-and-test-and-set spinlock.
//
// TODO (Person B): implement the test-and-test-and-set spinlock.
//
// What it must do:
//   - Keep one std::atomic<bool> "locked" flag, initially false.
//   - lock(tid):   repeat:
//                    1. spin with plain loads while locked.load() is true
//                       (the "test" part; reads stay in the local cache);
//                    2. when it looks free, try locked.exchange(true);
//                       if that returns false we own the lock, else go to 1.
//   - unlock(tid): locked.store(false).
//   - Note for the report: waiting threads only read the flag, so there is
//     much less cache-line traffic than with TAS.
//
// Until it is implemented this stub behaves like NoLock (no mutual
// exclusion) and prints a warning the first time it is used.

#ifndef TTAS_SPIN_LOCK_H
#define TTAS_SPIN_LOCK_H

#include <atomic>
#include <iostream>

#include "lock.h"

class TtasSpinLock : public Lock {
public:
    explicit TtasSpinLock(int max_threads) : Lock(max_threads) {}

    void lock(int /*tid*/) override { warn_not_implemented(); }

    void unlock(int /*tid*/) override {}

    const char* name() override { return "ttas"; }

private:
    // exchange(true) returns the old value, so only the very first caller
    // sees false and prints the warning.
    void warn_not_implemented() {
        if (!warned_.exchange(true)) {
            std::cerr << "WARNING: TtasSpinLock is NOT IMPLEMENTED yet; "
                         "it behaves like NoLock (no mutual exclusion)!\n";
        }
    }

    std::atomic<bool> warned_{false};
};

#endif // TTAS_SPIN_LOCK_H
