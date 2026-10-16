// mutex_lock.h
// MutexLock: a thin wrapper around std::mutex.
//
// This is the baseline that every other lock is compared against. On Linux,
// std::mutex is built on a pthread mutex, which uses a futex: a waiting thread
// is put to sleep by the kernel instead of spinning on the CPU.

#ifndef MUTEX_LOCK_H
#define MUTEX_LOCK_H

#include <mutex>

#include "lock.h"

class MutexLock : public Lock {
public:
    explicit MutexLock(int max_threads) : Lock(max_threads) {}

    // std::mutex does not need to know which thread is calling,
    // so the thread id is ignored.
    void lock(int /*tid*/) override { m_.lock(); }

    void unlock(int /*tid*/) override { m_.unlock(); }

    const char* name() override { return "mutex"; }

private:
    std::mutex m_;
};

#endif // MUTEX_LOCK_H
