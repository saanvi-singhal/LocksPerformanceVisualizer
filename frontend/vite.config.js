// Vite configuration: React support, fixed ports for the demo.
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },   // npm run dev
  preview: { port: 4173 },  // npm run preview
  // The chart library makes the single bundle about 540 kB. That is fine for
  // a local demo, so raise Vite's 500 kB warning limit instead of splitting.
  build: { chunkSizeWarningLimit: 700 },
});
