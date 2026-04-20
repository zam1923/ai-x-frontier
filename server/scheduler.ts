/**
 * scheduler.ts — node-cron による完全自律定期実行エンジン
 * 修正: logSync でrunning→success/errorを正しくupdateする
 *       scheduler重複起動防止（グローバルフラグ）
 */

import cron from "node-cron";
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

// ─────────────────────────────────────────────
// ステータス管理（インメモリ）
// ─────────────────────────────────────────────

export interface SyncStatus {
  isRunning: boolean;
  lastRunAt: string | null;
  lastRunType: "hourly" | "deep" | "manual" | null;
  lastResult: {
    postsCollected: number;
    articlesGenerated: number;
    entitiesUpdated: number;
    errors: string[];
  } | null;
  nextHourlyAt: string | null;
  nextDeepAt: string | null;
  totalRuns: number;
}

let syncStatus: SyncStatus = {
  isRunning: false,
  lastRunAt: null,
  lastRunType: null,
  lastResult: null,
  nextHourlyAt: null,
  nextDeepAt: null,
  totalRuns: 0,
};

// スケジューラが既に起動済みかどうかのフラグ（重複起動防止）
let schedulerStarted = false;

export function getSyncStatus(): SyncStatus {
  return { ...syncStatus };
}

// ─────────────────────────────────────────────
// sync_logs テーブルへの記録（insert + update）
// ─────────────────────────────────────────────

async function logSyncStart(
  type: string,
  details: Record<string, any>
): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from("sync_logs")
      .insert({
        sync_type: type,
        status: "running",
        details: JSON.stringify(details),
        ran_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (error) {
      console.error("[scheduler] logSyncStart error:", error);
      return null;
    }
    return data?.id || null;
  } catch (err) {
    console.error("[scheduler] Failed to write sync log start:", err);
    return null;
  }
}

async function logSyncEnd(
  logId: string | null,
  status: "success" | "error",
  details: Record<string, any>
) {
  if (!logId) return;
  try {
    await supabase
      .from("sync_logs")
      .update({
        status,
        details: JSON.stringify(details),
      })
      .eq("id", logId);
  } catch (err) {
    console.error("[scheduler] Failed to update sync log:", err);
  }
}

// ─────────────────────────────────────────────
// メイン同期処理（毎時）
// バッチ処理: 全ハンドルをまとめてApify呼び出し
// ─────────────────────────────────────────────

