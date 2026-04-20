// Vercel Serverless Function — Express アプリを直接ラップ
import "dotenv/config";
import express from "express";
import { createServer } from "node:http";
import { registerRoutes } from "../server/routes";
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

async function logSync(type: string, status: string, details: Record<string, any>) {
  try {
    await supabase.from("sync_logs").insert({
      sync_type: type, status,
      details: JSON.stringify(details),
      ran_at: new Date().toISOString(),
    });
  } catch {}
}

// ── Cron エンドポイント（GitHub Actions から呼ばれる）──

app.post("/api/cron/hourly", async (req, res) => {
  if (process.env.CRON_SECRET && req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`)
    return res.status(401).json({ error: "Unauthorized" });

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
    } catch (e: any) { errors.push(`trending: ${e.message}`); }
    try {
      const { data: ra } = await supabase.from("articles").select("tags").order("published_at", { ascending: false }).limit(50);
      if (ra?.length) await updateTrendTags(ra.map((a: any) => ({ ...a, tags: typeof a.tags === "string" ? JSON.parse(a.tags) : a.tags || [], entity_ids: [], title: "", summary: "", content: "", source_handle: "", source_url: "", published_at: "", heat_score: 0 })));
    } catch {}
    const result = { postsCollected, articlesGenerated, entitiesUpdated: 0, errors };
    await logSync("hourly", "success", result);
    return res.json({ ok: true, ...result });
  } catch (e: any) {
    await logSync("hourly", "error", { error: e.message });
    return res.status(500).json({ error: e.message });
  }
});

app.post("/api/cron/daily", async (req, res) => {
  if (process.env.CRON_SECRET && req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`)
    return res.status(401).json({ error: "Unauthorized" });

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
    return res.json({ ok: true, ...result });
  } catch (e: any) {
    await logSync("deep", "error", { error: e.message });
    return res.status(500).json({ error: e.message });
  }
});

// ── 通常の API ルートを登録 ──
const httpServer = createServer(app);
registerRoutes(httpServer, app);

export default app;
