import express, { type Express } from "express";
import fs from "fs";
import path from "path";

export function serveStatic(app: Express) {
  const distPath = path.resolve(__dirname, "public");
  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  app.use(express.static(distPath, {
    etag: false,
    setHeaders: (res, filePath) => {
      if (filePath.endsWith(".html")) {
        res.set("Cache-Control", "no-store, no-cache, must-revalidate");
        res.set("Pragma", "no-cache");
        res.set("Expires", "0");
      }
    },
  }));

  app.use("/{*path}", (_req, res) => {
    res.set("Cache-Control", "no-store, no-cache, must-revalidate");
    res.set("Pragma", "no-cache");
    res.set("Expires", "0");
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
