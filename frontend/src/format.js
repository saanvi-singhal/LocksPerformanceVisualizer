// format.js
// Small helpers for turning numbers into readable text and for log axes.

// 1234567 -> "1.23M", 45600 -> "45.6k", 0.25 -> "0.25".
export function shortNumber(value) {
  if (value === null || value === undefined) return "–";
  const abs = Math.abs(value);
  if (abs >= 1e9) return trim(value / 1e9) + "G";
  if (abs >= 1e6) return trim(value / 1e6) + "M";
  if (abs >= 1e3) return trim(value / 1e3) + "k";
  return trim(value);
}

// Keep three significant digits and drop trailing zeros.
function trim(value) {
  return String(Number(value.toPrecision(3)));
}

// Tick values for a log-scale axis: 1, 2 and 5 times each power of ten,
// from just below the smallest value to just above the largest. If the
// values span more than 3 powers of ten, only the powers of ten are used,
// so the labels do not crowd together.
// Returns { ticks, domain } for a Recharts axis.
export function logTicks(values, minimum) {
  const positive = values.filter((v) => v !== null && v !== undefined && v > 0);
  if (positive.length === 0) {
    return { ticks: [1, 10], domain: [1, 10] };
  }
  let low = Math.min(...positive);
  const high = Math.max(...positive);
  if (minimum !== undefined) {
    low = Math.min(low, minimum);
  }

  const decades = Math.log10(high) - Math.log10(low);
  const steps = decades > 3 ? [1] : [1, 2, 5];

  const ticks = [];
  for (let exp = Math.floor(Math.log10(low)) - 1; exp <= Math.ceil(Math.log10(high)) + 1; exp++) {
    for (const step of steps) {
      ticks.push(step * Math.pow(10, exp));
    }
  }
  // Keep the tick just below the lowest value and just above the highest.
  let first = 0;
  while (first + 1 < ticks.length && ticks[first + 1] <= low) first++;
  let last = ticks.length - 1;
  while (last - 1 >= 0 && ticks[last - 1] >= high) last--;
  const kept = ticks.slice(first, last + 1);
  return { ticks: kept, domain: [kept[0], kept[kept.length - 1]] };
}
