// semaphore_lock.h
// SemaphoreLock: a binary POSIX semaphore (sem_t) used as a lock.
//
// TODO (Person B): implement the semaphore lock.
//
// What it must do:
//   - Hold one sem_t (from <semaphore.h>).
//   - Constructor: sem_init(&sem, 0, 1)  -> not shared between processes,
//                  initial value 1 (meaning "unlocked").
//   - Destructor:  sem_destroy(&sem).
//   - lock(tid):   sem_wait(&sem)  (the P / wait operation; sleeps if the
//                  value is 0, otherwise decrements it).
//   - unlock(tid): sem_post(&sem)  (the V / signal operation; increments the
//                  value and wakes one sleeping waiter).
//   - Note for the report: waiters sleep instead of spinning, like a mutex.
//
// Until it is implemented this stub behaves like NoLock (no mutual
// exclusion) and prints a warning the first time it is used.

#ifndef SEMAPHORE_LOCK_H
#define SEMAPHORE_LOCK_H

#include <atomic>
#include <iostream>

#include "lock.h"

class SemaphoreLock : public Lock {
public:
    explicit SemaphoreLock(int max_threads) : Lock(max_threads) {}

    void lock(int /*tid*/) override { warn_not_implemented(); }

    void unlock(int /*tid*/) override {}

    const char* name() override { return "semaphore"; }

private:
    // exchange(true) returns the old value, so only the very first caller
    // sees false and prints the warning.
    void warn_not_implemented() {
        if (!warned_.exchange(true)) {
            std::cerr << "WARNING: SemaphoreLock is NOT IMPLEMENTED yet; "
                         "it behaves like NoLock (no mutual exclusion)!\n";
        }
    }

    std::atomic<bool> warned_{false};
};

#endif // SEMAPHORE_LOCK_H
