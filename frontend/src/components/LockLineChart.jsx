// LockLineChart.jsx
// One line chart with one line per lock, used for throughput, fairness and
// time per operation. It also draws:
//   - a legend (HTML, so it wraps on a phone screen),
//   - a hover tooltip with a vertical crosshair,
//   - a "Show as table" view with the same numbers, so no value is only
//     available by hovering or by colour.
import { useState } from "react";
import {
  CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";

import { BROKEN_LOCKS, LOCK_MARKERS, lockLabel } from "../locks.js";
import { logTicks, shortNumber } from "../format.js";
import { LegendSwatch, Marker } from "./Marker.jsx";

// Props:
//   rows       [{ x: "1", <lock>: value, ... }]  one object per x position
//   locks      lock names to draw, in legend order
//   colors     { lock: "#hex" } for the current theme
//   theme      { surface, grid, axis, muted, text } colours for the current theme
//   xLabel, yLabel, title, caption   text
//   format     function value -> string, for tooltip and table
//   minY       optional lowest value the log axis must show (e.g. 1 for fairness)
//   missingText  text for a point that was run but has no value; such points
//              are listed in row.undefinedFor. A point that was not run at
//              all always shows "–".
//   footnote   text shown under the chart when such a point exists
//   hidden     locks the viewer switched off (shared by all charts)
//   onToggle   called with a lock name when its legend entry is clicked
//   highlightX (optional) x value to mark with a vertical line (the thread
//              count chosen with the slider)
//   exactFormat  function value -> string with the exact value, for the
//              hover tooltip (the table keeps the shorter "format")
//   id         (optional) element id, so a link can scroll to this chart
export function LockLineChart({
  rows, locks, colors, theme, xLabel, title, caption, format, minY, missingText, footnote,
  hidden, onToggle, highlightX, exactFormat, id,
}) {
  const [showTable, setShowTable] = useState(false);

  // Locks that have at least one value in these rows get a legend entry;
  // of those, the ones not switched off are drawn.
  const present = locks.filter((lock) => rows.some((row) => row[lock] != null));
  const drawn = present.filter((lock) => !hidden.includes(lock));
  const hasUndefined = rows.some((row) => (row.undefinedFor || []).some((lock) => drawn.includes(lock)));

  const values = [];
  for (const row of rows) {
    for (const lock of drawn) values.push(row[lock]);
  }
  const axis = logTicks(values, minY);

  return (
    <figure className="chart-card" id={id}>
      <figcaption>
        <h3>{title}</h3>
        {caption && <p className="caption">{caption}</p>}
      </figcaption>

      {/* Each legend entry is a button: click to hide or show that lock on every chart. */}
      <ul className="legend" aria-label="Locks (click to hide or show)">
        {present.map((lock) => (
          <li key={lock}>
            <button
              type="button"
              className="legend-item"
              aria-pressed={!hidden.includes(lock)}
              onClick={() => onToggle(lock)}
            >
              <LegendSwatch
                shape={LOCK_MARKERS[lock]}
                color={colors[lock]}
                surface={theme.surface}
                dashed={BROKEN_LOCKS.includes(lock)}
              />
              {lockLabel(lock)}
            </button>
          </li>
        ))}
      </ul>

      <div className="chart-box">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows} margin={{ top: 8, right: 12, bottom: 28, left: 8 }}>
            <CartesianGrid stroke={theme.grid} vertical={false} />
            {highlightX !== undefined && (
              <ReferenceLine x={highlightX} stroke={theme.muted} strokeWidth={1.5} />
            )}
            <XAxis
              dataKey="x"
              stroke={theme.axis}
              tick={{ fill: theme.muted, fontSize: 12 }}
              tickLine={false}
              label={{ value: xLabel, position: "bottom", offset: 8, fill: theme.muted, fontSize: 12 }}
            />
            <YAxis
              scale="log"
              type="number"
              domain={axis.domain}
              ticks={axis.ticks}
              allowDataOverflow
              stroke={theme.axis}
              tick={{ fill: theme.muted, fontSize: 12 }}
              tickLine={false}
              tickFormatter={shortNumber}
              width={48}
            />
            <Tooltip
              cursor={{ stroke: theme.axis, strokeWidth: 1 }}
              content={
                <ChartTooltip
                  locks={drawn} colors={colors} theme={theme}
                  format={exactFormat || format} xLabel={xLabel} missingText={missingText}
                />
              }
            />
            {drawn.map((lock) => (
              <Line
                key={lock}
                dataKey={lock}
                name={lockLabel(lock)}
                stroke={colors[lock]}
                strokeWidth={2}
                strokeDasharray={BROKEN_LOCKS.includes(lock) ? "5 4" : undefined}
                isAnimationActive={false}
                connectNulls={false}
                dot={(p) => <DotFor key={lock + p.index} lock={lock} p={p} colors={colors} theme={theme} size={9} />}
                activeDot={(p) => <DotFor key={lock + "a" + p.index} lock={lock} p={p} colors={colors} theme={theme} size={12} />}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {hasUndefined && footnote && <p className="footnote">{footnote}</p>}

      <button className="link-button" onClick={() => setShowTable(!showTable)}>
        {showTable ? "Hide table" : "Show as table"}
      </button>
      {showTable && (
        <DataTable rows={rows} locks={drawn} xLabel={xLabel} format={format} missingText={missingText} />
      )}
    </figure>
  );
}

// Draws the marker for one point (or nothing if the value is missing).
function DotFor({ lock, p, colors, theme, size }) {
  if (p.cx == null || p.cy == null || p.value == null) {
    return <g />;
  }
  return (
    <Marker
      shape={LOCK_MARKERS[lock]}
      cx={p.cx}
      cy={p.cy}
      color={colors[lock]}
      surface={theme.surface}
      size={size}
    />
  );
}

// Tooltip: the x value, then every lock's value, largest first. Locks that
// were run here but have no value come last, shown with missingText.
function ChartTooltip({ active, payload, label, locks, colors, theme, format, xLabel, missingText }) {
  if (!active || !payload || payload.length === 0) return null;
  const row = payload[0].payload;
  const undefinedFor = missingText ? (row.undefinedFor || []) : [];
  const entries = locks
    .filter((lock) => row[lock] != null)
    .sort((a, b) => row[b] - row[a])
    .concat(locks.filter((lock) => undefinedFor.includes(lock)));
  return (
    <div className="tooltip">
      <div className="tooltip-title">{xLabel === "threads" ? label + " threads" : xLabel + ": " + label}</div>
      {entries.map((lock) => (
        <div className="tooltip-row" key={lock}>
          <LegendSwatch
            shape={LOCK_MARKERS[lock]}
            color={colors[lock]}
            surface={theme.surface}
            dashed={BROKEN_LOCKS.includes(lock)}
          />
          <span className="tooltip-name">{lockLabel(lock)}</span>
          <span className="tooltip-value">{row[lock] == null ? missingText : format(row[lock])}</span>
        </div>
      ))}
    </div>
  );
}

// Text for one table cell: the value, missingText if the point was run but
// has no value, or "–" if it was not run at all.
function cellText(row, lock, format, missingText) {
  if (row[lock] != null) return format(row[lock]);
  if (missingText && (row.undefinedFor || []).includes(lock)) return missingText;
  return "–";
}

// The same numbers as the chart, as a table (one row per lock).
function DataTable({ rows, locks, xLabel, format, missingText }) {
  return (
    <div className="table-scroll">
      <table className="data-table">
        <thead>
          <tr>
            <th scope="col">lock \ {xLabel}</th>
            {rows.map((row) => <th scope="col" key={row.x}>{row.x}</th>)}
          </tr>
        </thead>
        <tbody>
          {locks.map((lock) => (
            <tr key={lock}>
              <th scope="row">{lockLabel(lock)}</th>
              {rows.map((row) => (
                <td key={row.x}>{cellText(row, lock, format, missingText)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
