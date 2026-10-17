// ticket_lock.h
// TicketLock: a FIFO spinlock, like taking a numbered ticket at a counter.
//
// Two counters, both starting at 0:
//   - next_ticket_: the next number to hand out.
//   - now_serving_: the number that may enter the critical section now.
//
//   - lock():   take a ticket with next_ticket_.fetch_add(1). fetch_add is an
//               atomic read-modify-write, so no two threads ever get the same
//               number. Then spin until now_serving_ equals our ticket.
//   - unlock(): now_serving_.fetch_add(1), which calls the next ticket.
//
// Memory ordering:
//   - Taking a ticket uses memory_order_relaxed. The ticket number only has to
//     be unique (fetch_add guarantees that on its own); it does not protect
//     any data, so it needs no ordering.
//   - The spinning load of now_serving_ uses memory_order_acquire, and the
//     increment in unlock() uses memory_order_release. This acquire/release
//     pair on now_serving_ hands the critical section from one owner to the
//     next: the new owner sees every write the previous owner made.
//
// The counters are unsigned. When they reach the maximum value they wrap
// around to 0, which is well defined for unsigned integers in C++, and both
// counters wrap the same way, so the "==" comparison still works.
//
// Note for the report: threads enter in the order they took tickets (FIFO),
// so no thread can starve; this is the fairness reference. The cost: if the
// thread holding the next ticket is not running (for example when there are
// more threads than cores), everybody behind it has to wait as well.
//
// Owner: Person B.

#ifndef TICKET_LOCK_H
#define TICKET_LOCK_H

#include <atomic>

#include "lock.h"

class TicketLock : public Lock {
public:
    explicit TicketLock(int max_threads) : Lock(max_threads) {}

    // The thread id is not needed: the ticket number decides the order.
    void lock(int /*tid*/) override {
        unsigned my_ticket = next_ticket_.fetch_add(1, std::memory_order_relaxed);

        // Wait until our number is called.
        while (now_serving_.load(std::memory_order_acquire) != my_ticket) {
            // Busy wait.
        }
    }

    void unlock(int /*tid*/) override {
        // Only the lock holder runs this, so no other thread changes
        // now_serving_ at the same time.
        now_serving_.fetch_add(1, std::memory_order_release);
    }

    const char* name() override { return "ticket"; }

private:
    // alignas(64) puts each counter on its own 64-byte cache line, so threads
    // taking a new ticket do not disturb the cache line that the waiting
    // threads are spinning on (avoids false sharing between the two).
    alignas(64) std::atomic<unsigned> next_ticket_{0};
    alignas(64) std::atomic<unsigned> now_serving_{0};
};

#endif // TICKET_LOCK_H
