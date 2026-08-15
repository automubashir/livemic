import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// GitHub Pages serves a project site from /<repo>/, so the deploy workflow
// passes that prefix in PAGES_BASE. Everything else — dev, preview, a root
// domain — stays at "/", so the variable is absent and base resolves to root.
const prefix = process.env.PAGES_BASE?.replace(/^\/+|\/+$/g, "") ?? "";
const base = prefix ? `/${prefix}/` : "/";

// VoxFX is a fully client-side app: microphone capture and Web Audio only, no
// server work of any kind. `vite build` therefore emits a plain static bundle
// in dist/ that any static host can serve.
export default defineConfig({
  base,
  plugins: [
    // Must run before the React plugin so generated routes are transformed.
    tanstackRouter({ target: "react", autoCodeSplitting: true }),
    react(),
    tailwindcss(),
  ],
  resolve: {
    // Native replacement for vite-tsconfig-paths; resolves the "@/*" alias.
    tsconfigPaths: true,
  },
  server: {
    host: true,
    port: 8080,
  },
  build: {
    outDir: "dist",
    target: "es2022",
  },
});
