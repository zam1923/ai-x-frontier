/**
 * scheduler.ts — node-cron による完全自律定期実行エンジン
 *
 * スケジュール:
 *   毎時0分  → hourlySync: 全アカウントのXポスト収集 + 記事生成
 *   毎朝6時  → deepSync: 全エンティティのプロフィール深掘り更新
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

export function getSyncStatus(): SyncStatus {
  return { ...syncStatus };
}

// ─────────────────────────────────────────────
// sync_logs テーブルへの記録
// ─────────────────────────────────────────────

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
    console.error("[scheduler] Failed to write sync log:", err);
  }
}

// ─────────────────────────────────────────────
// メイン同期処理（毎時）
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

  await logSync("hourly", "running", { started_at: new Date().toISOString() });

  try {
    console.log("[scheduler] 毎時同期開始...");

    // 1. エンティティマップ取得（handle → id）
    const entityMap = await getEntityMap();
    console.log(`[scheduler] エンティティマップ: ${entityMap.size}件`);

    // 2. アカウントごとにポスト収集・記事生成
    for (const handle of WATCHED_HANDLES) {
      try {
        const posts = await fetchPostsByHandles([handle], 10);
        if (posts.length === 0) {
          console.log(`[scheduler] @${handle}: ポストなし`);
          continue;
        }

        const entityId = entityMap.get(handle.toLowerCase());
        if (entityId) {
          const saved = await savePosts(posts, entityId);
          postsCollected += saved;
          console.log(`[scheduler] @${handle}: ${saved}件保存`);
        }

        // Grokで記事生成
        const article = await generateArticle(posts, handle);
        if (article) {
          const { error } = await supabase.from("articles").insert({
            ...article,
            tags: JSON.stringify(article.tags),
            entity_ids: JSON.stringify(article.entity_ids),
          });
          if (!error) {
            articlesGenerated++;
            console.log(`[scheduler] @${handle}: 記事生成完了「${article.title}」`);
          }
        }

        // レート制限対策（Apify APIへの過負荷を避ける）
        await sleep(2000);
      } catch (err: any) {
        const msg = `@${handle}: ${err.message}`;
        errors.push(msg);
        console.error(`[scheduler] エラー — ${msg}`);
      }
    }

    // 3. キーワード検索ポスト収集
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
            console.log(`[scheduler] トレンド検索: 記事生成完了「${article.title}」`);
          }
        }
      }
    } catch (err: any) {
      errors.push(`トレンド検索: ${err.message}`);
    }

    // 4. トレンドタグ再集計
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
      errors.push(`トレンドタグ更新: ${err.message}`);
    }

    const result = { postsCollected, articlesGenerated, entitiesUpdated, errors };
    syncStatus.lastResult = result;
    syncStatus.lastRunAt = new Date().toISOString();
    syncStatus.totalRuns++;

    await logSync("hourly", "success", result);
    console.log(`[scheduler] 毎時同期完了: ポスト${postsCollected}件, 記事${articlesGenerated}件`);
    return result;
  } catch (err: any) {
    errors.push(`致命的エラー: ${err.message}`);
    const result = { postsCollected, articlesGenerated, entitiesUpdated, errors };
    syncStatus.lastResult = result;
    syncStatus.lastRunAt = new Date().toISOString();
    await logSync("hourly", "error", result);
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

  await logSync("deep", "running", { started_at: new Date().toISOString() });

  try {
    console.log("[scheduler] 深掘り同期開始...");
    const entityMap = await getEntityMap();

    // 全エンティティのプロフィール深掘り更新
    for (const handle of WATCHED_HANDLES) {
      try {
        const posts = await fetchPostsByHandles([handle], 15);
        if (posts.length === 0) continue;

        const entityId = entityMap.get(handle.toLowerCase());
        if (!entityId) continue;

        // ポスト保存
        const saved = await savePosts(posts, entityId);
        postsCollected += saved;

        // エンティティ名取得
        const { data: entity } = await supabase
          .from("entities")
          .select("name")
          .eq("id", entityId)
          .single();

        const entityName = entity?.name || handle;

        // プロフィール深掘り更新
        const updated = await updateEntityProfile(entityId, entityName, handle, posts);
        if (updated) {
          entitiesUpdated++;
          console.log(`[scheduler] @${handle}: プロフィール更新完了`);
        }

        await sleep(3000);
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

    await logSync("deep", "success", result);
    console.log(`[scheduler] 深掘り同期完了: エンティティ${entitiesUpdated}件更新`);
    return result;
  } catch (err: any) {
    errors.push(`致命的エラー: ${err.message}`);
    const result = { postsCollected, articlesGenerated, entitiesUpdated, errors };
    syncStatus.lastResult = result;
    await logSync("deep", "error", result);
    throw err;
  } finally {
    syncStatus.isRunning = false;
  }
}

// ─────────────────────────────────────────────
// cron スケジューラ起動
// ─────────────────────────────────────────────

function getNextCronTime(cronExpr: string): string {
  // 次回実行時刻の概算（cronライブラリのnextDate相当）
  const now = new Date();
  if (cronExpr.includes("0 * * * *")) {
    // 毎時0分
    const next = new Date(now);
    next.setMinutes(0, 0, 0);
    next.setHours(next.getHours() + 1);
    return next.toISOString();
  }
  if (cronExpr.includes("0 6 * * *")) {
    // 毎朝6時
    const next = new Date(now);
    next.setHours(6, 0, 0, 0);
    if (next <= now) next.setDate(next.getDate() + 1);
    return next.toISOString();
  }
  return "";
}

export function startScheduler() {
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

  // 毎朝6時: 深掘りプロフィール更新
  cron.schedule("0 6 * * *", async () => {
    console.log("[scheduler] 深掘り同期トリガー");
    syncStatus.nextDeepAt = getNextCronTime("0 6 * * *");
    try {
      await runDeepSync();
    } catch (err) {
      console.error("[scheduler] 深掘り同期失敗:", err);
    }
  });

  // 次回実行時刻を初期設定
  syncStatus.nextHourlyAt = getNextCronTime("0 * * * *");
  syncStatus.nextDeepAt = getNextCronTime("0 6 * * *");

  console.log(`[scheduler] 次回毎時同期: ${syncStatus.nextHourlyAt}`);
  console.log(`[scheduler] 次回深掘り同期: ${syncStatus.nextDeepAt}`);
}

// ─────────────────────────────────────────────
// ユーティリティ
// ─────────────────────────────────────────────

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
