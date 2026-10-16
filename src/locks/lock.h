// lock.h
// The common interface that every lock in this project implements.
//
// The benchmark harness only ever talks to a Lock through this class, so any
// lock can be plugged into the same benchmark loop.
//
// Every method receives the id of the calling thread (0 to N-1). Most locks
// ignore it, but Peterson's algorithm and the Bakery algorithm need it,
// because each thread works with its own flag / ticket slot.
//
// Owner: Person A. Agreed by both people on day 1; do not change it without
// telling each other.

#ifndef LOCK_H
#define LOCK_H

class Lock {
public:
    // max_threads is the largest number of threads that will ever use this
    // lock. Locks such as Bakery use it to size their per-thread arrays.
    explicit Lock(int max_threads) : max_threads_(max_threads) {}

    // A virtual destructor is required so that deleting a derived lock
    // through a Lock pointer runs the derived class's destructor too.
    virtual ~Lock() {}

    // Called before entering the critical section. Must not return until
    // the calling thread is the only one inside the critical section.
    virtual void lock(int tid) = 0;

    // Called when leaving the critical section.
    virtual void unlock(int tid) = 0;

    // Short name of the lock, printed in the CSV output (for example "mutex").
    virtual const char* name() = 0;

protected:
    int max_threads_;
};

#endif // LOCK_H
