// semaphore_lock.h
// SemaphoreLock: a binary POSIX semaphore (sem_t) used as a lock.
//
// A semaphore is a counter that the kernel helps manage. We start it at 1,
// meaning "unlocked":
//   - lock():   sem_wait, the P / wait operation. If the value is 1, it
//               becomes 0 and we enter. If it is already 0, the thread is put
//               to sleep until another thread calls sem_post.
//   - unlock(): sem_post, the V / signal operation. It sets the value back to
//               1 and wakes one sleeping waiter, if there is one.
// Because the value is only ever 0 or 1, at most one thread is inside the
// critical section: a "binary semaphore".
//
// sem_wait can return early with the error EINTR when a signal arrives while
// the thread is asleep. That does NOT mean we got the lock, so we simply call
// sem_wait again.
//
// Memory ordering: there are no std::atomic operations here. POSIX requires
// sem_wait and sem_post to "synchronize memory", so they act as a full
// barrier: everything the previous owner wrote before sem_post is visible to
// the next owner after its sem_wait returns.
//
// Note for the report: waiters sleep instead of spinning, like a mutex. This
// costs a system call when there is contention, but it does not waste CPU
// time, which matters when there are more threads than cores.
//
// Owner: Person B.

#ifndef SEMAPHORE_LOCK_H
#define SEMAPHORE_LOCK_H

#include <semaphore.h>

#include <cerrno>
#include <cstdio>
#include <cstdlib>

#include "lock.h"

class SemaphoreLock : public Lock {
public:
    explicit SemaphoreLock(int max_threads) : Lock(max_threads) {
        // Second argument 0: shared between the threads of this process only.
        // Third argument 1: initial value, meaning "unlocked".
        if (sem_init(&sem_, 0, 1) != 0) {
            std::perror("sem_init");
            std::exit(1);
        }
    }

    ~SemaphoreLock() override {
        sem_destroy(&sem_);
    }

    // The thread id is not needed: the semaphore does not care who calls it.
    void lock(int /*tid*/) override {
        // Retry if a signal interrupted the wait (errno == EINTR).
        while (sem_wait(&sem_) != 0) {
            if (errno != EINTR) {
                std::perror("sem_wait");
                std::exit(1);
            }
        }
    }

    void unlock(int /*tid*/) override {
        if (sem_post(&sem_) != 0) {
            std::perror("sem_post");
            std::exit(1);
        }
    }

    const char* name() override { return "semaphore"; }

private:
    sem_t sem_;
};

#endif // SEMAPHORE_LOCK_H
