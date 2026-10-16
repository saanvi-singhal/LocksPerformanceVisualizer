// ticket_lock.h
// TicketLock: a FIFO spinlock, like taking a numbered ticket at a counter.
//
// TODO (Person B): implement the ticket lock.
//
// What it must do:
//   - Keep two std::atomic<unsigned> counters, both starting at 0:
//     next_ticket (the next number to hand out) and now_serving.
//   - lock(tid):   my_ticket = next_ticket.fetch_add(1);
//                  spin while now_serving.load() != my_ticket.
//   - unlock(tid): now_serving.fetch_add(1)  (serve the next ticket).
//   - Note for the report: threads enter in the order they arrived (FIFO),
//     so no thread can starve. This is the fairness reference.
//
// Until it is implemented this stub behaves like NoLock (no mutual
// exclusion) and prints a warning the first time it is used.

#ifndef TICKET_LOCK_H
#define TICKET_LOCK_H

#include <atomic>
#include <iostream>

#include "lock.h"

class TicketLock : public Lock {
public:
    explicit TicketLock(int max_threads) : Lock(max_threads) {}

    void lock(int /*tid*/) override { warn_not_implemented(); }

    void unlock(int /*tid*/) override {}

    const char* name() override { return "ticket"; }

private:
    // exchange(true) returns the old value, so only the very first caller
    // sees false and prints the warning.
    void warn_not_implemented() {
        if (!warned_.exchange(true)) {
            std::cerr << "WARNING: TicketLock is NOT IMPLEMENTED yet; "
                         "it behaves like NoLock (no mutual exclusion)!\n";
        }
    }

    std::atomic<bool> warned_{false};
};

#endif // TICKET_LOCK_H
