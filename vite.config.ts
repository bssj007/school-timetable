
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { defineConfig } from "vite";
import { vitePluginManusRuntime } from "vite-plugin-manus-runtime";
import { fileURLToPath } from "url";

import { execSync } from "child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const getBuildInfo = () => {
  let commitSha = process.env.CF_PAGES_COMMIT_SHA || "";
  let branch = process.env.CF_PAGES_BRANCH || "";

  if (!commitSha) {
    try {
      commitSha = execSync("git rev-parse HEAD").toString().trim();
    } catch {}
  }
  if (!branch) {
    try {
      branch = execSync("git rev-parse --abbrev-ref HEAD").toString().trim();
    } catch {}
  }

  const now = new Date();
  const kstFormatted = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(now);

  return {
    commitSha,
    commitShort: commitSha ? commitSha.slice(0, 7) : "",
    branch,
    buildTime: now.toISOString(),
    buildTimeFormatted: kstFormatted,
  };
};

const buildInfo = getBuildInfo();

const plugins = [react(), tailwindcss(), vitePluginManusRuntime()];

export default defineConfig({
  define: {
    __BUILD_INFO__: JSON.stringify(buildInfo),
  },
  plugins,
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "client", "src"),
      "@shared": path.resolve(__dirname, "shared"),
    },
  },
  envDir: __dirname,
  root: path.resolve(__dirname, "client"),
  publicDir: path.resolve(__dirname, "client", "public"),
  build: {
    outDir: path.resolve(__dirname, "dist/public"),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, "client/index.html"),
      },
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'wouter', '@tanstack/react-query', 'framer-motion'],
          ui: ['@radix-ui/react-dialog', '@radix-ui/react-slot', 'lucide-react', 'sonner', 'class-variance-authority', 'clsx', 'tailwind-merge'],
          charts: ['recharts'],
        }
      }
    }
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      }
    }
  }
});
