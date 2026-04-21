/**
 * scheduler.ts — node-cron による完全自律定期実行エンジン
 * X投稿収集に特化（記事生成なし）
 */

import cron from "node-cron";
import supabase from "./supabase";
import { WATCHED_HANDLES, savePosts, getEntityMap } from "./collector";
import {
  searchPostsByHandles,
  updateEntityProfileWithLiveSearch,
  type LiveSearchPost,
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

let schedulerStarted = false;

export function getSyncStatus(): SyncStatus {
  return { ...syncStatus };
}

// ─────────────────────────────────────────────
// sync_logs テーブルへの記録
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
      .update({ status, details: JSON.stringify(details) })
      .eq("id", logId);
  } catch (err) {
    console.error("[scheduler] Failed to update sync log:", err);
  }
}

// LiveSearchPost → RawPost 変換してDBに保存
// エンティティが存在しない場合は自動作成する
async function savePostsFromLiveSearch(
  posts: LiveSearchPost[],
  entityMap: Map<string, string>
): Promise<number> {
  let saved = 0;
  for (const post of posts) {
    const handleKey = post.author_handle.toLowerCase();
    let entityId = entityMap.get(handleKey);

    // エンティティが未登録なら自動作成
    if (!entityId) {
      try {
        const { data } = await supabase
          .from("entities")
          .insert({
            handle: post.author_handle,
            name: post.author_handle,
            type: "researcher",
          })
          .select("id")
          .single();
        if (data?.id) {
          entityId = data.id;
          entityMap.set(handleKey, entityId!);
          console.log(`[scheduler] エンティティ自動作成: @${post.author_handle}`);
        }
      } catch {
        // 重複エラーなどは無視
        const { data } = await supabase
          .from("entities")
          .select("id")
          .eq("handle", post.author_handle)
          .single();
        if (data?.id) {
          entityId = data.id;
          entityMap.set(handleKey, entityId!);
        }
      }
    }

    if (!entityId) continue;

    const count = await savePosts(
      [
        {
          id: post.post_id,
          text: post.text,
          author_handle: post.author_handle,
          author_name: post.author_handle,
          created_at: post.published_at,
          likes: 0,
          retweets: 0,
          replies: 0,
          url: post.url,
        },
      ],
      entityId
    );
    saved += count;
  }
  return saved;
}

// ─────────────────────────────────────────────
// 毎時同期（Grok Live Search バッチ処理）
// ─────────────────────────────────────────────

// ハンドルを n 件ずつのバッチに分割
function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

export async function runHourlySync(): Promise<{
  postsCollected: number;
  articlesGenerated: number;
  entitiesUpdated: number;
  errors: string[];
}> {
  if (syncStatus.isRunning) throw new Error("同期処理が既に実行中です");

  syncStatus.isRunning = true;
  syncStatus.lastRunType = "hourly";
  const errors: string[] = [];
  let postsCollected = 0;

  const logId = await logSyncStart("hourly", { started_at: new Date().toISOString() });

  try {
    console.log("[scheduler] 投稿収集開始...");
    const entityMap = await getEntityMap();

    // ハンドルを8件ずつバッチ化（allowed_x_handles 上限10件以内）
    const batches = chunkArray(WATCHED_HANDLES, 8);

    for (const batch of batches) {
      try {
        const posts = await searchPostsByHandles(batch);
        if (posts.length > 0) {
          const saved = await savePostsFromLiveSearch(posts, entityMap);
          postsCollected += saved;
          console.log(`[scheduler] バッチ(${batch[0]}...): ${saved}件保存`);
        }
      } catch (err: any) {
        const msg = `バッチ(${batch[0]}...): ${err.message}`;
        errors.push(msg);
        console.error(`[scheduler] エラー — ${msg}`);
      }
    }

    // トレンド検索（全体）
    try {
      const trendPosts = await searchPostsByHandles([]);
      if (trendPosts.length > 0) {
        const saved = await savePostsFromLiveSearch(trendPosts, entityMap);
        postsCollected += saved;
      }
    } catch (err: any) {
      errors.push(`トレンド検索: ${err.message}`);
    }

    const result = { postsCollected, articlesGenerated: 0, entitiesUpdated: 0, errors };
    syncStatus.lastResult = result;
    syncStatus.lastRunAt = new Date().toISOString();
    syncStatus.totalRuns++;

    await logSyncEnd(logId, "success", result);
    console.log(`[scheduler] 投稿収集完了: ${postsCollected}件`);
    return result;
  } catch (err: any) {
    errors.push(`致命的エラー: ${err.message}`);
    const result = { postsCollected, articlesGenerated: 0, entitiesUpdated: 0, errors };
    syncStatus.lastResult = result;
    syncStatus.lastRunAt = new Date().toISOString();
    await logSyncEnd(logId, "error", result);
    throw err;
  } finally {
    syncStatus.isRunning = false;
  }
}

