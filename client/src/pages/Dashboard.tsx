import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Link } from "wouter";
import type { Article, Entity, TrendTag } from "@shared/schema";
import { Skeleton } from "@/components/ui/skeleton";
import {
  TrendingUp, Flame, Clock, Zap, ChevronRight,
  FlaskConical, Briefcase, Building2, Globe, Users,
  ExternalLink, Twitter
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── utils ───

function getTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "たった今";
  if (mins < 60) return `${mins}分前`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}時間前`;
  return `${Math.floor(hrs / 24)}日前`;
}

// ─── Header ───

function Header({ articleCount, entityCount }: { articleCount: number; entityCount: number }) {
  const now = new Date();
  const weekdays = ["日", "月", "火", "水", "木", "金", "土"];
  const dateStr = `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日（${weekdays[now.getDay()]}）`;
  const timeStr = now.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });

  return (
    <div className="px-6 pt-6 pb-4 border-b border-border/50">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-2 h-2 rounded-full bg-neon-cyan live-dot" />
            <span className="text-[11px] font-mono text-neon-cyan uppercase tracking-widest">Live Dashboard</span>
          </div>
          <h1 className="text-xl font-bold tracking-tight">
            今日の<span className="neon-text-cyan">X最先端</span>まとめ
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5 font-mono">
            {dateStr} · {timeStr} JST
          </p>
        </div>
        <div className="text-right hidden sm:block">
          <div className="text-[10px] text-muted-foreground font-mono">AI X FRONTIER</div>
          <div className="text-[10px] text-neon-magenta font-mono font-bold">
            記事 {articleCount} · 人物 {entityCount}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── HeatScore ───

function HeatScore({ score }: { score: number }) {
  const pct = Math.min(100, score);
  const color =
    score >= 90
      ? "text-neon-magenta"
      : score >= 70
      ? "text-neon-cyan"
      : "text-muted-foreground";
  return (
    <div className="flex items-center gap-1.5">
      <Flame size={11} className={cn(color)} />
      <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
        <div className="heat-bar h-full rounded-full" style={{ width: `${pct}%` }} />
      </div>
      <span className={cn("text-[10px] font-mono font-bold", color)}>{score}</span>
    </div>
  );
}

// ─── ArticleCard ───

function ArticleCard({ article, index }: { article: Article; index: number }) {
  const tags: string[] = Array.isArray(article.tags) ? article.tags : [];
  const ago = getTimeAgo(article.published_at);
  const xUrl = article.source_url || (article.source_handle ? `https://x.com/${article.source_handle}` : null);

  return (
    <div
      data-testid={`article-card-${article.id}`}
      className="group glass-panel rounded-lg p-4 hover:border-neon-cyan/40 transition-all duration-200 hover:shadow-neon-sm"
      style={{ animationDelay: `${index * 0.05}s` }}
    >
      {/* ソース + 時刻 */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          {article.source_handle && (
            <a
              href={xUrl || "#"}
              target="_blank"
              rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
              className="flex items-center gap-1 text-[10px] font-mono text-neon-cyan hover:opacity-70 transition-opacity"
            >
              <Twitter size={9} />
              @{article.source_handle}
              <ExternalLink size={7} />
            </a>
          )}
        </div>
        <div className="flex items-center gap-1 text-[10px] text-muted-foreground font-mono">
          <Clock size={9} />
          <span>{ago}</span>
        </div>
      </div>

      {/* タイトル */}
      <Link href={`/article/${article.id}`}>
        <a className="block">
          <h3 className="text-sm font-semibold leading-snug group-hover:text-neon-cyan transition-colors line-clamp-2 mb-1.5 cursor-pointer">
            {article.title}
          </h3>
          <p className="text-xs text-muted-foreground line-clamp-2 mb-3 leading-relaxed">
            {article.summary}
          </p>
        </a>
      </Link>

      {/* フッター */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 flex-wrap">
          {tags.slice(0, 3).map((tag) => (
            <span key={tag} className="tag-chip">{tag}</span>
          ))}
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <HeatScore score={article.heat_score} />
          <Link href={`/article/${article.id}`}>
            <a className="text-muted-foreground hover:text-neon-cyan transition-colors">
              <ChevronRight size={14} />
            </a>
          </Link>
        </div>
      </div>
    </div>
  );
}

// ─── EmptyArticles — 記事ゼロ時の表示 ───

function EmptyArticles({ entities }: { entities: Entity[] }) {
  return (
    <div className="space-y-4">
      <div className="glass-panel rounded-lg p-6 text-center border-neon-cyan/10">
        <div className="w-12 h-12 rounded-full bg-neon-cyan/10 flex items-center justify-center mx-auto mb-3">
          <Zap size={20} className="text-neon-cyan" />
        </div>
        <p className="text-sm font-medium mb-1">まだ記事がありません</p>
        <p className="text-xs text-muted-foreground">
          毎時自動収集が稼働中です。次回同期で記事が生成されます。
        </p>
      </div>
      {/* 代わりにエンティティ一覧を表示 */}
      {entities.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Users size={13} className="text-neon-cyan" />
            <h3 className="text-xs font-bold font-mono uppercase tracking-widest text-neon-cyan">
              監視中の人物・企業
            </h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {entities.map(e => (
              <EntityCard key={e.id} entity={e} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── TrendPanel ───

function TrendPanel({ tags }: { tags: TrendTag[] }) {
  const max = tags[0]?.count || 1;
  return (
    <div className="glass-panel rounded-lg p-4">
      <div className="flex items-center gap-2 mb-3">
        <TrendingUp size={14} className="text-neon-cyan" />
        <h2 className="text-xs font-bold uppercase tracking-widest text-neon-cyan font-mono">トレンドタグ</h2>
      </div>
      {tags.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-4">
          記事収集後に集計されます
        </p>
      ) : (
        <div className="space-y-2">
          {tags.slice(0, 10).map((tag, i) => (
            <div key={tag.id} className="flex items-center gap-2">
              <span className="w-4 text-[10px] font-mono text-muted-foreground shrink-0">{i + 1}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-xs font-medium truncate">{tag.tag}</span>
                  <span className="text-[10px] font-mono text-muted-foreground ml-2">{tag.count}</span>
                </div>
                <div className="h-1 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${(tag.count / max) * 100}%`,
                      background:
                        i < 3
                          ? "var(--neon-cyan)"
                          : i < 6
                          ? "var(--neon-purple)"
                          : "var(--neon-magenta)",
                      opacity: 1 - i * 0.07,
                    }}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── EntityCard ───

function EntityTypeIcon({ type }: { type: string }) {
  if (type === "researcher") return <FlaskConical size={11} className="text-neon-cyan" />;
  if (type === "entrepreneur") return <Briefcase size={11} className="text-neon-magenta" />;
  return <Building2 size={11} className="text-neon-gold" />;
}

const typeColors: Record<string, string> = {
  researcher: "border-neon-cyan/25 hover:border-neon-cyan/55",
  entrepreneur: "border-neon-magenta/25 hover:border-neon-magenta/55",
  company: "border-yellow-500/25 hover:border-yellow-500/55",
};

function EntityCard({ entity }: { entity: Entity }) {
  const fmtFollowers = (n: number) =>
    n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(0)}K` : String(n);

  return (
    <Link href={`/entity/${entity.id}`}>
      <a
        data-testid={`entity-card-${entity.id}`}
        className={cn(
          "flex items-center gap-3 p-3 rounded-lg border bg-card/30 hover:bg-card/60 transition-all duration-200 cursor-pointer group",
          typeColors[entity.type] || "border-border/40"
        )}
      >
        {/* Avatar */}
        {entity.avatar_url ? (
          <img
            src={entity.avatar_url}
            alt={entity.name}
            className="w-10 h-10 rounded-full object-cover ring-1 ring-border shrink-0"
            onError={(e) => {
              (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent(entity.name)}&background=0d1117&color=00D4FF&size=40`;
            }}
          />
        ) : (
          <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center shrink-0 text-sm font-bold text-neon-cyan">
            {entity.name[0]}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5">
            <EntityTypeIcon type={entity.type} />
            <span className="text-xs font-semibold truncate">{entity.name}</span>
          </div>
          <div className="text-[10px] text-muted-foreground truncate">
            {entity.name_ja || entity.affiliation}
          </div>
          {entity.followers_count > 0 && (
            <div className="text-[10px] font-mono text-muted-foreground/60 mt-0.5">
              {fmtFollowers(entity.followers_count)} フォロワー
            </div>
          )}
        </div>
        <ChevronRight size={12} className="text-muted-foreground group-hover:text-foreground shrink-0 transition-colors" />
      </a>
    </Link>
  );
}

// ─── EntitySection — 全エンティティをタイプ別表示 ───

function EntitySection({ entities, loading }: { entities: Entity[]; loading: boolean }) {
  const sections = [
    { type: "researcher", label: "研究者", icon: FlaskConical, color: "text-neon-cyan" },
    { type: "entrepreneur", label: "企業家", icon: Briefcase, color: "text-neon-magenta" },
    { type: "company", label: "企業・組織", icon: Building2, color: "text-neon-gold" },
  ] as const;

  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-14 rounded-lg bg-card" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {sections.map(({ type, label, icon: Icon, color }) => {
        const filtered = entities.filter((e) => e.type === type);
        if (filtered.length === 0) return null;
        return (
          <div key={type}>
            <div className={cn("flex items-center gap-1.5 mb-2", color)}>
              <Icon size={11} />
              <span className="text-[10px] font-mono font-bold uppercase tracking-widest">{label}</span>
              <span className="text-[9px] font-mono text-muted-foreground ml-1">({filtered.length})</span>
            </div>
            <div className="space-y-1.5">
              {filtered.map((e) => (
                <EntityCard key={e.id} entity={e} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── KPI Card ───

function KPICard({
  label, value, sub, icon: Icon, color,
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon: React.ElementType;
  color: string;
}) {
  return (
    <div className={cn("glass-panel rounded-lg p-4 border", color)}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">{label}</span>
        <Icon size={14} className="text-muted-foreground" />
      </div>
      <div className="text-xl font-bold font-mono">{value}</div>
      {sub && <div className="text-[10px] text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  );
}

// ─── Main Dashboard ───

export default function Dashboard() {
  const { data: articles, isLoading: articlesLoading } = useQuery<Article[]>({
    queryKey: ["/api/articles"],
    queryFn: () => apiRequest("GET", "/api/articles?limit=20").then((r) => r.json()),
    refetchInterval: 60000,
  });

  const { data: entities, isLoading: entitiesLoading } = useQuery<Entity[]>({
    queryKey: ["/api/entities"],
    queryFn: () => apiRequest("GET", "/api/entities").then((r) => r.json()),
    refetchInterval: 300000,
  });

  const { data: trends, isLoading: trendsLoading } = useQuery<TrendTag[]>({
    queryKey: ["/api/trends"],
    queryFn: () => apiRequest("GET", "/api/trends").then((r) => r.json()),
    refetchInterval: 300000,
  });

  const avgHeat = articles?.length
    ? Math.round(articles.reduce((a, b) => a + b.heat_score, 0) / articles.length)
    : 0;

  const hasArticles = (articles?.length ?? 0) > 0;

  return (
    <div className="min-h-full grid-bg">
      <Header
        articleCount={articles?.length ?? 0}
        entityCount={entities?.length ?? 0}
      />

      <div className="p-6 space-y-6">
        {/* KPI row */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <KPICard
            label="総記事数"
            value={articles?.length ?? "—"}
            sub="自動収集"
            icon={Zap}
            color="border-neon-cyan/20"
          />
          <KPICard
            label="平均熱量"
            value={avgHeat || "—"}
            sub="ヒートスコア"
            icon={Flame}
            color="border-neon-magenta/20"
          />
          <KPICard
            label="監視対象"
            value={entities?.length ?? "—"}
            sub="人物・企業"
            icon={Users}
            color="border-purple-500/20"
          />
          <KPICard
            label="トレンドタグ"
            value={trends?.length ?? "—"}
            sub="本日集計"
            icon={TrendingUp}
            color="border-yellow-500/20"
          />
        </div>

        {/* Main grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* 左: 記事 or エンティティ全表示 */}
          <div className="lg:col-span-2 space-y-3">
            {hasArticles ? (
              <>
                <div className="flex items-center gap-2 mb-1">
                  <Flame size={14} className="text-neon-magenta" />
                  <h2 className="text-xs font-bold uppercase tracking-widest text-neon-magenta font-mono">最新記事</h2>
                </div>
                {articlesLoading
                  ? Array.from({ length: 5 }).map((_, i) => (
                      <Skeleton key={i} className="h-28 rounded-lg bg-card" />
                    ))
                  : articles!.map((article, i) => (
                      <ArticleCard key={article.id} article={article} index={i} />
                    ))}
              </>
            ) : (
              <>
                <div className="flex items-center gap-2 mb-1">
                  <Globe size={14} className="text-neon-cyan" />
                  <h2 className="text-xs font-bold uppercase tracking-widest text-neon-cyan font-mono">監視対象 — 人物・企業</h2>
                </div>
                {articlesLoading || entitiesLoading ? (
                  Array.from({ length: 6 }).map((_, i) => (
                    <Skeleton key={i} className="h-14 rounded-lg bg-card" />
                  ))
                ) : (
                  <EmptyArticles entities={entities || []} />
                )}
              </>
            )}
          </div>

          {/* 右: トレンド + エンティティ */}
          <div className="space-y-4">
            {/* Trends */}
            {trendsLoading ? (
              <Skeleton className="h-64 rounded-lg bg-card" />
            ) : (
              <TrendPanel tags={trends || []} />
            )}

            {/* Entities — 記事がある時はサイドに縮小表示 */}
            {hasArticles && (
              <div className="glass-panel rounded-lg p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Globe size={14} className="text-neon-cyan" />
                  <h2 className="text-xs font-bold uppercase tracking-widest text-neon-cyan font-mono">監視対象</h2>
                </div>
                <EntitySection entities={entities || []} loading={entitiesLoading} />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