export async function runHourlySync(): Promise<{
  postsCollected: number;
  articlesGenerated: number;
  entitiesUpdated: number;
  errors: string[];
}> {
  if (syncStatus.isRunning) {
    throw new Error("同期処理が既に実行中です");
  }

  syncStatus.isRunning = true;
  syncStatus.lastRunType = "hourly";
  const errors: string[] = [];
  let postsCollected = 0;
  let articlesGenerated = 0;
  const entitiesUpdated = 0;

  const logId = await logSyncStart("hourly", {
    started_at: new Date().toISOString(),
  });

  try {
    console.log("[scheduler] 毎時同期開始...");

    // 1. エンティティマップ取得（handle → id）
    const entityMap = await getEntityMap();
    console.log(`[scheduler] エンティティマップ: ${entityMap.size}件`);

    // 2. 全ハンドルをまとめてApify呼び出し（効率化）
    const allPosts = await fetchPostsByHandles(WATCHED_HANDLES, 5);
    console.log(`[scheduler] 全ポスト取得: ${allPosts.length}件`);

    if (allPosts.length > 0) {
      // ハンドルごとにグループ化して保存
      const postsByHandle = new Map<string, typeof allPosts>();
      for (const post of allPosts) {
        const h = post.author_handle.toLowerCase();
        if (!postsByHandle.has(h)) postsByHandle.set(h, []);
        postsByHandle.get(h)!.push(post);
      }

      // 各ハンドルの投稿を保存 + 記事生成
      for (const [handle, posts] of postsByHandle.entries()) {
        try {
          const entityId = entityMap.get(handle);
          if (entityId) {
            const saved = await savePosts(posts, entityId);
            postsCollected += saved;
            console.log(`[scheduler] @${handle}: ${saved}件保存`);
          }

          // 上位エンゲージメント投稿から記事生成
          const topPosts = posts
            .sort((a, b) => (b.likes + b.retweets * 2) - (a.likes + a.retweets * 2))
            .slice(0, 5);

          if (topPosts.some((p) => p.likes + p.retweets >= 5)) {
            const article = await generateArticle(topPosts, handle);
            if (article) {
              const { error } = await supabase.from("articles").insert({
                ...article,
                tags: JSON.stringify(article.tags),
                entity_ids: JSON.stringify(article.entity_ids),
              });
              if (!error) {
                articlesGenerated++;
                console.log(
                  `[scheduler] @${handle}: 記事生成完了「${article.title}」`
                );
              } else {
                console.error(`[scheduler] 記事保存エラー @${handle}:`, error);
              }
            }
          }
        } catch (err: any) {
          const msg = `@${handle}: ${err.message}`;
          errors.push(msg);
          console.error(`[scheduler] エラー — ${msg}`);
        }
      }
    }

    // 3. キーワード検索ポスト収集 → 記事生成
    try {
      const searchPosts = await fetchPostsBySearch(SEARCH_QUERIES, 5);
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
            console.log(
              `[scheduler] トレンド検索: 記事生成完了「${article.title}」`
            );
          }
        }
      }
    } catch (err: any) {
      errors.push(`トレンド検索: ${err.message}`);
      console.error("[scheduler] トレンド検索エラー:", err.message);
    }

    // 4. トレンドタグ再集計
    try {
      const { data: recentArticles } = await supabase
        .from("articles")
        .select("tags, title, summary, content, source_handle, source_url, published_at, heat_score, entity_ids")
        .order("published_at", { ascending: false })
        .limit(50);

      if (recentArticles && recentArticles.length > 0) {
        const parsed = recentArticles.map((a: any) => ({
          ...a,
          tags: typeof a.tags === "string" ? JSON.parse(a.tags) : a.tags || [],
          entity_ids:
            typeof a.entity_ids === "string"
              ? JSON.parse(a.entity_ids)
              : a.entity_ids || [],
        }));
        await updateTrendTags(parsed);
      }
    } catch (err: any) {
      errors.push(`トレンドタグ更新: ${err.message}`);
    }

    const result = { postsCollected, articlesGenerated, entitiesUpdated, errors };
    syncStatus.lastResult = result;
    syncStatus.lastRunAt = new Date().toISOString();
    syncStatus.totalRuns++;

    await logSyncEnd(logId, "success", result);
    console.log(
      `[scheduler] 毎時同期完了: ポスト${postsCollected}件, 記事${articlesGenerated}件`
    );
    return result;
  } catch (err: any) {
    errors.push(`致命的エラー: ${err.message}`);
    const result = { postsCollected, articlesGenerated, entitiesUpdated, errors };
    syncStatus.lastResult = result;
    syncStatus.lastRunAt = new Date().toISOString();
    await logSyncEnd(logId, "error", result);
    throw err;
  } finally {
    syncStatus.isRunning = false;
  }
}

// ─────────────────────────────────────────────
// 深掘り更新処理（毎朝6時）
// ─────────────────────────────────────────────

