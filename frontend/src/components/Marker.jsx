// Marker.jsx
// Draws one data-point marker (circle, square, triangle, ...) in SVG.
// Every lock has its own shape, so lines can be told apart without colour.
// A ring in the surface colour separates overlapping markers.

export function Marker({ shape, cx, cy, color, surface, size = 9 }) {
  const r = size / 2;
  const hollow = shape === "circleHollow" || shape === "squareHollow";
  const fill = hollow ? surface : color;
  const common = {
    fill: fill,
    stroke: hollow ? color : surface,
    strokeWidth: 2,
    paintOrder: "stroke",
  };

  if (shape === "circle" || shape === "circleHollow") {
    return <circle cx={cx} cy={cy} r={r} {...common} />;
  }
  if (shape === "square" || shape === "squareHollow") {
    return <rect x={cx - r} y={cy - r} width={size} height={size} {...common} />;
  }
  if (shape === "triangle") {
    return <polygon points={points(cx, cy, [[0, -r - 1], [r + 1, r], [-r - 1, r]])} {...common} />;
  }
  if (shape === "triangleDown") {
    return <polygon points={points(cx, cy, [[0, r + 1], [r + 1, -r], [-r - 1, -r]])} {...common} />;
  }
  if (shape === "diamond") {
    return <polygon points={points(cx, cy, [[0, -r - 1], [r + 1, 0], [0, r + 1], [-r - 1, 0]])} {...common} />;
  }
  if (shape === "cross") {
    const t = r / 2.5;  // half the arm thickness
    return (
      <polygon
        points={points(cx, cy, [
          [-t, -r], [t, -r], [t, -t], [r, -t], [r, t], [t, t],
          [t, r], [-t, r], [-t, t], [-r, t], [-r, -t], [-t, -t],
        ])}
        {...common}
      />
    );
  }
  if (shape === "x") {
    // The same cross, turned by 45 degrees.
    return (
      <g transform={"rotate(45 " + cx + " " + cy + ")"}>
        <Marker shape="cross" cx={cx} cy={cy} color={color} surface={surface} size={size + 1} />
      </g>
    );
  }
  if (shape === "star") {
    const corners = [];
    for (let i = 0; i < 10; i++) {
      const radius = i % 2 === 0 ? r + 1.5 : r / 2;
      const angle = (Math.PI / 5) * i - Math.PI / 2;
      corners.push([radius * Math.cos(angle), radius * Math.sin(angle)]);
    }
    return <polygon points={points(cx, cy, corners)} {...common} />;
  }
  return <circle cx={cx} cy={cy} r={r} {...common} />;
}

// Turns offsets from the centre into an SVG "points" string.
function points(cx, cy, offsets) {
  return offsets.map((p) => cx + p[0] + "," + (cy + p[1])).join(" ");
}

// A small standalone marker for legends and tooltips (with a line behind it).
export function LegendSwatch({ shape, color, surface, dashed }) {
  return (
    <svg width="26" height="14" aria-hidden="true" className="swatch">
      <line
        x1="1" y1="7" x2="25" y2="7"
        stroke={color} strokeWidth="2"
        strokeDasharray={dashed ? "4 3" : undefined}
      />
      <Marker shape={shape} cx={13} cy={7} color={color} surface={surface} size={8} />
    </svg>
  );
}
