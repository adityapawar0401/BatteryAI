import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig(() => {
  const environment = process.env;
  const remoteEnabled = ["1", "true"].includes((environment.VITE_BATTERYAI_REMOTE_MODE ?? "").toLowerCase());
  if (remoteEnabled) {
    const value = environment.VITE_BATTERYAI_REMOTE_API_URL;
    let valid = false;
    try {
      const url = new URL(value);
      valid = url.protocol === "https:" && /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+ts\.net$/.test(url.hostname) && !url.username && !url.password && !url.port && url.pathname === "/" && !url.search && !url.hash;
    } catch { valid = false; }
    if (!valid) throw new Error("Remote production build requires an exact HTTPS ts.net VITE_BATTERYAI_REMOTE_API_URL.");
  }
  return {
    plugins: [react()],
    base: "./",
    build: { outDir: "dist", sourcemap: true },
    test: { environment: "jsdom", setupFiles: "./src/test-setup.ts" },
  };
});
