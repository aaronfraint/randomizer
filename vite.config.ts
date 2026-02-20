import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "/randomizer/",
  plugins: [
    react(),
    {
      name: "proxy-external",
      configureServer(server) {
        // Generic proxy for external URLs (avoids CORS on S3 downloads/uploads)
        server.middlewares.use("/proxy-external", async (req, res) => {
          const parsed = new URL(req.url!, `http://${req.headers.host}`);
          const targetUrl = parsed.searchParams.get("url");
          if (!targetUrl) {
            res.statusCode = 400;
            res.end("Missing ?url= parameter");
            return;
          }

          try {
            // Collect request body for POST/PUT
            const chunks: Buffer[] = [];
            for await (const chunk of req) {
              chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
            }
            const body = chunks.length > 0 ? Buffer.concat(chunks) : undefined;

            const headers: Record<string, string> = {};
            // Forward content-type for multipart uploads
            if (req.headers["content-type"]) {
              headers["content-type"] = req.headers["content-type"] as string;
            }

            const upstream = await fetch(targetUrl, {
              method: req.method || "GET",
              headers,
              body,
            });

            res.statusCode = upstream.status;
            const contentType = upstream.headers.get("content-type");
            if (contentType) res.setHeader("Content-Type", contentType);
            const buffer = Buffer.from(await upstream.arrayBuffer());
            res.end(buffer);
          } catch (err) {
            res.statusCode = 502;
            res.end(String(err));
          }
        });
      },
    },
  ],
  server: {
    proxy: {
      "/felt-api": {
        target: "https://felt.com",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/felt-api/, "/api"),
      },
    },
  },
});