// ─────────────────────────────────────────────
// 深掘り更新（毎朝6時 JST = 21:00 UTC）
// ─────────────────────────────────────────────

export async function runDeepSync(): Promise<{
  postsCollected: number;
  articlesGenerated: number;
  entitiesUpdated: number;
  errors: string[];
}> {
  if (syncStatus.isRunning) throw new Error("同期処理が既に実行中です");

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
    console.log("[scheduler] 深掘り同期開始（Grok Live Search）...");
    const entityMap = await getEntityMap();

    for (const handle of WATCHED_HANDLES) {
      try {
        const entityId = entityMap.get(handle.toLowerCase());
        if (!entityId) continue;

        const { data: entity } = await supabase
          .from("entities")
          .select("name")
          .eq("id", entityId)
          .single();

        const entityName = entity?.name || handle;

        const { updated, posts } = await updateEntityProfileWithLiveSearch(
          entityId,
          entityName,
          handle
        );

        if (posts.length > 0) {
          const saved = await savePostsFromLiveSearch(posts, entityMap);
          postsCollected += saved;
        }

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
// cron スケジューラ起動
// ─────────────────────────────────────────────

// 1日2回（UTC 0:00 = JST 9:00 朝 / UTC 12:00 = JST 21:00 夜）
const ARTICLE_SYNC_CRON = "0 0,12 * * *";
// 深掘りは1日1回（UTC 21:00 = JST 6:00 朝）
const DEEP_SYNC_CRON = "0 21 * * *";

function getNextCronTime(cronExpr: string): string {
  const now = new Date();
  if (cronExpr === ARTICLE_SYNC_CRON) {
    const next = new Date(now);
    const utcHour = next.getUTCHours();
    // 次の 0:00 または 12:00 UTC を計算
    if (utcHour < 12) {
      next.setUTCHours(12, 0, 0, 0);
    } else {
      next.setUTCHours(24, 0, 0, 0); // 翌日 0:00
    }
    return next.toISOString();
  }
  if (cronExpr === DEEP_SYNC_CRON) {
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

  console.log("[scheduler] 自律運用スケジューラ起動（1日2回 + 深掘り1回）");

  // JST 9:00 と 21:00 の1日2回
  cron.schedule(ARTICLE_SYNC_CRON, async () => {
    console.log("[scheduler] 記事同期トリガー（1日2回）");
    syncStatus.nextHourlyAt = getNextCronTime(ARTICLE_SYNC_CRON);
    try {
      await runHourlySync();
    } catch (err) {
      console.error("[scheduler] 記事同期失敗:", err);
    }
  });

  cron.schedule(DEEP_SYNC_CRON, async () => {
    console.log("[scheduler] 深掘り同期トリガー");
    syncStatus.nextDeepAt = getNextCronTime(DEEP_SYNC_CRON);
    try {
      await runDeepSync();
    } catch (err) {
      console.error("[scheduler] 深掘り同期失敗:", err);
    }
  });

  syncStatus.nextHourlyAt = getNextCronTime(ARTICLE_SYNC_CRON);
  syncStatus.nextDeepAt = getNextCronTime(DEEP_SYNC_CRON);

  console.log(`[scheduler] 次回記事同期: ${syncStatus.nextHourlyAt}`);
  console.log(`[scheduler] 次回深掘り同期: ${syncStatus.nextDeepAt}`);
}
