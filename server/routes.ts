import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import supabase from "./supabase";

// Vercelサーバーレス環境では scheduler をスキップ（node-cronはランタイムエラーになる）
const IS_VERCEL = !!process.env.VERCEL;

async function getScheduler() {
  if (IS_VERCEL) return null;
  return import("./scheduler");
}

// Vercel Cronの次回実行時刻計算
function getNextCronHour(): string {
  const now = new Date();
  const next = new Date(now);
  next.setUTCMinutes(0, 0, 0);
  next.setUTCHours(next.getUTCHours() + 1);
  return next.toISOString();
}

function getNextCronDaily(): string {
  // 21:00 UTC = 翁朝6時 JST
  const now = new Date();
  const next = new Date(now);
  next.setUTCHours(21, 0, 0, 0);
  if (next <= now) next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString();
}

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

  // GET /api/sync/status — スケジューラステータス（Vercelではcron情報のみ）
  app.get("/api/sync/status", async (_req, res) => {
    if (IS_VERCEL) {
      // Vercel環境: sync_logsから最終実行情報を返す
      try {
        const { data: logs } = await supabase
          .from("sync_logs")
          .select("*")
          .order("ran_at", { ascending: false })
          .limit(1);
        const last = logs?.[0];
        const details = last?.details
          ? (typeof last.details === "string" ? JSON.parse(last.details) : last.details)
          : null;
        return res.json({
          isRunning: last?.status === "running",
          lastRunAt: last?.ran_at || null,
          lastRunType: last?.sync_type || null,
          lastResult: details,
          nextHourlyAt: getNextCronHour(),
          nextDeepAt: getNextCronDaily(),
          totalRuns: 0,
          mode: "vercel-cron",
        });
      } catch (e: any) {
        return res.status(500).json({ error: e.message });
      }
    }
    // ローカル/自ホスト環境: node-cronスケジューラから取得
    const scheduler = await getScheduler();
    res.json(scheduler ? scheduler.getSyncStatus() : { isRunning: false, mode: "unknown" });
  });

  // GET /api/sync/logs — 直近の実行ログ
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
  app.post("/api/sync/trigger/hourly", async (req, res) => {
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret) {
      const auth = req.headers.authorization;
      // ヘッダーがある＆間違いの場合のみ拒否（ない場合はAdminパネルからの操作として許可）
      if (auth && auth !== `Bearer ${cronSecret}`) {
        return res.status(401).json({ error: "Unauthorized" });
      }
    }
    try {
      if (IS_VERCEL) {
        // Vercel: cronエンドポイントを内部呼び出し
        const { runHourlySyncDirect } = await import("./sync-runner");
        runHourlySyncDirect().catch(console.error);
        return res.json({ message: "毎時同期を開始しました", type: "hourly", mode: "vercel" });
      }
      const scheduler = await getScheduler();
      if (!scheduler) return res.status(503).json({ error: "scheduler unavailable" });
      const status = scheduler.getSyncStatus();
      if (status.isRunning) {
        return res.status(409).json({ error: "同期処理が既に実行中です" });
      }
      scheduler.runHourlySync().catch((err: any) =>
        console.error("[routes] hourly sync error:", err)
      );
      res.json({ message: "毎時同期を開始しました", type: "hourly" });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // POST /api/sync/trigger/deep — 深掘り同期を手動トリガー
  app.post("/api/sync/trigger/deep", async (req, res) => {
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret) {
      const auth = req.headers.authorization;
      // ヘッダーがある＆間違いの場合のみ拒否
      if (auth && auth !== `Bearer ${cronSecret}`) {
        return res.status(401).json({ error: "Unauthorized" });
      }
    }
    try {
      if (IS_VERCEL) {
        const { runDeepSyncDirect } = await import("./sync-runner");
        runDeepSyncDirect().catch(console.error);
        return res.json({ message: "深掘り同期を開始しました", type: "deep", mode: "vercel" });
      }
      const scheduler = await getScheduler();
      if (!scheduler) return res.status(503).json({ error: "scheduler unavailable" });
      const status = scheduler.getSyncStatus();
      if (status.isRunning) {
        return res.status(409).json({ error: "同期処理が既に実行中です" });
      }
      scheduler.runDeepSync().catch((err: any) =>
        console.error("[routes] deep sync error:", err)
      );
      res.json({ message: "深掘り同期を開始しました", type: "deep" });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // POST /api/sync/test-grok — Grok Agent Tools API の生レスポンスを確認（デバッグ用）
  app.post("/api/sync/test-grok", async (_req, res) => {
    try {
      const apiKey = process.env.GROK_API_KEY;
      if (!apiKey) return res.status(500).json({ error: "GROK_API_KEY not set" });

      const model = process.env.GROK_MODEL || "grok-3-latest";
      const response = await fetch("https://api.x.ai/v1/responses", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          input: [
            {
              role: "system",
              content: 'Return JSON only: {"title":"...","summary":"...","heat_score":50}',
            },
            {
              role: "user",
              content: "最新のAI技術ニュースを1件教えてください。",
            },
          ],
          tools: [{ type: "x_search" }],
        }),
      });

      const raw = await response.json();
      const outputMsg = raw.output?.find(
        (o: any) => o.type === "message" || o.role === "assistant"
      );
      const contentText =
        raw.output_text ??
        outputMsg?.content?.find((c: any) => c.type === "output_text" || c.type === "text")?.text ??
        "";
      return res.json({
        http_status: response.status,
        ok: response.ok,
        model_used: model,
        response_top_keys: Object.keys(raw),
        content_preview: String(contentText).slice(0, 400),
        citations_root: (raw.citations ?? []).length,
        output_items: (raw.output ?? []).map((o: any) => ({
          type: o.type,
          role: o.role,
          content_types: Array.isArray(o.content)
            ? o.content.map((c: any) => c.type)
            : typeof o.content,
        })),
        error: raw.error ?? null,
      });
    } catch (e: any) {
      return res.status(500).json({ error: e.message });
    }
  });

  // ===== HEALTH CHECK =====
  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  return httpServer;
}
