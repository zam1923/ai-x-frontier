/**
 * server/app.ts — Express アプリ（Vercel / api/index.ts から参照）
 * Render 本番は server/index.ts を使用
 */
import "dotenv/config";
import express from "express";
import { createServer } from "node:http";
import { registerRoutes } from "./routes";

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

const httpServer = createServer(app);
registerRoutes(httpServer, app);

export default app;
export { app };
