# Lock Performance Comparison — Report (Person A sections)



---

## 1. Introduction

This report documents the design, implementation, and evaluation of several
mutual-exclusion algorithms as part of the lock-bench project. The project
benchmarks six lock families — two software-only locks (Peterson and Bakery),
three hardware-assisted spinlocks (TAS, TTAS, Ticket), a semaphore wrapper,
and the standard library mutex — across five experiments: correctness,
throughput scaling, fairness, critical-section length sensitivity, and
oversubscription. A sixth experiment demonstrates why memory ordering matters
by comparing Peterson's algorithm with sequentially consistent ordering against
a deliberately broken variant that uses relaxed ordering.

Person A owns the software-only locks (Peterson and Bakery), the benchmark
harness (`src/bench/main.cpp`), and the correctness test suite (`tests/`).
Person B owns the hardware-assisted spinlocks, the semaphore, the metrics
module, and the plotting scripts.

---

## 2. Background

### 2.1 The Critical Section Problem

A **critical section** is a region of code that accesses shared state that
must not be modified by more than one thread at a time. The classic example is
incrementing a shared counter: the read-modify-write sequence is not atomic, so
two threads that both read the same value and then both write back will produce
one increment instead of two, losing an update.

### 2.2 Requirements for a Correct Lock

Three properties must hold simultaneously:

1. **Mutual exclusion**: at most one thread is inside the critical section at
   any instant. This is the safety property; its violation causes data
   corruption.

2. **Progress** (deadlock freedom): if no thread is in the critical section and
   at least one thread wants to enter, then some thread must eventually be
   allowed in. A system that is stuck with the lock unclaimed violates progress.

3. **Bounded waiting** (starvation freedom): there is an upper bound on the
   number of times other threads may enter the critical section after a thread
   has requested entry. Without this, a single thread could be delayed
   indefinitely while others repeatedly cut in.

### 2.3 Memory Ordering

Modern CPUs and compilers reorder memory operations for performance. Stores may
become visible to other cores out of program order. A lock that relies on the
relative ordering of a flag-set and a flag-read to provide mutual exclusion
will break if the CPU reorders those operations. The C++ memory model exposes
this through the `std::atomic` ordering parameter:

- `memory_order_seq_cst` (sequentially consistent): the strongest guarantee.
  All seq_cst operations appear in a single total order across all threads.
  A store is always visible to any subsequent load by any thread.

- `memory_order_relaxed`: no ordering guarantee beyond the atomicity of the
  single operation itself. A store may become visible to other threads much
  later, and a later load by the same thread may be satisfied from a local
  store buffer before the value has propagated.

The memory-ordering demo in Section 5 makes this concrete.

---

## 3. PetersonLock

### 3.1 Algorithm

Peterson's algorithm (Gary Peterson, 1981) provides mutual exclusion for
exactly **two threads** using only shared reads and writes — no special
hardware instruction. The state is:

- `flag[2]`: `flag[i]` is `true` while thread `i` wants to enter or is in
  the critical section.
- `turn`: the id of the thread that must wait if both want in.

**lock(tid):**
```
flag[tid] = true          // I want to enter
turn      = other         // give the turn to the other thread
wait while flag[other] == true AND turn == other
```

**unlock(tid):**
```
flag[tid] = false         // I am no longer interested
```

The invariant is: if both threads are waiting, exactly one holds the turn, so
exactly one is blocked and the other may proceed. Once a thread leaves the
critical section it clears its flag, releasing the other.

### 3.2 Mutual Exclusion Proof Sketch

Suppose both threads T0 and T1 are in the critical section simultaneously.
Both must have exited the while-loop. The loop exits only when `flag[other]`
is false **or** `turn != other`. Since both are in the CS, both loops must have
exited. But `turn` is either 0 or 1 — it cannot be both. So at least one
thread's loop exited because the other's flag was false. But a thread only
clears its flag after leaving the CS, and we assumed both are in the CS. This
is a contradiction.

### 3.3 Progress and Bounded Waiting

If T0 is waiting and T1 is not interested (`flag[1] == false`), T0's while-
condition is immediately false and T0 enters. If T1 does want to enter, it
sets `turn = 0`, so T0's condition is false on `turn == other` (turn is 0,
other is 1) and T0 enters. Either way T0 waits for at most one entry by T1.

