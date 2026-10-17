// peterson_relaxed_lock.h
// PetersonRelaxedLock: Peterson's algorithm with RELAXED memory ordering.
//
// This is a DELIBERATELY BROKEN variant used for the memory-ordering demo.
//
// The difference from PetersonLock: both flag stores and flag loads use
// memory_order_relaxed instead of memory_order_seq_cst.
//
// Why it can break: on a modern CPU (x86 has Total Store Order; ARM/POWER have
// weaker models) a relaxed store to flag[tid] may not be visible to the other
// core before that core reads flag[tid]. Both threads can therefore see the
// other's flag as false, conclude "the other is not interested", and enter the
// critical section at the same time — mutual exclusion fails.
//
// On x86, TSO makes this hard to observe because stores are not actually
// reordered past later stores. Use --pin and a very high iteration count, or
// run on an ARM/POWER system (e.g. AWS Graviton). If it never fails on your
// machine, record that and explain why TSO makes it unlikely on x86 — that is
// itself a valid viva answer.
//
// Owner: Person A.

#ifndef PETERSON_RELAXED_LOCK_H
#define PETERSON_RELAXED_LOCK_H

#include <atomic>

#include "lock.h"

class PetersonRelaxedLock : public Lock {
public:
    explicit PetersonRelaxedLock(int max_threads) : Lock(max_threads) {
        // Even the initialisation uses relaxed: this is the "broken" version.
        flag_[0].store(false, std::memory_order_relaxed);
        flag_[1].store(false, std::memory_order_relaxed);
        turn_.store(0, std::memory_order_relaxed);
    }

    // lock(tid): same logic as PetersonLock but with relaxed ordering.
    // The lack of ordering guarantees means the CPU or compiler may reorder
    // the flag store after the flag load, destroying the safety argument.
    void lock(int tid) override {
        int other = 1 - tid;

        // Step 1: announce interest — relaxed, no ordering guarantee.
        flag_[tid].store(true, std::memory_order_relaxed);

        // Step 2: yield the turn — relaxed.
        // A seq_cst fence here would restore correctness; without it the
        // store to flag_[tid] above might not yet be visible to the other core
        // when the other core reads flag_[other] below.
        turn_.store(other, std::memory_order_relaxed);

        // Step 3: spin — relaxed loads.
        while (flag_[other].load(std::memory_order_relaxed) &&
               turn_.load(std::memory_order_relaxed) == other) {
            // Busy wait.
        }
    }

    // unlock(tid): lower the flag — relaxed.
    void unlock(int tid) override {
        flag_[tid].store(false, std::memory_order_relaxed);
    }

    const char* name() override { return "peterson_relaxed"; }

private:
    std::atomic<bool> flag_[2];
    std::atomic<int>  turn_;
};

#endif // PETERSON_RELAXED_LOCK_H
