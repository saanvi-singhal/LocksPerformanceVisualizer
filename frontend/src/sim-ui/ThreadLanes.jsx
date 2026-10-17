// ThreadLanes.jsx
// Lanes for the thread statuses: idle, waiting, (sleeping), in critical
// section, done. Each thread's chip sits in the lane of its current status,
// so you can watch threads move from waiting into the critical section and
// out again. The critical-section lane turns red when more than one thread
// is inside. The "sleeping" lane is only shown for locks whose waiting
// threads sleep (semaphore, mutex).
import { DONE, IDLE, IN_CS, SLEEPING, WAITING } from "../sim/engine.js";
import { ThreadChip } from "./ThreadChip.jsx";

export function ThreadLanes({ sim, threadColors, showSleeping }) {
  const lanes = [
    { status: IDLE, title: "idle" },
    { status: WAITING, title: showSleeping ? "waiting (runnable)" : "waiting" },
  ];
  if (showSleeping) {
    lanes.push({ status: SLEEPING, title: "sleeping (not runnable)" });
  }
  lanes.push({ status: IN_CS, title: "critical section" });
  lanes.push({ status: DONE, title: "done" });

  return (
    <div className="sim-panel">
      <h3>Threads</h3>
      <div className="lanes">
        {lanes.map((lane) => {
          const threads = sim.threads.filter((t) => t.status === lane.status);
          const crowded = lane.status === IN_CS && threads.length > 1;
          return (
            <div key={lane.status} className={crowded ? "lane lane-violation" : "lane"}>
              <div className="lane-title">
                {lane.title}
                {crowded && <span className="lane-warning"> ✗ {threads.length} inside</span>}
              </div>
              <div className="lane-chips">
                {threads.map((t) => (
                  <ThreadChip
                    key={t.id}
                    tid={t.id}
                    color={threadColors[t.id]}
                    note={t.finished + "/" + sim.iterations}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
      <p className="caption">The small number on a chip is how many iterations that thread has finished.</p>
    </div>
  );
}
