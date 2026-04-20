import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { getSyncStatus, runHourlySync, runDeepSync } from "./scheduler";
import supabase from "./supabase";

export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {
  // ===== ARTICLES =====
  app.get("/api/articles", async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 20;
      const offset = parseInt(req.query.offset as string) || 0;
      const articles = await storage.getArticles(limit, offset);
      res.json(articles);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/articles/:id", async (req, res) => {
    try {
      const article = await storage.getArticleById(req.params.id);
      if (!article) return res.status(404).json({ error: "Not found" });
      res.json(article);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/articles", async (req, res) => {
    try {
      const article = await storage.createArticle(req.body);
      res.status(201).json(article);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ===== ENTITIES =====
  app.get("/api/entities", async (req, res) => {
    try {
      const type = req.query.type as string | undefined;
      const entities = await storage.getEntities(type);
      res.json(entities);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/entities/:id", async (req, res) => {
    try {
      const entity = await storage.getEntityById(req.params.id);
      if (!entity) return res.status(404).json({ error: "Not found" });
      res.json(entity);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/entities", async (req, res) => {
    try {
      const entity = await storage.createEntity(req.body);
      res.status(201).json(entity);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.patch("/api/entities/:id", async (req, res) => {
    try {
      const entity = await storage.updateEntity(req.params.id, req.body);
      res.json(entity);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ===== X POSTS =====
  app.get("/api/entities/:id/posts", async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 20;
      const posts = await storage.getPostsByEntityId(req.params.id, limit);
      res.json(posts);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/posts", async (req, res) => {
    try {
      const post = await storage.createPost(req.body);
      res.status(201).json(post);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ===== TREND TAGS =====
  app.get("/api/trends", async (req, res) => {
    try {
      const date = req.query.date as string | undefined;
      const tags = await storage.getTrendTags(date);
      res.json(tags);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ===== 自律運用API =====

  // GET /api/sync/status — 現在のスケジューラステータスを返す
  app.get("/api/sync/status", (_req, res) => {
    res.json(getSyncStatus());
  });

  // GET /api/sync/logs — 直近の実行ログを返す
  app.get("/api/sync/logs", async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 20;
      const { data, error } = await supabase
        .from("sync_logs")
        .select("*")
        .order("ran_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      res.json(data || []);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // POST /api/sync/trigger/hourly — 毎時同期を手動トリガー
  app.post("/api/sync/trigger/hourly", async (_req, res) => {
    try {
      const status = getSyncStatus();
      if (status.isRunning) {
        return res.status(409).json({ error: "同期処理が既に実行中です" });
      }
      // 非同期で実行（レスポンスはすぐ返す）
      runHourlySync().catch((err) =>
        console.error("[routes] hourly sync error:", err)
      );
      res.json({ message: "毎時同期を開始しました", type: "hourly" });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // POST /api/sync/trigger/deep — 深掘り同期を手動トリガー
  app.post("/api/sync/trigger/deep", async (_req, res) => {
    try {
      const status = getSyncStatus();
      if (status.isRunning) {
        return res.status(409).json({ error: "同期処理が既に実行中です" });
      }
      runDeepSync().catch((err) =>
        console.error("[routes] deep sync error:", err)
      );
      res.json({ message: "深掘り同期を開始しました", type: "deep" });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ===== HEALTH CHECK =====
  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  return httpServer;
}