export async function runDeepSync(): Promise<{
  postsCollected: number;
  articlesGenerated: number;
  entitiesUpdated: number;
  errors: string[];
}> {
  if (syncStatus.isRunning) {
    throw new Error("同期処理が既に実行中です");
  }

  syncStatus.isRunning = true;
  syncStatus.lastRunType = "deep";
  const errors: string[] = [];
  let postsCollected = 0;
  const articlesGenerated = 0;
  let entitiesUpdated = 0;

  const logId = await logSyncStart("deep", {
    started_at: new Date().toISOString(),
  });

  try {
    console.log("[scheduler] 深掘り同期開始...");
    const entityMap = await getEntityMap();

    // バッチで全ハンドルを取得
    const allPosts = await fetchPostsByHandles(WATCHED_HANDLES, 10);
    const postsByHandle = new Map<string, typeof allPosts>();
    for (const post of allPosts) {
      const h = post.author_handle.toLowerCase();
      if (!postsByHandle.has(h)) postsByHandle.set(h, []);
      postsByHandle.get(h)!.push(post);
    }

    for (const handle of WATCHED_HANDLES) {
      try {
        const posts = postsByHandle.get(handle.toLowerCase()) || [];
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

        const entityName = entity?.name || handle;
        const updated = await updateEntityProfile(
          entityId,
          entityName,
          handle,
          posts
        );
        if (updated) {
          entitiesUpdated++;
          console.log(`[scheduler] @${handle}: プロフィール更新完了`);
        }
      } catch (err: any) {
        const msg = `深掘り @${handle}: ${err.message}`;
        errors.push(msg);
        console.error(`[scheduler] ${msg}`);
      }
    }

    const result = { postsCollected, articlesGenerated, entitiesUpdated, errors };
    syncStatus.lastResult = result;
    syncStatus.lastRunAt = new Date().toISOString();
    syncStatus.lastRunType = "deep";
    syncStatus.totalRuns++;

    await logSyncEnd(logId, "success", result);
    console.log(
      `[scheduler] 深掘り同期完了: エンティティ${entitiesUpdated}件更新`
    );
    return result;
  } catch (err: any) {
    errors.push(`致命的エラー: ${err.message}`);
    const result = { postsCollected, articlesGenerated, entitiesUpdated, errors };
    syncStatus.lastResult = result;
    await logSyncEnd(logId, "error", result);
    throw err;
  } finally {
    syncStatus.isRunning = false;
  }
}

// ─────────────────────────────────────────────
// cron スケジューラ起動（重複起動防止付き）
// ─────────────────────────────────────────────

function getNextCronTime(cronExpr: string): string {
  const now = new Date();
  if (cronExpr.includes("0 * * * *")) {
    const next = new Date(now);
    next.setMinutes(0, 0, 0);
    next.setHours(next.getHours() + 1);
    return next.toISOString();
  }
  if (cronExpr.includes("0 21 * * *")) {
    const next = new Date(now);
    next.setUTCHours(21, 0, 0, 0);
    if (next <= now) next.setUTCDate(next.getUTCDate() + 1);
    return next.toISOString();
  }
  return "";
}

export function startScheduler() {
  if (schedulerStarted) {
    console.log("[scheduler] スケジューラは既に起動中 — スキップ");
    return;
  }
  schedulerStarted = true;

  console.log("[scheduler] 自律運用スケジューラ起動");

  // 毎時0分: X収集 + 記事生成
  cron.schedule("0 * * * *", async () => {
    console.log("[scheduler] 毎時同期トリガー");
    syncStatus.nextHourlyAt = getNextCronTime("0 * * * *");
    try {
      await runHourlySync();
    } catch (err) {
      console.error("[scheduler] 毎時同期失敗:", err);
    }
  });

  // 毎朝6時 JST (= 21:00 UTC): 深掘りプロフィール更新
  cron.schedule("0 21 * * *", async () => {
    console.log("[scheduler] 深掘り同期トリガー");
    syncStatus.nextDeepAt = getNextCronTime("0 21 * * *");
    try {
      await runDeepSync();
    } catch (err) {
      console.error("[scheduler] 深掘り同期失敗:", err);
    }
  });

  syncStatus.nextHourlyAt = getNextCronTime("0 * * * *");
  syncStatus.nextDeepAt = getNextCronTime("0 6 * * *");

  console.log(`[scheduler] 次回毎時同期: ${syncStatus.nextHourlyAt}`);
  console.log(`[scheduler] 次回深掘り同期: ${syncStatus.nextDeepAt}`);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
