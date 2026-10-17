// peterson_relaxed_lock.h
// PetersonRelaxedLock: Peterson's algorithm with RELAXED memory ordering.
//
// This is a DELIBERATELY BROKEN variant used for the memory-ordering demo.
//
// The difference from PetersonLock: every store and load of flag_ and turn_
// uses memory_order_relaxed instead of memory_order_seq_cst.
//
// Why it breaks: Peterson's algorithm needs our store to flag[tid] to be
// visible to the other thread BEFORE we read flag[other]. Relaxed ordering
// does not promise that, so both threads can read the other's flag as false,
// conclude "the other is not interested", and enter the critical section at
// the same time: mutual exclusion fails.
//
// This happens on x86 too, and often. x86 (Total Store Order) keeps stores in
// order with other stores, but it does let a store wait in the core's store
// buffer while a LATER LOAD goes ahead ("store -> load reordering"). That is
// exactly the reordering that breaks Peterson. With seq_cst, the compiler adds
// a full barrier (on x86 an xchg or mfence instruction) that drains the store
// buffer first; with relaxed it emits a plain mov and no barrier.
//
// Measured on this project's x86 machine (AMD Ryzen): check_correctness.sh
// reports correct=false in most runs at 2 threads and 100000 iterations.
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
        // Without a barrier, the stores above can still be sitting in this
        // core's store buffer when the loads in step 3 run. A seq_cst fence
        // after this store (just before step 3) would restore correctness.
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