### 3.4 Memory Ordering Choice

Every operation uses `memory_order_seq_cst`. The critical step is:

```
flag[tid] = true          // seq_cst store
turn      = other         // seq_cst store
// --- now read flag[other] ---
```

With seq_cst, the store to `flag[tid]` is guaranteed to be visible to the
other core **before** that core reads `flag[tid]`. Without this guarantee (for
example with relaxed ordering), the other thread could read `flag[tid] == false`
even though we have already set it to `true`, and both threads could conclude
that the other is not interested, entering together. Section 5 demonstrates
this empirically.

### 3.5 Limitations

- Two threads only. The algorithm does not generalise to N threads without a
  tournament-tree construction.
- Busy waiting: the thread spins on the CPU rather than sleeping, so it
  consumes a full CPU core while blocked. This is fine for short waits but
  wastes energy and slows other work on a shared core.

---

## 4. BakeryLock

### 4.1 Algorithm

Lamport's Bakery algorithm (Leslie Lamport, 1974) extends the two-thread
idea to **N threads** by issuing each thread a ticket number, then serving
threads in ticket order. The name comes from a bakery where customers take a
numbered ticket from a dispenser and wait to be called.

The state is:

- `choosing[N]`: `choosing[i]` is `true` while thread `i` is reading numbers
  to decide its own ticket.
- `number[N]`: `number[i]` is thread `i`'s ticket; `0` means not interested.

**lock(tid):**
```
choosing[tid] = true
number[tid]   = 1 + max(number[0..N-1])
choosing[tid] = false

for each j ≠ tid:
    wait while choosing[j]                           // j is still picking
    wait while number[j] != 0
           AND (number[j], j) < (number[tid], tid)  // j has priority
```

**unlock(tid):**
```
number[tid] = 0
```

The pair comparison `(number[j], j) < (number[tid], tid)` is a lexicographic
order: first compare tickets; if equal, the lower thread id wins. This total
ordering prevents ties.

### 4.2 Why `choosing` Is Necessary

Without `choosing`, thread A could read `number[B] == 0` — before B has stored
its actual ticket — and skip the wait, entering the CS while B is about to
enter with a lower ticket. The `choosing` flag forces A to wait until B has
finished choosing, so A always sees B's correct ticket.

### 4.3 Mutual Exclusion Proof Sketch

Suppose T_i and T_j are both in the CS. WLOG `(number[j], j) < (number[i], i)`.
T_i must have exited the wait for thread j. That wait exits only if
`number[j] == 0` or `(number[j], j) >= (number[i], i)`. Both contradict our
assumption. Therefore at most one thread is in the CS.

### 4.4 Progress and Bounded Waiting

A thread that takes number `k` will enter the CS after all threads with numbers
less than `k` have exited. Since there are finitely many threads, the bound on
waiting is `N - 1` entries by other threads.

### 4.5 Memory Ordering Choice

All operations use `memory_order_seq_cst`. The key concern is the same as
Peterson: the store to `number[tid]` must be visible to every other thread
before they decide whether to wait for us, and our reads of `number[j]` must
see the most recent value. Seq_cst provides both guarantees.

### 4.6 Scalability Cost

Every call to `lock()` scans all N threads twice (once to find the max number,
once to wait for each). The work is O(N) per acquisition. This means Bakery
does not scale well to large thread counts — throughput drops as N grows, in
contrast to a spinlock whose work per acquisition is O(1). This is visible in
the throughput experiment.

---

## 5. Memory-Ordering Demo: PetersonRelaxedLock

### 5.1 What It Does

`PetersonRelaxedLock` is an intentionally broken variant of PetersonLock that
uses `memory_order_relaxed` for every flag store and load. The algorithm logic
is identical; only the ordering is weakened.

### 5.2 Why It Can Fail

With relaxed ordering:

1. Thread 0 stores `flag[0] = true` — relaxed. The CPU's store buffer has not
   yet sent this value to Thread 1's cache.
2. Thread 0 stores `turn = 1` — relaxed.
3. Thread 1 stores `flag[1] = true` — relaxed.
4. Thread 1 stores `turn = 0` — relaxed.
5. Thread 0 reads `flag[1]` — relaxed. Sees `false` (the store in step 3 has
   not propagated yet). Condition is false; T0 enters the CS.
