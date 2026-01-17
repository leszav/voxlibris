import { type Express } from "express";
import { createServer as createViteServer, createLogger } from "vite";
import { type Server } from "http";
import viteConfig from "../vite.config";
import fs from "fs";
import path from "path";
import { nanoid } from "nanoid";

const viteLogger = createLogger();

export async function setupVite(server: Server, app: Express) {
  const serverOptions = {
    middlewareMode: true,
    hmr: { server, path: "/vite-hmr" },
    allowedHosts: true as const,
  };

  const vite = await createViteServer({
    ...viteConfig,
    configFile: false,
    customLogger: {
      ...viteLogger,
      error: (msg, options) => {
        viteLogger.error(msg, options);
        process.exit(1);
      },
    },
    server: serverOptions,
    appType: "custom",
  });

  // Apply Vite middlewares only to non-API routes
  app.use((req, res, next) => {
    // Skip API routes completely from Vite processing
    if (req.path.startsWith('/api')) {
      return next();
    }
    
    // Apply Vite middlewares to all other routes
    vite.middlewares(req, res, next);
  });

  // Catch-all handler for client-side routing (only for non-API routes)
  app.use((req, res, next) => {
    // Skip API routes, HMR, and Vite dev server routes
    if (req.path.startsWith('/api') ||
        req.path.startsWith('/vite-hmr') ||
        req.path.startsWith('/@') ||
        req.path.startsWith('/__vite')) {
      return next();
    }

    const url = req.originalUrl;

    // Serve the React app for all other routes
    (async () => {
      try {
        const clientTemplate = path.resolve(
          import.meta.dirname,
          "..",
          "client",
          "index.html",
        );

        // always reload the index.html file from disk incase it changes
        let template = await fs.promises.readFile(clientTemplate, "utf-8");
        template = template.replace(
          `src="/src/main.tsx"`,
          `src="/src/main.tsx?v=${nanoid()}"`,
        );
        const page = await vite.transformIndexHtml(url, template);
        res.status(200).set({ "Content-Type": "text/html" }).end(page);
      } catch (e) {
        vite.ssrFixStacktrace(e as Error);
        next(e);
      }
    })();
  });
}
