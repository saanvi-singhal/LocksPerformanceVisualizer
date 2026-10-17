// tas_spin_lock.h
// TasSpinLock: test-and-set spinlock, the simplest hardware-based lock.
//
// One atomic boolean "locked_" says whether some thread holds the lock.
//   - lock():   keep doing an atomic exchange(true) until it returns false.
//               exchange is a read-modify-write: it writes true and returns
//               the OLD value in one indivisible step. If the old value was
//               false, the lock was free and we have just taken it. If it was
//               true, someone else holds it, so we try again.
//   - unlock(): store false, so the next exchange by a waiter will succeed.
//
// Memory ordering:
//   - The exchange uses memory_order_acquire. "Acquire" means: nothing in our
//     critical section can be moved (by the compiler or the CPU) to before the
//     moment we took the lock, and we are guaranteed to see every write the
//     previous owner made inside its critical section.
//   - The unlock store uses memory_order_release. "Release" means: every write
//     we made inside the critical section becomes visible before the flag
//     turns false. Release (in unlock) pairs with acquire (in lock) and that
//     pair is what passes the protected data safely from one owner to the next.
//   - We do not need seq_cst: a lock only has to order the critical section
//     against the lock/unlock of the same flag, which acquire/release does.
//
// Note for the report: every spin is a WRITE to the shared cache line, so all
// the waiting cores keep stealing that line from each other (cache-line
// "ping-pong"). This is why TAS gets slow when many threads compete.
//
// Owner: Person B.

#ifndef TAS_SPIN_LOCK_H
#define TAS_SPIN_LOCK_H

#include <atomic>

#include "lock.h"

class TasSpinLock : public Lock {
public:
    explicit TasSpinLock(int max_threads) : Lock(max_threads) {}

    // The thread id is not needed: every thread competes for the same flag.
    void lock(int /*tid*/) override {
        // Keep trying until exchange returns false (the lock was free).
        while (locked_.exchange(true, std::memory_order_acquire)) {
            // Busy wait: somebody else holds the lock.
        }
    }

    void unlock(int /*tid*/) override {
        locked_.store(false, std::memory_order_release);
    }

    const char* name() override { return "tas"; }

private:
    // true while some thread holds the lock. Starts unlocked.
    std::atomic<bool> locked_{false};
};

#endif // TAS_SPIN_LOCK_H
