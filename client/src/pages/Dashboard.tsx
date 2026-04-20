import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Link } from "wouter";
import type { Article, Entity, TrendTag } from "@shared/schema";
import { Skeleton } from "@/components/ui/skeleton";
import {
  TrendingUp, Flame, Clock, Zap, ChevronRight,
  FlaskConical, Briefcase, Building2, Globe, Users
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

// ---- Sub-components ----

function Header() {
  const now = new Date();
  const weekdays = ["日", "月", "火", "水", "木", "金", "土"];
  const dateStr = `${now.getFullYear()}年${now.getMonth()+1}月${now.getDate()}日（${weekdays[now.getDay()]}）`;
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
          <p className="text-xs text-muted-foreground mt-0.5 font-mono">{dateStr} · {timeStr} JST</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="text-right">
            <div className="text-[10px] text-muted-foreground font-mono">AI X FRONTIER</div>
            <div className="text-[10px] text-neon-magenta font-mono font-bold">Powered by Grok + Supabase</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function HeatScore({ score }: { score: number }) {
  const pct = Math.min(100, score);
  const color = score >= 90 ? "text-neon-magenta" : score >= 70 ? "text-neon-cyan" : "text-muted-foreground";
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

function ArticleCard({ article, index }: { article: Article; index: number }) {
  const tags: string[] = Array.isArray(article.tags) ? article.tags : [];
  const ago = getTimeAgo(article.published_at);

  return (
    <Link href={`/article/${article.id}`}>
      <a
        data-testid={`article-card-${article.id}`}
        className="block group glass-panel rounded-lg p-4 hover:border-neon-cyan/40 transition-all duration-200 hover:shadow-neon-sm cursor-pointer"
        style={{ animationDelay: `${index * 0.05}s` }}
      >
        <div className="flex items-start justify-between gap-3 mb-2">
          <h3 className="text-sm font-semibold leading-snug group-hover:text-neon-cyan transition-colors line-clamp-2">
            {article.title}
          </h3>
          <ChevronRight size={14} className="shrink-0 mt-0.5 text-muted-foreground group-hover:text-neon-cyan transition-colors" />
        </div>
        <p className="text-xs text-muted-foreground line-clamp-2 mb-3 leading-relaxed">{article.summary}</p>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 flex-wrap">
            {tags.slice(0, 3).map(tag => (
              <span key={tag} className="tag-chip">{tag}</span>
            ))}
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <HeatScore score={article.heat_score} />
            <div className="flex items-center gap-1 text-[10px] text-muted-foreground font-mono">
              <Clock size={9} />
              <span>{ago}</span>
            </div>
          </div>
        </div>
        {article.source_handle && (
          <div className="mt-2 text-[10px] text-muted-foreground font-mono">
            @{article.source_handle}
          </div>
        )}
      </a>
    </Link>
  );
}

function TrendPanel({ tags }: { tags: TrendTag[] }) {
  const max = tags[0]?.count || 1;
  return (
    <div className="glass-panel rounded-lg p-4">
      <div className="flex items-center gap-2 mb-3">
        <TrendingUp size={14} className="text-neon-cyan" />
        <h2 className="text-xs font-bold uppercase tracking-widest text-neon-cyan font-mono">トレンド</h2>
      </div>
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
                    background: i < 3 ? "var(--neon-cyan)" : i < 6 ? "var(--neon-purple)" : "var(--neon-magenta)",
                    opacity: 1 - i * 0.07,
                  }}
                />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function EntityTypeIcon({ type }: { type: string }) {
  if (type === "researcher") return <FlaskConical size={12} className="text-neon-cyan" />;
  if (type === "entrepreneur") return <Briefcase size={12} className="text-neon-magenta" />;
  return <Building2 size={12} className="text-neon-gold" />;
}

function EntityCard({ entity }: { entity: Entity }) {
  const typeLabels: Record<string, string> = {
    researcher: "研究者",
    entrepreneur: "企業家",
    company: "企業",
  };
  const typeColors: Record<string, string> = {
    researcher: "border-neon-cyan/30 hover:border-neon-cyan/60",
    entrepreneur: "border-neon-magenta/30 hover:border-neon-magenta/60",
    company: "border-yellow-500/30 hover:border-yellow-500/60",
  };

  return (
    <Link href={`/entity/${entity.id}`}>
      <a
        data-testid={`entity-card-${entity.id}`}
        className={cn(
          "flex items-center gap-3 p-3 rounded-lg border bg-card/30 hover:bg-card/60 transition-all duration-200 cursor-pointer group",
          typeColors[entity.type]
        )}
      >
        {entity.avatar_url ? (
          <img
            src={entity.avatar_url}
            alt={entity.name}
            className="w-9 h-9 rounded-full object-cover ring-1 ring-border shrink-0"
            onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
        ) : (
          <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center shrink-0 text-sm font-bold">
            {entity.name[0]}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5">
            <EntityTypeIcon type={entity.type} />
            <span className="text-xs font-semibold truncate">{entity.name}</span>
          </div>
          <div className="text-[10px] text-muted-foreground truncate">{entity.name_ja || entity.affiliation}</div>
        </div>
        <ChevronRight size={12} className="text-muted-foreground group-hover:text-foreground shrink-0" />
      </a>
    </Link>
  );
}

function KPICard({ label, value, sub, icon: Icon, color }: {
  label: string; value: string | number; sub?: string;
  icon: React.ElementType; color: string;
}) {
  return (
    <div className={cn("glass-panel rounded-lg p-4 border", color)}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">{label}</span>
        <Icon size={14} className="text-muted-foreground" />
      </div>
      <div className="text-xl font-bold font-mono mono">{value}</div>
      {sub && <div className="text-[10px] text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  );
}

// ---- Utils ----

function getTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}分前`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}時間前`;
  return `${Math.floor(hrs / 24)}日前`;
}

// ---- Main Dashboard ----

export default function Dashboard() {
  const { data: articles, isLoading: articlesLoading } = useQuery<Article[]>({
    queryKey: ["/api/articles"],
    queryFn: () => apiRequest("GET", "/api/articles?limit=10").then(r => r.json()),
    refetchInterval: 60000, // refresh every minute
  });

  const { data: entities, isLoading: entitiesLoading } = useQuery<Entity[]>({
    queryKey: ["/api/entities"],
    queryFn: () => apiRequest("GET", "/api/entities").then(r => r.json()),
  });

  const { data: trends, isLoading: trendsLoading } = useQuery<TrendTag[]>({
    queryKey: ["/api/trends"],
    queryFn: () => apiRequest("GET", "/api/trends").then(r => r.json()),
  });

  const avgHeat = articles?.length
    ? Math.round(articles.reduce((a, b) => a + b.heat_score, 0) / articles.length)
    : 0;

  return (
    <div className="min-h-full grid-bg">
      <Header />

      <div className="p-6 space-y-6">
        {/* KPI row */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 stagger">
          <KPICard
            label="総記事数" value={articles?.length ?? "—"} sub="本日収集"
            icon={Zap} color="border-neon-cyan/20"
          />
          <KPICard
            label="平均熱量" value={avgHeat} sub="ヒートスコア"
            icon={Flame} color="border-neon-magenta/20"
          />
          <KPICard
            label="注目人物" value={entities?.length ?? "—"} sub="登録エンティティ"
            icon={Users} color="border-purple-500/20"
          />
          <KPICard
            label="トレンド" value={trends?.length ?? "—"} sub="本日タグ数"
            icon={TrendingUp} color="border-yellow-500/20"
          />
        </div>

        {/* Main content */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Articles — 2/3 width */}
          <div className="lg:col-span-2 space-y-3">
            <div className="flex items-center gap-2 mb-2">
              <Flame size={14} className="text-neon-magenta" />
              <h2 className="text-xs font-bold uppercase tracking-widest text-neon-magenta font-mono">最新記事</h2>
            </div>
            {articlesLoading
              ? Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-24 rounded-lg bg-card" />
                ))
              : (articles || []).map((article, i) => (
                  <ArticleCard key={article.id} article={article} index={i} />
                ))
            }
            {!articlesLoading && !articles?.length && (
              <div className="glass-panel rounded-lg p-8 text-center">
                <Zap size={24} className="text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">まだ記事がありません。自動収集をセットアップしてください。</p>
              </div>
            )}
          </div>

          {/* Right column — Trends + Entities */}
          <div className="space-y-4">
            {/* Trends */}
            {trendsLoading
              ? <Skeleton className="h-64 rounded-lg bg-card" />
              : <TrendPanel tags={trends || []} />
            }

            {/* Entities quick view */}
            <div className="glass-panel rounded-lg p-4">
              <div className="flex items-center gap-2 mb-3">
                <Globe size={14} className="text-neon-cyan" />
                <h2 className="text-xs font-bold uppercase tracking-widest text-neon-cyan font-mono">注目人物・企業</h2>
              </div>
              <div className="space-y-2">
                {entitiesLoading
                  ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 rounded-lg bg-card" />)
                  : (entities || []).slice(0, 6).map(entity => (
                      <EntityCard key={entity.id} entity={entity} />
                    ))
                }
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
