import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useParams } from "wouter";
import type { Entity, XPost } from "@shared/schema";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ExternalLink, Twitter, Calendar, Globe, Users,
  Lightbulb, Target, Flag, Clock, ArrowLeft, FlaskConical,
  Briefcase, Building2, TrendingUp, Star
} from "lucide-react";
import { Link } from "wouter";
import { cn } from "@/lib/utils";
import { Tweet } from "react-tweet";

function TypeBadge({ type }: { type: string }) {
  const config = {
    researcher: { label: "研究者", icon: FlaskConical, color: "text-neon-cyan border-neon-cyan/40 bg-neon-cyan/10" },
    entrepreneur: { label: "企業家", icon: Briefcase, color: "text-neon-magenta border-neon-magenta/40 bg-neon-magenta/10" },
    company: { label: "企業", icon: Building2, color: "text-neon-gold border-yellow-500/40 bg-yellow-500/10" },
  } as const;
  const cfg = config[type as keyof typeof config] || config.researcher;
  return (
    <div className={cn("inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono font-bold border", cfg.color)}>
      <cfg.icon size={10} />
      {cfg.label}
    </div>
  );
}

function StatBadge({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string | number }) {
  return (
    <div className="glass-panel rounded-lg px-3 py-2 text-center">
      <Icon size={12} className="text-muted-foreground mx-auto mb-1" />
      <div className="text-sm font-bold mono">{value}</div>
      <div className="text-[10px] text-muted-foreground">{label}</div>
    </div>
  );
}

