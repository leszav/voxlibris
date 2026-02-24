import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";
import { metaImagesPlugin } from "./vite-plugin-meta-images";
import { seoPlugin } from "./vite-plugin-seo";

export default defineConfig({
  plugins: [
    react(),
    runtimeErrorOverlay(),
    tailwindcss(),
    metaImagesPlugin(),
    seoPlugin(),
    ...(process.env.NODE_ENV !== "production" &&
    process.env.REPL_ID !== undefined
      ? [
          await import("@replit/vite-plugin-cartographer").then((m) =>
            m.cartographer(),
          ),
          await import("@replit/vite-plugin-dev-banner").then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
    },
  },
  css: {
    postcss: {
      plugins: [],
    },
  },
  root: path.resolve(import.meta.dirname, "client"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) {
            return undefined;
          }

          if (
            id.includes("/react/") ||
            id.includes("/react-dom/") ||
            id.includes("/scheduler/")
          ) {
            return "vendor-react";
          }

          if (id.includes("/@tanstack/react-query/") || id.includes("/wouter/")) {
            return "vendor-routing-data";
          }

          if (id.includes("/@radix-ui/") || id.includes("/lucide-react/")) {
            return "vendor-ui";
          }

          if (id.includes("/recharts/")) {
            return "vendor-charts";
          }

          if (id.includes("/socket.io-client/")) {
            return "vendor-socket";
          }

          if (id.includes("/framer-motion/")) {
            return "vendor-motion";
          }

          if (
            id.includes("/dompurify/") ||
            id.includes("/react-easy-crop/") ||
            id.includes("/emoji-picker-react/")
          ) {
            return "vendor-media";
          }

          if (
            id.includes("/@tiptap/") ||
            id.includes("/prosemirror-")
          ) {
            return "vendor-editor";
          }

          if (id.includes("/date-fns/")) {
            return "vendor-date";
          }

          if (
            id.includes("/react-hook-form/") ||
            id.includes("/@hookform/resolvers/") ||
            id.includes("/zod/")
          ) {
            return "vendor-forms";
          }

          return undefined;
        },
      },
    },
  },
  server: {
    host: "0.0.0.0",
    allowedHosts: true,
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
        secure: false,
      },
    },
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
});
