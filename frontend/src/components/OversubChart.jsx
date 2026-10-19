// OversubChart.jsx
// The oversubscription result: for every lock, how much of its throughput
// is left when there are twice as many threads as CPUs, compared with
// exactly one thread per CPU. 100% = no loss.
//
// Horizontal bars on a LINEAR axis (bar length must be honest), sorted from
// most to least throughput kept, coloured by lock like every other chart.
import { useState } from "react";
import {
  Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";

import { lockLabel } from "../locks.js";
import { shortNumber } from "../format.js";

export function OversubChart({ rows, colors, theme, baseThreads, oversubThreads, cs }) {
  const [showTable, setShowTable] = useState(false);

  const sorted = rows.slice().sort((a, b) => b.retained_percent - a.retained_percent);
  const data = sorted.map((row) => ({
    lock: row.lock,
    name: lockLabel(row.lock),
    retained: row.retained_percent,
    base: row.base_ops_per_sec,
    over: row.oversub_ops_per_sec,
  }));
  const maxValue = Math.max(100, ...data.map((d) => d.retained));
  const height = 48 + data.length * 34;

  return (
    <figure className="chart-card">
      <figcaption>
        <h3>Throughput kept when oversubscribed (critical section: {cs})</h3>
        <p className="caption full-width">
          ops/s at {oversubThreads} threads as a percentage of ops/s at {baseThreads} threads
          ({oversubThreads} threads = 2 × CPUs). 100% means no loss.
        </p>
      </figcaption>

      <div className="chart-box" style={{ height: height }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 4, right: 64, bottom: 24, left: 4 }}>
            <CartesianGrid stroke={theme.grid} horizontal={false} />
            <XAxis
              type="number"
              domain={[0, Math.ceil(maxValue / 10) * 10]}
              stroke={theme.axis}
              tick={{ fill: theme.muted, fontSize: 12 }}
              tickLine={false}
              tickFormatter={(v) => v + "%"}
              label={{ value: "throughput kept (%)", position: "bottom", offset: 4, fill: theme.muted, fontSize: 12 }}
            />
            <YAxis
              type="category"
              dataKey="name"
              width={112}
              stroke={theme.axis}
              tick={{ fill: theme.text, fontSize: 12 }}
              tickLine={false}
            />
            <Tooltip
              cursor={{ fill: theme.grid, opacity: 0.5 }}
              content={<OversubTooltip baseThreads={baseThreads} oversubThreads={oversubThreads} />}
            />
            <Bar dataKey="retained" barSize={16} radius={[0, 4, 4, 0]} isAnimationActive={false}>
              {data.map((d) => <Cell key={d.lock} fill={colors[d.lock]} />)}
              <LabelList
                dataKey="retained"
                position="right"
                formatter={formatPercent}
                style={{ fill: theme.text, fontSize: 12 }}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <button className="link-button" onClick={() => setShowTable(!showTable)}>
        {showTable ? "Hide table" : "Show as table"}
      </button>
      {showTable && (
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">lock</th>
                <th scope="col">ops/s at {baseThreads}</th>
                <th scope="col">ops/s at {oversubThreads}</th>
                <th scope="col">kept</th>
              </tr>
            </thead>
            <tbody>
              {data.map((d) => (
                <tr key={d.lock}>
                  <th scope="row">{d.name}</th>
                  <td>{shortNumber(d.base)}</td>
                  <td>{shortNumber(d.over)}</td>
                  <td>{formatPercent(d.retained)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </figure>
  );
}

// 85.2 -> "85%", 0.0412 -> "0.04%".
function formatPercent(value) {
  if (value >= 10) return Math.round(value) + "%";
  if (value >= 1) return value.toFixed(1) + "%";
  return value.toFixed(2) + "%";
}

// Exact whole number with thousands separators, for the tooltip.
function exact(value) {
  return Math.round(value).toLocaleString("en-US");
}

function OversubTooltip({ active, payload, baseThreads, oversubThreads }) {
  if (!active || !payload || payload.length === 0) return null;
  const d = payload[0].payload;
  return (
    <div className="tooltip">
      <div className="tooltip-title">{d.name}</div>
      <div className="tooltip-row"><span className="tooltip-name">{baseThreads} threads</span><span className="tooltip-value">{exact(d.base)} ops/s</span></div>
      <div className="tooltip-row"><span className="tooltip-name">{oversubThreads} threads</span><span className="tooltip-value">{exact(d.over)} ops/s</span></div>
      <div className="tooltip-row"><span className="tooltip-name">kept</span><span className="tooltip-value">{d.retained.toFixed(3)}%</span></div>
    </div>
  );
}
