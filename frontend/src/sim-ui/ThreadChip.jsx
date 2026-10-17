// ThreadChip.jsx
// A small "T0", "T1", ... token in the thread's own colour. The colour is a
// filled dot and a border; the text stays in the normal text colour so it
// is readable on any background.
export function ThreadChip({ tid, color, note }) {
  return (
    <span className="thread-chip" style={{ borderColor: color }}>
      <span className="thread-dot" style={{ background: color }} aria-hidden="true" />
      T{tid}
      {note && <span className="thread-chip-note">{note}</span>}
    </span>
  );
}
