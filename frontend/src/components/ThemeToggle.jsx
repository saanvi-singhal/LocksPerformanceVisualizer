// ThemeToggle.jsx
// A light/dark switch for the navigation bar. role="switch" tells screen
// readers it is an on/off control ("Dark mode, on").
export function ThemeToggle({ theme, onChange }) {
  const dark = theme === "dark";
  return (
    <button
      type="button"
      role="switch"
      aria-checked={dark}
      className="theme-toggle"
      onClick={() => onChange(dark ? "light" : "dark")}
    >
      <span className="theme-toggle-track" aria-hidden="true">
        <span className="theme-toggle-knob" />
      </span>
      Dark mode
    </button>
  );
}
