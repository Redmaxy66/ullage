import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: path.join(root, "client"),
  plugins: [react()],
  resolve: {
    alias: {
      "@shared": path.join(root, "shared"),
    },
  },
  server: {
    middlewareMode: true,
  },
  appType: "spa",
});
