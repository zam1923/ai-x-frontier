/**
 * AdminPanel.tsx — 自律運用ステータス・手動トリガーUI
 */
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import {
  Activity, RefreshCw, Zap, Clock, CheckCircle2,
  XCircle, Loader2, Play, Database, Radio, FileText,
  ChevronDown, ChevronUp, AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── 型定義 ───

interface SyncStatus {
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

interface SyncLog {
  id: string;
  sync_type: string;
  status: "running" | "success" | "error";
  details: any;
  ran_at: string;
}

// ─── ユーティリティ ───

function formatRelativeTime(iso: string | null): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(mins / 60);
  if (mins < 1) return "たった今";
  if (mins < 60) return `${mins}分前`;
  if (hours < 24) return `${hours}時間前`;
  return `${Math.floor(hours / 24)}日前`;
}

function formatAbsoluteTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("ja-JP", {
    month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

// ─── サブコンポーネント ───

function StatCard({
  label, value, icon: Icon, color,
}: {
  label: string;
  value: string | number;
  icon: any;
  color: string;
}) {
  return (
    <div className="rounded-lg border border-border/50 bg-card/60 p-4 flex items-center gap-3">
      <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center shrink-0", color)}>
        <Icon size={16} />
      </div>
      <div>
        <div className="text-lg font-bold font-mono leading-none">{value}</div>
        <div className="text-xs text-muted-foreground mt-0.5">{label}</div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "success") return (
    <span className="flex items-center gap-1 text-xs text-green-400 font-mono">
      <CheckCircle2 size={11} /> 成功
    </span>
  );
  if (status === "error") return (
    <span className="flex items-center gap-1 text-xs text-red-400 font-mono">
      <XCircle size={11} /> エラー
    </span>
  );
  return (
    <span className="flex items-center gap-1 text-xs text-yellow-400 font-mono">
      <Loader2 size={11} className="animate-spin" /> 実行中
    </span>
  );
}

function LogRow({ log }: { log: SyncLog }) {
  const [open, setOpen] = useState(false);
  const details = typeof log.details === "string" ? JSON.parse(log.details) : log.details;

  return (
    <div className="border-b border-border/30 last:border-none">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors text-left"
        data-testid={`log-row-${log.id}`}
      >
        <StatusBadge status={log.status} />
        <span className="flex-1 text-xs font-mono text-muted-foreground">
          {log.sync_type === "hourly" ? "毎時同期" : log.sync_type === "deep" ? "深掘り同期" : log.sync_type}
        </span>
        <span className="text-xs text-muted-foreground">{formatAbsoluteTime(log.ran_at)}</span>
        {open ? <ChevronUp size={12} className="text-muted-foreground shrink-0" /> : <ChevronDown size={12} className="text-muted-foreground shrink-0" />}
      </button>
      {open && details && (
        <div className="px-4 pb-3">
          <div className="rounded bg-muted/30 p-3 text-xs font-mono space-y-1">
            {details.postsCollected != null && (
              <div>収集ポスト: <span className="text-neon-cyan">{details.postsCollected}</span></div>
            )}
            {details.articlesGenerated != null && (
              <div>生成記事: <span className="text-neon-cyan">{details.articlesGenerated}</span></div>
            )}
            {details.entitiesUpdated != null && (
              <div>更新エンティティ: <span className="text-neon-cyan">{details.entitiesUpdated}</span></div>
            )}
            {details.errors && details.errors.length > 0 && (
              <div className="text-red-400 mt-1">
                エラー: {details.errors.join(" / ")}
              </div>
            )}
            {details.started_at && (
              <div className="text-muted-foreground/60 mt-1">開始: {formatAbsoluteTime(details.started_at)}</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── メインコンポーネント ───

export default function AdminPanel() {
  const qc = useQueryClient();
  const [triggerMsg, setTriggerMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  // ステータスポーリング（5秒ごと）
  const { data: status } = useQuery<SyncStatus>({
    queryKey: ["/api/sync/status"],
    queryFn: () => apiRequest("GET", "/api/sync/status").then(r => r.json()),
    refetchInterval: 5000,
  });

  // ログ取得（10秒ごと、running中は5秒）
  const { data: rawLogs } = useQuery<SyncLog[]>({
    queryKey: ["/api/sync/logs"],
    queryFn: () => apiRequest("GET", "/api/sync/logs?limit=30").then(r => r.json()),
    refetchInterval: status?.isRunning ? 5000 : 10000,
  });
  // running状態のログは最新1件のみ残す（重複した「実行中」を除去）
  const logs = (() => {
    if (!rawLogs) return [];
    const seen = new Set<string>();
    const result: SyncLog[] = [];
    let runningShown = false;
    for (const log of rawLogs) {
      if (log.status === "running") {
        if (!runningShown) { result.push(log); runningShown = true; }
      } else {
        result.push(log);
      }
    }
    return result;
  })();

  // 手動トリガー
  const triggerMutation = useMutation({
    mutationFn: (type: "hourly" | "deep") =>
      apiRequest("POST", `/api/sync/trigger/${type}`).then(r => r.json()),
    onSuccess: (data) => {
      setTriggerMsg({ type: "ok", text: data.message || "同期を開始しました" });
      setTimeout(() => setTriggerMsg(null), 4000);
      qc.invalidateQueries({ queryKey: ["/api/sync/status"] });
      qc.invalidateQueries({ queryKey: ["/api/sync/logs"] });
    },
    onError: (err: any) => {
      setTriggerMsg({ type: "err", text: err.message || "エラーが発生しました" });
      setTimeout(() => setTriggerMsg(null), 4000);
    },
  });

  const isRunning = status?.isRunning || triggerMutation.isPending;

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      {/* ヘッダー */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-neon-cyan/10 border border-neon-cyan/30 flex items-center justify-center">
          <Activity size={18} className="text-neon-cyan" />
        </div>
        <div>
          <h1 className="text-lg font-bold">管理パネル</h1>
          <p className="text-xs text-muted-foreground">自律運用エンジンのステータスと制御</p>
        </div>
        <div className="ml-auto">
          {isRunning ? (
            <span className="flex items-center gap-1.5 text-xs font-mono text-yellow-400 bg-yellow-400/10 border border-yellow-400/30 rounded-full px-3 py-1">
              <Loader2 size={11} className="animate-spin" />
              同期中...
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-xs font-mono text-neon-cyan bg-neon-cyan/10 border border-neon-cyan/30 rounded-full px-3 py-1">
              <Radio size={11} className="animate-pulse" />
              待機中
            </span>
          )}
        </div>
      </div>

      {/* ステータスカード */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard
          label="総実行回数"
          value={status?.totalRuns ?? 0}
          icon={RefreshCw}
          color="bg-neon-cyan/10 text-neon-cyan"
        />
        <StatCard
          label="最終実行"
          value={formatRelativeTime(status?.lastRunAt ?? null)}
          icon={Clock}
          color="bg-neon-magenta/10 text-neon-magenta"
        />
        <StatCard
          label="最終記事数"
          value={status?.lastResult?.articlesGenerated ?? 0}
          icon={FileText}
          color="bg-neon-purple/10 text-neon-purple"
        />
        <StatCard
          label="最終ポスト数"
          value={status?.lastResult?.postsCollected ?? 0}
          icon={Database}
          color="bg-neon-gold/10 text-neon-gold"
        />
      </div>

      {/* スケジュール情報 */}
      <div className="rounded-lg border border-border/50 bg-card/60 p-4 space-y-2">
        <div className="text-xs font-mono font-bold text-muted-foreground uppercase tracking-widest mb-3">
          自動スケジュール
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground flex items-center gap-2">
            <Zap size={12} className="text-neon-cyan" />
            次回毎時同期
          </span>
          <span className="font-mono text-xs text-foreground">{formatAbsoluteTime(status?.nextHourlyAt ?? null)}</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground flex items-center gap-2">
            <Activity size={12} className="text-neon-magenta" />
            次回深掘り同期（毎朝6時）
          </span>
          <span className="font-mono text-xs text-foreground">{formatAbsoluteTime(status?.nextDeepAt ?? null)}</span>
        </div>
      </div>

      {/* 手動トリガー */}
      <div className="rounded-lg border border-border/50 bg-card/60 p-4">
        <div className="text-xs font-mono font-bold text-muted-foreground uppercase tracking-widest mb-4">
          手動実行
        </div>
        <div className="flex flex-col sm:flex-row gap-3">
          <button
            data-testid="trigger-hourly"
            onClick={() => triggerMutation.mutate("hourly")}
            disabled={isRunning}
            className={cn(
              "flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all",
              "bg-neon-cyan/10 border border-neon-cyan/40 text-neon-cyan hover:bg-neon-cyan/20",
              "disabled:opacity-40 disabled:cursor-not-allowed"
            )}
          >
            {triggerMutation.isPending ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Play size={14} />
            )}
            毎時同期（記事生成）
          </button>
          <button
            data-testid="trigger-deep"
            onClick={() => triggerMutation.mutate("deep")}
            disabled={isRunning}
            className={cn(
              "flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all",
              "bg-neon-magenta/10 border border-neon-magenta/40 text-neon-magenta hover:bg-neon-magenta/20",
              "disabled:opacity-40 disabled:cursor-not-allowed"
            )}
          >
            {triggerMutation.isPending ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Activity size={14} />
            )}
            深掘り同期（プロフィール更新）
          </button>
        </div>

        {/* トリガー結果メッセージ */}
        {triggerMsg && (
          <div className={cn(
            "mt-3 flex items-center gap-2 text-xs rounded-lg px-3 py-2",
            triggerMsg.type === "ok"
              ? "bg-neon-cyan/10 text-neon-cyan border border-neon-cyan/30"
              : "bg-red-500/10 text-red-400 border border-red-400/30"
          )}>
            {triggerMsg.type === "ok"
              ? <CheckCircle2 size={12} />
              : <AlertCircle size={12} />
            }
            {triggerMsg.text}
          </div>
        )}
      </div>

      {/* 最終実行結果 */}
      {status?.lastResult && (
        <div className="rounded-lg border border-border/50 bg-card/60 p-4">
          <div className="text-xs font-mono font-bold text-muted-foreground uppercase tracking-widest mb-3">
            最終実行結果
            <span className="ml-2 normal-case font-normal text-muted-foreground/60">
              {status.lastRunType === "hourly" ? "（毎時同期）" : "（深掘り同期）"}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="rounded bg-muted/30 p-3">
              <div className="text-lg font-bold font-mono text-neon-cyan">{status.lastResult.postsCollected}</div>
              <div className="text-xs text-muted-foreground mt-0.5">収集ポスト</div>
            </div>
            <div className="rounded bg-muted/30 p-3">
              <div className="text-lg font-bold font-mono text-neon-magenta">{status.lastResult.articlesGenerated}</div>
              <div className="text-xs text-muted-foreground mt-0.5">生成記事</div>
            </div>
            <div className="rounded bg-muted/30 p-3">
              <div className="text-lg font-bold font-mono text-neon-purple">{status.lastResult.entitiesUpdated}</div>
              <div className="text-xs text-muted-foreground mt-0.5">エンティティ更新</div>
            </div>
          </div>
          {status.lastResult.errors.length > 0 && (
            <div className="mt-3 rounded bg-red-500/10 border border-red-400/20 p-2">
              <div className="text-xs text-red-400 font-mono">
                {status.lastResult.errors.map((e, i) => (
                  <div key={i}>⚠ {e}</div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 実行ログ */}
      <div className="rounded-lg border border-border/50 bg-card/60 overflow-hidden">
        <div className="px-4 py-3 border-b border-border/50 flex items-center justify-between">
          <div className="text-xs font-mono font-bold text-muted-foreground uppercase tracking-widest">
            実行ログ
          </div>
          <button
            onClick={() => {
              qc.invalidateQueries({ queryKey: ["/api/sync/logs"] });
              qc.invalidateQueries({ queryKey: ["/api/sync/status"] });
            }}
            className="text-muted-foreground hover:text-foreground transition-colors"
            data-testid="refresh-logs"
          >
            <RefreshCw size={13} />
          </button>
        </div>
        {logs && logs.length > 0 ? (
          <div>
            {logs.map(log => <LogRow key={log.id} log={log} />)}
          </div>
        ) : (
          <div className="px-4 py-8 text-center text-xs text-muted-foreground font-mono">
            実行履歴がありません
          </div>
        )}
      </div>
    </div>
  );
}