6. Thread 1 reads `flag[0]` — relaxed. Sees `false` (the store in step 1 has
   not propagated yet). Condition is false; T1 enters the CS.

Both threads are now in the CS simultaneously. Mutual exclusion is violated.

### 5.3 x86 vs. Weaker Architectures

x86 uses Total Store Order (TSO), which is stronger than the C++ relaxed model.
On TSO, stores become visible to other cores in program order (though loads may
be served from a local store buffer). This makes the race window very narrow
on x86: the failure may be rare or never observed in short runs.

On ARM or POWER (which have truly weak memory models), the failure is much more
likely. To maximise the chance of observing the failure on x86:

- Use `--pin` to keep both threads on separate physical cores (eliminates
  inter-thread coherence that might accidentally hide the race).
- Use a very high iteration count: `--iters 10000000`.
- If it still does not fail on your x86 machine, record that observation and
  explain TSO — that is itself a valid viva answer about memory models.

### 5.4 ThreadSanitizer

TSan will reliably report a data race on `peterson_relaxed` because it tracks
the happens-before relation and sees that the flag stores are not ordered with
respect to the flag loads. Even on x86 where the physical hardware rarely
produces the observable outcome, TSan's instrumentation catches the logical
ordering violation.

For `peterson` (seq_cst), TSan should be clean: the sequential consistency
guarantee means the flag store happens-before the flag load in TSan's model,
so no race is reported.

---

## 6. Correctness Testing

### 6.1 How the Harness Decides Correctness

The benchmark harness (`src/bench/main.cpp`) uses a `volatile long long counter`
as the shared state. `volatile` forces the compiler to emit a separate load and
store for every increment — without it, the optimizer could merge N increments
into `counter += N`, making NoLock appear correct by eliminating the very race
we want to demonstrate.

After all threads finish, the harness checks whether `counter == threads × iters`.
This value is written into column 10 of the CSV as `true` or `false`.

### 6.2 check_correctness.sh

The script (`tests/check_correctness.sh`) runs every implemented lock and
classifies the result:

| Outcome | Meaning |
|---------|---------|
| `SKIP`  | The lock binary printed `NOT IMPLEMENTED` on stderr; the stub has not been replaced yet. |
| `INFO`  | The lock is expected to fail (NoLock, PetersonRelaxed); failure is printed but not counted. |
| `PASS`  | All runs reported `correct=true`. |
| `FAIL`  | At least one run reported `correct=false` for a lock that should be correct. |

The script exits non-zero if any `FAIL` occurs, making it suitable for CI.

A lock moves from `SKIP` to testable by **removing the `NOT IMPLEMENTED`
warning** from its source. The correctness script detects implementation by the
absence of that string on stderr.

### 6.3 ThreadSanitizer (run_tsan.sh)

The script `tests/run_tsan.sh` builds a TSan-instrumented binary
(`build-tsan/lock_bench`) and runs the four most relevant locks:

| Lock               | Expected TSan result |
|--------------------|---------------------|
| `none`             | DATA RACE (intentional) |
| `peterson`         | Clean |
| `peterson_relaxed` | DATA RACE (intentional) |
| `bakery`           | Clean |

TSan catches races that the hardware may not expose on x86 due to TSO, making
it an essential complement to the functional correctness check.

### 6.4 What TSan Reports for Each Lock

- **NoLock**: TSan reports a data race on `counter`. Two threads load `counter`,
  both increment their local copy, and both store — the second store overwrites
  the first. TSan sees the unsynchronised read-write pair.

- **PetersonLock** (seq_cst): TSan should be silent. The seq_cst operations
  establish a happens-before edge from `flag[tid] = true` through the
  spin-wait to the critical section entry, so TSan sees the increment as
  properly protected.

- **PetersonRelaxedLock**: TSan will report a race. The relaxed stores to
  `flag` do not create a happens-before edge, so TSan cannot prove that the
  CS is protected.

- **BakeryLock**: TSan should be silent for the same reason as PetersonLock —
  all operations are seq_cst and the protocol correctly establishes ordering.
