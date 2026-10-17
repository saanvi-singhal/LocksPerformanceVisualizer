// ThreadLanes.jsx
// Four lanes: idle, waiting, in critical section, done. Each thread's chip
// sits in the lane of its current status, so you can watch threads move
// from waiting into the critical section and out again. The critical
// section lane turns red when more than one thread is inside.
import { DONE, IDLE, IN_CS, WAITING } from "../sim/engine.js";
import { ThreadChip } from "./ThreadChip.jsx";

const LANES = [
  { status: IDLE, title: "idle" },
  { status: WAITING, title: "waiting" },
  { status: IN_CS, title: "critical section" },
  { status: DONE, title: "done" },
];

export function ThreadLanes({ sim, threadColors }) {
  return (
    <div className="sim-panel">
      <h3>Threads</h3>
      <div className="lanes">
        {LANES.map((lane) => {
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
