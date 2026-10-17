// no_lock.h
// NoLock: a "lock" that does nothing at all.
//
// It is DELIBERATELY BROKEN. With NoLock, several threads can be inside the
// critical section at the same time, so increments of the shared counter get
// lost (two threads read the same value, both add one, both write back) and
// the final count comes out wrong. This demonstrates why locks are needed.

#ifndef NO_LOCK_H
#define NO_LOCK_H

#include "lock.h"

class NoLock : public Lock {
public:
    explicit NoLock(int max_threads) : Lock(max_threads) {}

    // The parameter name is commented out because it is unused; this keeps
    // the compiler from printing an "unused parameter" warning.
    void lock(int /*tid*/) override {
        // Intentionally empty: no mutual exclusion.
    }

    void unlock(int /*tid*/) override {
        // Intentionally empty.
    }

    const char* name() override { return "none"; }
};

#endif // NO_LOCK_H
