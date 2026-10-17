// ttas_spin_lock.h
// TtasSpinLock: test-and-test-and-set spinlock.
//
// Same flag as TasSpinLock, but waiting threads first only LOOK at the flag:
//   - lock():   repeat:
//                 1. "test":         spin with plain loads while the flag is
//                                    true (the lock looks taken);
//                 2. "test-and-set": when it looks free, try exchange(true);
//                                    if it returns false we own the lock,
//                                    otherwise another thread won the race,
//                                    so go back to step 1.
//   - unlock(): store false, exactly like TAS.
//
// Memory ordering:
//   - The spinning load uses memory_order_relaxed. It is only a hint ("is it
//     worth trying yet?"); we never enter the critical section because of it.
//     So it needs no ordering, only atomicity.
//   - The exchange uses memory_order_acquire, and the unlock store uses
//     memory_order_release, for the same reason as in TasSpinLock: the
//     release in unlock pairs with the acquire in lock, so the next owner
//     sees every write the previous owner made in its critical section.
//
// Note for the report: while the lock is held, waiters only READ the flag.
// Each core keeps a shared copy of the cache line in its own cache and spins
// on that copy without bus traffic. The line only moves when the owner writes
// false in unlock(). TAS, in contrast, writes on every spin.
//
// Owner: Person B.

#ifndef TTAS_SPIN_LOCK_H
#define TTAS_SPIN_LOCK_H

#include <atomic>

#include "lock.h"

class TtasSpinLock : public Lock {
public:
    explicit TtasSpinLock(int max_threads) : Lock(max_threads) {}

    // The thread id is not needed: every thread competes for the same flag.
    void lock(int /*tid*/) override {
        while (true) {
            // Step 1 ("test"): wait until the lock looks free.
            while (locked_.load(std::memory_order_relaxed)) {
                // Busy wait on our cached copy of the flag.
            }

            // Step 2 ("test-and-set"): try to take it. exchange returns the
            // old value; false means it was free and now it is ours.
            if (!locked_.exchange(true, std::memory_order_acquire)) {
                return;
            }
            // Another thread took it between step 1 and step 2: try again.
        }
    }

    void unlock(int /*tid*/) override {
        locked_.store(false, std::memory_order_release);
    }

    const char* name() override { return "ttas"; }

private:
    // true while some thread holds the lock. Starts unlocked.
    std::atomic<bool> locked_{false};
};

#endif // TTAS_SPIN_LOCK_H
