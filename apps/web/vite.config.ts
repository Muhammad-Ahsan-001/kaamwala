import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // Our own service worker, because the push handlers and API rules live in it.
      strategies: "injectManifest",
      srcDir: "src/pwa",
      filename: "sw.ts",
      // A new version waits for a tap rather than reloading the page under someone mid-task.
      registerType: "prompt",
      injectRegister: false,
      includeAssets: ["icons/icon.svg", "icons/favicon-32.png", "icons/apple-touch-icon.png"],
      manifest: {
        name: "کام والا · KaamWala",
        short_name: "کام والا",
        description: "قریب کا کاریگر، ایک آواز پر۔ Your nearby skilled worker, one voice note away.",
        lang: "ur",
        dir: "rtl",
        id: "/app",
        start_url: "/app",
        scope: "/",
        display: "standalone",
        orientation: "portrait",
        background_color: "#FAF7F0",
        theme_color: "#FAF7F0",
        categories: ["business", "lifestyle", "utilities"],
        icons: [
          { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      injectManifest: {
        globPatterns: ["**/*.{js,css,html,svg,png,woff2}"],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
      },
    }),
  ],
  server: { port: 5173 },
});