function Timeline({ events }: { events: { year: number; event: string; event_ja: string }[] }) {
  return (
    <div className="relative">
      {/* Vertical line */}
      <div className="absolute left-4 top-0 bottom-0 w-px bg-gradient-to-b from-neon-cyan/60 via-neon-purple/40 to-transparent" />
      <div className="space-y-4">
        {events.map((ev, i) => (
          <div key={i} className="flex gap-4 pl-0">
            <div className="relative flex flex-col items-center">
              <div className="w-8 h-8 rounded-full border border-neon-cyan/40 bg-background flex items-center justify-center z-10 shrink-0">
                <div className="w-2 h-2 rounded-full bg-neon-cyan" />
              </div>
            </div>
            <div className="pb-4 flex-1 animate-fade-slide" style={{ animationDelay: `${i * 0.06}s` }}>
              <div className="text-xs font-mono font-bold text-neon-cyan mb-0.5">{ev.year}</div>
              <div className="text-sm font-medium mb-0.5">{ev.event_ja}</div>
              <div className="text-xs text-muted-foreground">{ev.event}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}


function ContributionTag({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-2 p-2.5 rounded-md bg-muted/30 border border-border/50">
      <Star size={11} className="text-neon-gold mt-0.5 shrink-0" />
      <span className="text-xs">{text}</span>
    </div>
  );
}

export default function EntityPage() {
  const { id } = useParams<{ id: string }>();

  const { data: entity, isLoading } = useQuery<Entity>({
    queryKey: ["/api/entities", id],
    queryFn: () => apiRequest("GET", `/api/entities/${id}`).then(r => r.json()),
  });

  const { data: posts } = useQuery<XPost[]>({
    queryKey: ["/api/entities", id, "posts"],
    queryFn: () => apiRequest("GET", `/api/entities/${id}/posts`).then(r => r.json()),
    enabled: !!id,
  });

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-40 rounded-lg bg-card" />
        <div className="grid grid-cols-3 gap-3">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-lg bg-card" />)}
        </div>
        <Skeleton className="h-64 rounded-lg bg-card" />
      </div>
    );
  }

  if (!entity) {
    return (
      <div className="p-6 text-center">
        <p className="text-muted-foreground">エンティティが見つかりません</p>
        <Link href="/"><a className="text-neon-cyan hover:underline text-sm mt-2 inline-block">← ダッシュボードに戻る</a></Link>
      </div>
    );
  }

  const contributions = Array.isArray(entity.key_contributions) ? entity.key_contributions : [];
  const timeline = Array.isArray(entity.timeline) ? entity.timeline : [];

  return (
    <div className="min-h-full grid-bg">
      {/* Header banner */}
      <div className="relative overflow-hidden px-6 pt-6 pb-5 border-b border-border/50">
        {/* BG glow */}
        <div className="absolute inset-0 bg-gradient-radial-cyan pointer-events-none" />

        {/* Back link */}
        <Link href="/">
          <a className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-neon-cyan transition-colors mb-4">
            <ArrowLeft size={12} />
            ダッシュボードに戻る
          </a>
        </Link>

        <div className="flex items-start gap-4 relative">
          {/* Avatar */}
          {entity.avatar_url ? (
            <img
              src={entity.avatar_url}
              alt={entity.name}
              className="w-16 h-16 rounded-full object-cover ring-2 ring-neon-cyan/40 shrink-0"
              onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
          ) : (
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center text-xl font-bold shrink-0 ring-2 ring-border">
              {entity.name[0]}
            </div>
          )}

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <TypeBadge type={entity.type} />
              {entity.country && (
                <span className="text-[10px] font-mono text-muted-foreground">{entity.country}</span>
              )}
            </div>
            <h1 className="text-lg font-bold leading-tight">
              {entity.name}
              {entity.name_ja && (
                <span className="text-muted-foreground text-sm font-normal ml-2">（{entity.name_ja}）</span>
              )}
            </h1>
            {entity.affiliation && (
              <p className="text-xs text-muted-foreground mt-0.5">{entity.affiliation}</p>
            )}
            <div className="flex items-center gap-3 mt-2">
              {entity.handle && (
                <a
                  href={`https://x.com/${entity.handle}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-testid="twitter-link"
                  className="flex items-center gap-1 text-xs text-neon-cyan hover:opacity-70 transition-opacity"
                >
                  <Twitter size={11} />
                  @{entity.handle}
                </a>
              )}
              {entity.website && (
                <a
                  href={entity.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  <Globe size={11} />
                  Web
                </a>
              )}
            </div>
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-2 mt-4">
          <StatBadge icon={Users} label="フォロワー" value={entity.followers_count.toLocaleString()} />
          <StatBadge icon={Calendar} label="主な実績" value={contributions.length} />
          <StatBadge icon={TrendingUp} label="タイムライン" value={timeline.length} />
        </div>
      </div>

      {/* Content */}
      <div className="p-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Bio + Thinking + Contributions + Japan insight */}
        <div className="lg:col-span-2 space-y-5">
          {/* Bio */}
          {entity.bio_ja && (
            <section className="glass-panel rounded-lg p-5">
              <h2 className="text-xs font-mono font-bold uppercase tracking-widest text-neon-cyan mb-3 flex items-center gap-1.5">
                <Lightbulb size={11} />プロフィール
              </h2>
              <p className="text-sm leading-relaxed">{entity.bio_ja}</p>
              {entity.bio && entity.bio !== entity.bio_ja && (
                <p className="text-xs text-muted-foreground mt-2 leading-relaxed">{entity.bio}</p>
              )}
            </section>
          )}

          {/* Thinking style */}
          {entity.thinking_style && (
            <section className="glass-panel rounded-lg p-5">
              <h2 className="text-xs font-mono font-bold uppercase tracking-widest text-neon-magenta mb-3 flex items-center gap-1.5">
                <Target size={11} />思考スタイル
              </h2>
              <p className="text-sm leading-relaxed">{entity.thinking_style}</p>
            </section>
          )}

          {/* Key contributions */}
          {contributions.length > 0 && (
            <section className="glass-panel rounded-lg p-5">
              <h2 className="text-xs font-mono font-bold uppercase tracking-widest text-neon-gold mb-3 flex items-center gap-1.5">
                <Star size={11} />主な貢献・実績
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {contributions.map((c, i) => (
                  <ContributionTag key={i} text={c} />
                ))}
              </div>
            </section>
          )}

          {/* Japan insight */}
          {entity.japan_insight && (
            <section className="glass-panel rounded-lg p-5 border-neon-magenta/20">
              <h2 className="text-xs font-mono font-bold uppercase tracking-widest text-neon-magenta mb-3 flex items-center gap-1.5">
                <Flag size={11} />日本視点からの示唆
              </h2>
              <p className="text-sm leading-relaxed">{entity.japan_insight}</p>
            </section>
          )}

          {/* X Posts */}
          {posts && posts.length > 0 && (
            <section>
              <h2 className="text-xs font-mono font-bold uppercase tracking-widest text-muted-foreground mb-3 flex items-center gap-1.5">
                <Twitter size={11} />最新投稿
              </h2>
              <div className="space-y-3" data-theme="dark">
                {posts.slice(0, 10).map(post => (
                  <div key={post.id} data-testid={`post-${post.id}`}>
                    <Tweet id={post.post_id} />
                  </div>
                ))}
              </div>
            </section>
          )}

          {posts && posts.length === 0 && (
            <div className="glass-panel rounded-lg p-6 text-center">
              <Twitter size={20} className="text-muted-foreground mx-auto mb-2" />
              <p className="text-xs text-muted-foreground">X投稿データが未収集です。自動収集をセットアップしてください。</p>
            </div>
          )}
        </div>

        {/* Right: Timeline */}
        <div className="space-y-4">
          {timeline.length > 0 && (
            <section className="glass-panel rounded-lg p-5">
              <h2 className="text-xs font-mono font-bold uppercase tracking-widest text-neon-cyan mb-4 flex items-center gap-1.5">
                <Clock size={11} />タイムライン
              </h2>
              <Timeline events={timeline} />
            </section>
          )}

          {/* X account link */}
          <a
            href={`https://x.com/${entity.handle}`}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="view-on-x"
            className="flex items-center justify-center gap-2 w-full p-3 rounded-lg border border-neon-cyan/30 text-neon-cyan hover:bg-neon-cyan/10 transition-colors text-xs font-mono font-bold"
          >
            <Twitter size={12} />
            X (@{entity.handle}) を開く
            <ExternalLink size={10} />
          </a>
        </div>
      </div>
    </div>
  );
}
