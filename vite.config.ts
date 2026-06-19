import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  // Relative asset URLs work on GitHub Pages regardless of the repository name.
  base: "./",
  plugins: [react()]
});
