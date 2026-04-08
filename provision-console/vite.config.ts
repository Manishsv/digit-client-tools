import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5177,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:3847",
        changeOrigin: true,
        configure(proxy) {
          proxy.on("error", (err, _req, res) => {
            const r = res;
            if (!r || typeof r.writeHead !== "function" || r.headersSent) return;
            r.writeHead(502, { "Content-Type": "application/json" });
            r.end(
              JSON.stringify({
                error: "Provision console API unreachable",
                detail: String(err?.message || err),
                hint: "Start the API on port 3847: from provision-console run `npm run dev` (starts API + UI) or run `node server/index.mjs` in another terminal. Vite alone cannot serve /api.",
              })
            );
          });
        },
      },
    },
  },
});
