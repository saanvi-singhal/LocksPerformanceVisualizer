// peterson_lock.h
// PetersonLock: Peterson's classic two-thread software mutual exclusion.
//
// Each thread announces intent by raising its flag, then politely gives the
// turn to the other thread before waiting. If the other thread is both
// interested (flag set) and holds the turn, this thread keeps spinning;
// otherwise it enters the critical section.
//
// Works for exactly 2 threads (tid = 0 or 1). The harness enforces this.
//
// Memory ordering: every flag and turn operation uses seq_cst (sequentially
// consistent) ordering. Without it a CPU can reorder the store to flag[tid]
// past the load of flag[other], letting both threads see the other's flag as
// false and enter together, breaking mutual exclusion.
//
// Owner: Person A.

#ifndef PETERSON_LOCK_H
#define PETERSON_LOCK_H

#include <atomic>

#include "lock.h"

class PetersonLock : public Lock {
public:
    explicit PetersonLock(int max_threads) : Lock(max_threads) {
        flag_[0].store(false, std::memory_order_seq_cst);
        flag_[1].store(false, std::memory_order_seq_cst);
        turn_.store(0, std::memory_order_seq_cst);
    }

    // lock(tid): announce interest, yield the turn, then wait until it is
    // safe to enter (the other thread is not interested, or the turn is ours).
    void lock(int tid) override {
        int other = 1 - tid;

        // Step 1: I want to enter.
        flag_[tid].store(true, std::memory_order_seq_cst);

        // Step 2: Give the turn to the other thread.
        // seq_cst guarantees this store is visible before we read flag[other]
        // below, so we cannot both see each other's flag as false.
        turn_.store(other, std::memory_order_seq_cst);

        // Step 3: Spin while the other thread wants in AND it is its turn.
        // Both conditions must hold for us to be blocked.
        while (flag_[other].load(std::memory_order_seq_cst) &&
               turn_.load(std::memory_order_seq_cst) == other) {
            // Busy wait: yield the CPU to avoid burning a whole core.
            // On a uniprocessor this is essential; on multicore it is polite.
        }
    }

    // unlock(tid): lower my flag so the other thread can proceed.
    void unlock(int tid) override {
        flag_[tid].store(false, std::memory_order_seq_cst);
    }

    const char* name() override { return "peterson"; }

private:
    // flag_[i] is true while thread i wants to enter or is in the CS.
    // Padded separately so they do not share a cache line.
    std::atomic<bool> flag_[2];

    // turn_ holds the id of the thread that must wait if both want in.
    std::atomic<int> turn_;
};

#endif // PETERSON_LOCK_H
