// Vercel Serverless Function
// NOTE: createServer / httpServer は使わない。app を直接 export する。
import "dotenv/config";
import express from "express";
import { storage } from "../server/storage";
import supabase from "../server/supabase";
import {
  WATCHED_HANDLES,
  fetchPostsByHandles,
  fetchPostsBySearch,
  SEARCH_QUERIES,
  savePosts,
  getEntityMap,
} from "../server/collector";
import {
  generateArticle,
  updateEntityProfile,
  updateTrendTags,
} from "../server/generator";

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// ─── ヘルパー ───
async function logSync(type: string, status: string, details: Record<string, any>) {
  try {
    await supabase.from("sync_logs").insert({
      sync_type: type, status,
      details: JSON.stringify(details),
      ran_at: new Date().toISOString(),
    });
  } catch {}
}

function getNextCronHour() {
  const n = new Date(); n.setUTCMinutes(0,0,0); n.setUTCHours(n.getUTCHours()+1); return n.toISOString();
}
function getNextCronDaily() {
  const n = new Date(); n.setUTCHours(21,0,0,0); if (n <= new Date()) n.setUTCDate(n.getUTCDate()+1); return n.toISOString();
}

// ─── 記事 ───
app.get("/api/articles", async (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = parseInt(req.query.offset as string) || 0;
    res.json(await storage.getArticles(limit, offset));
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.get("/api/articles/:id", async (req, res) => {
  try {
    const a = await storage.getArticleById(req.params.id);
    if (!a) return res.status(404).json({ error: "Not found" });
    res.json(a);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.post("/api/articles", async (req, res) => {
  try { res.status(201).json(await storage.createArticle(req.body)); }
  catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ─── エンティティ ───
app.get("/api/entities", async (req, res) => {
  try {
    const type = req.query.type as string | undefined;
    res.json(await storage.getEntities(type));
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.get("/api/entities/:id", async (req, res) => {
  try {
    const e = await storage.getEntityById(req.params.id);
    if (!e) return res.status(404).json({ error: "Not found" });
    res.json(e);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.post("/api/entities", async (req, res) => {
  try { res.status(201).json(await storage.createEntity(req.body)); }
  catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.patch("/api/entities/:id", async (req, res) => {
  try { res.json(await storage.updateEntity(req.params.id, req.body)); }
  catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ─── X Posts ───
app.get("/api/entities/:id/posts", async (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 20;
    res.json(await storage.getPostsByEntityId(req.params.id, limit));
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.post("/api/posts", async (req, res) => {
  try { res.status(201).json(await storage.createPost(req.body)); }
  catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ─── トレンド ───
app.get("/api/trends", async (req, res) => {
  try {
    const date = req.query.date as string | undefined;
    res.json(await storage.getTrendTags(date));
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ─── 自律運用ステータス ───
app.get("/api/sync/status", async (_req, res) => {
  try {
    const { data: logs } = await supabase
      .from("sync_logs").select("*")
      .order("ran_at", { ascending: false }).limit(1);
    const last = logs?.[0];
    const details = last?.details
      ? (typeof last.details === "string" ? JSON.parse(last.details) : last.details)
      : null;
    res.json({
      isRunning: last?.status === "running",
      lastRunAt: last?.ran_at || null,
      lastRunType: last?.sync_type || null,
      lastResult: details,
      nextHourlyAt: getNextCronHour(),
      nextDeepAt: getNextCronDaily(),
      totalRuns: 0,
      mode: "vercel-github-actions",
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.get("/api/sync/logs", async (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 20;
    const { data, error } = await supabase
      .from("sync_logs").select("*")
      .order("ran_at", { ascending: false }).limit(limit);
    if (error) throw error;
    res.json(data || []);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.post("/api/sync/trigger/hourly", async (_req, res) => {
  try {
    // 非同期で実行（Vercelの60秒制限内）
    runHourlySync().catch(console.error);
    res.json({ message: "毎時同期を開始しました", type: "hourly", mode: "vercel" });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.post("/api/sync/trigger/deep", async (_req, res) => {
  try {
    runDeepSync().catch(console.error);
    res.json({ message: "深掘り同期を開始しました", type: "deep", mode: "vercel" });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ─── Cron エンドポイント（GitHub Actions から呼ばれる）───
app.post("/api/cron/hourly", async (req, res) => {
  if (process.env.CRON_SECRET && req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`)
    return res.status(401).json({ error: "Unauthorized" });
  try {
    const result = await runHourlySync();
    res.json({ ok: true, ...result });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.post("/api/cron/daily", async (req, res) => {
  if (process.env.CRON_SECRET && req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`)
    return res.status(401).json({ error: "Unauthorized" });
  try {
    const result = await runDeepSync();
    res.json({ ok: true, ...result });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ─── ヘルスチェック ───
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString(), mode: "vercel" });
});

// ─── 同期処理本体 ───
async function runHourlySync() {
  let postsCollected = 0, articlesGenerated = 0;
  const errors: string[] = [];
  await logSync("hourly", "running", { started_at: new Date().toISOString() });
  try {
    const entityMap = await getEntityMap();
    for (const handle of WATCHED_HANDLES) {
      try {
        const posts = await fetchPostsByHandles([handle], 10);
        if (!posts.length) continue;
        const entityId = entityMap.get(handle.toLowerCase());
        if (entityId) postsCollected += await savePosts(posts, entityId);
        const article = await generateArticle(posts, handle);
        if (article) {
          const { error } = await supabase.from("articles").insert({
            ...article, tags: JSON.stringify(article.tags), entity_ids: JSON.stringify(article.entity_ids),
          });
          if (!error) articlesGenerated++;
        }
      } catch (e: any) { errors.push(`@${handle}: ${e.message}`); }
    }
    try {
      const sp = await fetchPostsBySearch(SEARCH_QUERIES, 10);
      if (sp.length) {
        const a = await generateArticle(sp, "trending");
        if (a) {
          const { error } = await supabase.from("articles").insert({
            ...a, tags: JSON.stringify(a.tags), entity_ids: JSON.stringify(a.entity_ids),
          });
          if (!error) { articlesGenerated++; postsCollected += sp.length; }
        }
      }
    } catch {}
    try {
      const { data: ra } = await supabase.from("articles").select("tags").order("published_at", { ascending: false }).limit(50);
      if (ra?.length) await updateTrendTags(ra.map((a: any) => ({
        ...a, tags: typeof a.tags === "string" ? JSON.parse(a.tags) : (a.tags || []),
        entity_ids: [], title: "", summary: "", content: "", source_handle: "", source_url: "", published_at: "", heat_score: 0,
      })));
    } catch {}
    const result = { postsCollected, articlesGenerated, entitiesUpdated: 0, errors };
    await logSync("hourly", "success", result);
    return result;
  } catch (e: any) {
    await logSync("hourly", "error", { error: e.message });
    throw e;
  }
}

async function runDeepSync() {
  let postsCollected = 0, entitiesUpdated = 0;
  const errors: string[] = [];
  await logSync("deep", "running", { started_at: new Date().toISOString() });
  try {
    const entityMap = await getEntityMap();
    for (const handle of WATCHED_HANDLES) {
      try {
        const posts = await fetchPostsByHandles([handle], 15);
        if (!posts.length) continue;
        const entityId = entityMap.get(handle.toLowerCase());
        if (!entityId) continue;
        postsCollected += await savePosts(posts, entityId);
        const { data: ent } = await supabase.from("entities").select("name").eq("id", entityId).single();
        if (await updateEntityProfile(entityId, ent?.name || handle, handle, posts)) entitiesUpdated++;
      } catch (e: any) { errors.push(`@${handle}: ${e.message}`); }
    }
    const result = { postsCollected, articlesGenerated: 0, entitiesUpdated, errors };
    await logSync("deep", "success", result);
    return result;
  } catch (e: any) {
    await logSync("deep", "error", { error: e.message });
    throw e;
  }
}

export default app;
