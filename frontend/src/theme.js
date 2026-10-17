// theme.js
// Colours used from JavaScript (the CSS has its own copies as variables).

// Chart colours that are not series colours: surface, text, grid, axes.
export const THEME_COLORS = {
  light: { surface: "#fcfcfb", text: "#0b0b0b", muted: "#898781", grid: "#e1e0d9", axis: "#c3c2b7" },
  dark:  { surface: "#1a1a19", text: "#f0efec", muted: "#898781", grid: "#2c2c2a", axis: "#383835" },
};

// One colour per simulated thread (thread 0, 1, 2, ...), the same eight
// colour-blind-checked palette steps as the lock colours, in palette order.
export const THREAD_COLORS = {
  light: ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#6250d6", "#e34948"],
  dark:  ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#008300", "#9085e9", "#e66767"],
};
