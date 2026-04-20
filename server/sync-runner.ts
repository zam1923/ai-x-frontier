/**
 * sync-runner.ts — Vercel環境での手動トリガー用同期ランナー
 * scheduler.ts の runHourlySync / runDeepSync に委譲する
 */
export { runHourlySync as runHourlySyncDirect, runDeepSync as runDeepSyncDirect } from "./scheduler";
