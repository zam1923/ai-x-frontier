/**
 * server/app.ts — Expressアプリ本体（Vercel関数から参照される）
 * cron処理含む全APIルートをここに集約
 */
import "dotenv/config";
import express from "express";
import { createServer } from "node:http";
import { registerRoutes } from "./routes";
import supabase from "./supabase";
import {
  WATCHED_HANDLES,
  fetchPostsByHandles,
  fetchPostsBySearch,
  SEARCH_QUERIES,
  savePosts,
  getEntityMap,
} from "./collector";
import {
  generateArticle,
  updateEntityProfile,
  updateTrendTags,
} from "./generator";

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// ─── Cron エンドポイント（GitHub Actions から呼ばれる） ───

async function logSync(
  type: string,
  status: "success" | "error" | "running",
  details: Record<string, any>
) {
  try {
    await supabase.from("sync_logs").insert({
      sync_type: type,
      status,
      details: JSON.stringify(details),
      ran_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[app] Failed to write sync log:", err);
  }
}

// POST /api/cron/hourly — 毎時同期（GitHub Actions cron から呼ばれる）
app.post("/api/cron/hourly", async (req, res) => {
  const authHeader = req.headers.authorization;
  if (
    process.env.CRON_SECRET &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const startedAt = new Date().toISOString();
  let postsCollected = 0;
  let articlesGenerated = 0;
  const errors: string[] = [];

  await logSync("hourly", "running", { started_at: startedAt });

  try {
    const entityMap = await getEntityMap();

    for (const handle of WATCHED_HANDLES) {
      try {
        const posts = await fetchPostsByHandles([handle], 10);
        if (posts.length === 0) continue;

        const entityId = entityMap.get(handle.toLowerCase());
        if (entityId) {
          const saved = await savePosts(posts, entityId);
          postsCollected += saved;
        }

        const article = await generateArticle(posts, handle);
        if (article) {
          const { error } = await supabase.from("articles").insert({
            ...article,
            tags: JSON.stringify(article.tags),
            entity_ids: JSON.stringify(article.entity_ids),
          });
          if (!error) articlesGenerated++;
        }
      } catch (err: any) {
        errors.push(`@${handle}: ${err.message}`);
      }
    }

    // トレンド検索
    try {
      const searchPosts = await fetchPostsBySearch(SEARCH_QUERIES, 10);
      if (searchPosts.length > 0) {
        const article = await generateArticle(searchPosts, "trending");
        if (article) {
          const { error } = await supabase.from("articles").insert({
            ...article,
            tags: JSON.stringify(article.tags),
            entity_ids: JSON.stringify(article.entity_ids),
          });
          if (!error) {
            articlesGenerated++;
            postsCollected += searchPosts.length;
          }
        }
      }
    } catch (err: any) {
      errors.push(`トレンド検索: ${err.message}`);
    }

    // トレンドタグ更新
    try {
      const { data: recentArticles } = await supabase
        .from("articles")
        .select("tags")
        .order("published_at", { ascending: false })
        .limit(50);
      if (recentArticles && recentArticles.length > 0) {
        const parsed = recentArticles.map((a: any) => ({
          ...a,
          tags: typeof a.tags === "string" ? JSON.parse(a.tags) : a.tags || [],
          entity_ids: [],
          title: "",
          summary: "",
          content: "",
          source_handle: "",
          source_url: "",
          published_at: "",
          heat_score: 0,
        }));
        await updateTrendTags(parsed);
      }
    } catch (err: any) {
      errors.push(`トレンドタグ: ${err.message}`);
    }

    const result = { postsCollected, articlesGenerated, entitiesUpdated: 0, errors };
    await logSync("hourly", "success", result);
    return res.json({ ok: true, ...result });
  } catch (err: any) {
    await logSync("hourly", "error", { error: err.message, errors });
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/cron/daily — 毎日深掘り更新（毎日21:00 UTC）
app.post("/api/cron/daily", async (req, res) => {
  const authHeader = req.headers.authorization;
  if (
    process.env.CRON_SECRET &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  let postsCollected = 0;
  let entitiesUpdated = 0;
  const errors: string[] = [];

  await logSync("deep", "running", { started_at: new Date().toISOString() });

  try {
    const entityMap = await getEntityMap();

    for (const handle of WATCHED_HANDLES) {
      try {
        const posts = await fetchPostsByHandles([handle], 15);
        if (posts.length === 0) continue;

        const entityId = entityMap.get(handle.toLowerCase());
        if (!entityId) continue;

        const saved = await savePosts(posts, entityId);
        postsCollected += saved;

        const { data: entity } = await supabase
          .from("entities")
          .select("name")
          .eq("id", entityId)
          .single();

        const updated = await updateEntityProfile(
          entityId,
          entity?.name || handle,
          handle,
          posts
        );
        if (updated) entitiesUpdated++;
      } catch (err: any) {
        errors.push(`@${handle}: ${err.message}`);
      }
    }

    const result = { postsCollected, articlesGenerated: 0, entitiesUpdated, errors };
    await logSync("deep", "success", result);
    return res.json({ ok: true, ...result });
  } catch (err: any) {
    await logSync("deep", "error", { error: err.message, errors });
    return res.status(500).json({ error: err.message });
  }
});

// 通常APIルートを登録
const httpServer = createServer(app);
registerRoutes(httpServer, app);

export default app;
export { app };
