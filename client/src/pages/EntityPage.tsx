import { useState, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useParams } from "wouter";
import type { Entity, XPost } from "@shared/schema";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ExternalLink, Twitter, Calendar, Globe, Users,
  Lightbulb, Target, Flag, Clock, ArrowLeft, FlaskConical,
  Briefcase, Building2, TrendingUp, Star, ChevronLeft, ChevronRight,
} from "lucide-react";
import { Link } from "wouter";
import { cn } from "@/lib/utils";
import { Tweet } from "react-tweet";

// ─── Type badge ───

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

// ─── Avatar ───

function EntityAvatar({ entity, className }: { entity: Entity; className?: string }) {
  const [err, setErr] = useState(false);
  const src = entity.avatar_url || `https://unavatar.io/twitter/${entity.handle}`;
  if (err) {
    return (
      <div className={cn("rounded-full bg-gradient-to-br from-neon-cyan/30 via-neon-purple/20 to-neon-magenta/30 flex items-center justify-center font-bold border border-white/10", className)}>
        <span className="text-2xl">{entity.name[0]}</span>
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={entity.name}
      className={cn("rounded-full object-cover", className)}
      onError={() => setErr(true)}
    />
  );
}

// ─── Horizontal tweet timeline ───

function TweetTimeline({ posts }: { posts: XPost[] }) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const scroll = (dir: "left" | "right") => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({ left: dir === "left" ? -300 : 300, behavior: "smooth" });
  };

  if (!posts.length) {
    return (
      <div className="flex items-center justify-center gap-2 py-8 text-xs text-muted-foreground font-mono border border-border/30 rounded-xl">
        <Twitter size={14} />
        X投稿データが未収集です
      </div>
    );
  }

  return (
    <div className="relative group/timeline">
      {/* Left arrow */}
      <button
        onClick={() => scroll("left")}
        className="absolute left-0 top-1/2 -translate-y-1/2 z-10 w-8 h-8 rounded-full bg-background/80 border border-border/60 flex items-center justify-center opacity-0 group-hover/timeline:opacity-100 transition-opacity shadow-lg -translate-x-3 hover:bg-background"
      >
        <ChevronLeft size={14} />
      </button>

      {/* Scroll container */}
      <div
        ref={scrollRef}
        className="flex gap-3 overflow-x-auto pb-3"
        style={{ scrollbarWidth: "none" }}
        data-theme="dark"
      >
        {posts.map(post => (
          <div key={post.id} className="shrink-0 w-[280px]" data-testid={`post-${post.id}`}>
            <Tweet id={post.post_id} />
          </div>
        ))}
      </div>

      {/* Right arrow */}
      <button
        onClick={() => scroll("right")}
        className="absolute right-0 top-1/2 -translate-y-1/2 z-10 w-8 h-8 rounded-full bg-background/80 border border-border/60 flex items-center justify-center opacity-0 group-hover/timeline:opacity-100 transition-opacity shadow-lg translate-x-3 hover:bg-background"
      >
        <ChevronRight size={14} />
      </button>
    </div>
  );
}

// ─── Timeline (career) ───

function CareerTimeline({ events }: { events: { year: number; event: string; event_ja: string }[] }) {
  return (
    <div className="relative">
      <div className="absolute left-4 top-0 bottom-0 w-px bg-gradient-to-b from-neon-cyan/60 via-neon-purple/40 to-transparent" />
      <div className="space-y-4">
        {events.map((ev, i) => (
          <div key={i} className="flex gap-4">
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

// ─── Contribution tag ───

function ContributionTag({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-2 p-2.5 rounded-md bg-muted/30 border border-border/50">
      <Star size={11} className="text-neon-gold mt-0.5 shrink-0" />
      <span className="text-xs">{text}</span>
    </div>
  );
}

// ─── Main ───

export default function EntityPage() {
  const { id } = useParams<{ id: string }>();

  const { data: entity, isLoading } = useQuery<Entity>({
    queryKey: ["/api/entities", id],
    queryFn: () => apiRequest("GET", `/api/entities/${id}`).then(r => r.json()),
  });

  const { data: posts = [] } = useQuery<XPost[]>({
    queryKey: ["/api/entities", id, "posts"],
    queryFn: () => apiRequest("GET", `/api/entities/${id}/posts?limit=20`).then(r => r.json()),
    enabled: !!id,
  });

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-44 rounded-2xl bg-card" />
        <Skeleton className="h-64 rounded-xl bg-card" />
        <div className="grid grid-cols-3 gap-3">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-lg bg-card" />)}
        </div>
      </div>
    );
  }

  if (!entity) {
    return (
      <div className="p-6 text-center">
        <p className="text-muted-foreground">エンティティが見つかりません</p>
        <Link href="/"><a className="text-neon-cyan hover:underline text-sm mt-2 inline-block">← HOMEに戻る</a></Link>
      </div>
    );
  }

  const contributions = Array.isArray(entity.key_contributions) ? entity.key_contributions : [];
  const timeline = Array.isArray(entity.timeline) ? entity.timeline : [];

  return (
    <div className="min-h-full grid-bg">
      {/* ── Hero header ── */}
      <div className="relative overflow-hidden px-6 pt-6 pb-6 border-b border-border/50">
        <div className="absolute inset-0 bg-gradient-radial-cyan pointer-events-none" />
        <div className="absolute inset-0 bg-gradient-to-r from-neon-purple/5 via-transparent to-neon-cyan/5 pointer-events-none" />

        <Link href="/">
          <a className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-neon-cyan transition-colors mb-5 relative">
            <ArrowLeft size={12} />
            HOME
          </a>
        </Link>

        <div className="flex items-start gap-5 relative">
          {/* Avatar — larger */}
          <div className="shrink-0">
            <EntityAvatar
              entity={entity}
              className="w-24 h-24 ring-2 ring-neon-cyan/40 ring-offset-2 ring-offset-background shadow-[0_0_30px_rgba(0,212,255,0.2)]"
            />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-2">
              <TypeBadge type={entity.type} />
              {entity.country && (
                <span className="text-[10px] font-mono text-muted-foreground">{entity.country}</span>
              )}
            </div>
            <h1 className="text-2xl font-black leading-tight">
              {entity.name}
              {entity.name_ja && (
                <span className="text-muted-foreground text-sm font-normal ml-2">（{entity.name_ja}）</span>
              )}
            </h1>
            {entity.affiliation && (
              <p className="text-xs text-muted-foreground mt-1">{entity.affiliation}</p>
            )}
            <div className="flex items-center gap-4 mt-3">
              {entity.handle && (
                <a
                  href={`https://x.com/${entity.handle}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-testid="twitter-link"
                  className="flex items-center gap-1.5 text-xs text-neon-cyan hover:opacity-70 transition-opacity"
                >
                  <Twitter size={12} />
                  @{entity.handle}
                  <ExternalLink size={9} />
                </a>
              )}
              {entity.website && (
                <a
                  href={entity.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  <Globe size={11} />
                  Web
                </a>
              )}
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-2 mt-5 relative">
          {[
            { icon: Users, label: "フォロワー", value: entity.followers_count.toLocaleString() },
            { icon: Star, label: "実績", value: contributions.length },
            { icon: Calendar, label: "タイムライン", value: timeline.length },
          ].map(({ icon: Icon, label, value }) => (
            <div key={label} className="glass-panel rounded-lg px-3 py-2.5 text-center">
              <Icon size={12} className="text-muted-foreground mx-auto mb-1" />
              <div className="text-sm font-bold font-mono">{value}</div>
              <div className="text-[10px] text-muted-foreground">{label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── X 投稿タイムライン（最上部・横スクロール） ── */}
      <div className="border-b border-border/40 px-6 py-5 bg-card/20">
        <div className="flex items-center gap-2 mb-4 text-neon-cyan">
          <Twitter size={13} />
          <span className="text-xs font-mono font-bold uppercase tracking-widest">Latest Posts</span>
          {posts.length > 0 && (
            <span className="text-[10px] font-mono text-muted-foreground ml-auto">
              ← 最新 {posts.length}件
            </span>
          )}
        </div>
        <TweetTimeline posts={posts} />
      </div>

      {/* ── コンテンツ ── */}
      <div className="p-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2/3: Bio + Thinking + Contributions + Japan */}
        <div className="lg:col-span-2 space-y-5">
          {entity.bio_ja && (
            <section className="glass-panel rounded-xl p-5">
              <h2 className="text-xs font-mono font-bold uppercase tracking-widest text-neon-cyan mb-3 flex items-center gap-1.5">
                <Lightbulb size={11} />プロフィール
              </h2>
              <p className="text-sm leading-relaxed">{entity.bio_ja}</p>
              {entity.bio && entity.bio !== entity.bio_ja && (
                <p className="text-xs text-muted-foreground mt-2 leading-relaxed">{entity.bio}</p>
              )}
            </section>
          )}

          {entity.thinking_style && (
            <section className="glass-panel rounded-xl p-5">
              <h2 className="text-xs font-mono font-bold uppercase tracking-widest text-neon-magenta mb-3 flex items-center gap-1.5">
                <Target size={11} />思考スタイル
              </h2>
              <p className="text-sm leading-relaxed">{entity.thinking_style}</p>
            </section>
          )}

          {contributions.length > 0 && (
            <section className="glass-panel rounded-xl p-5">
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

          {entity.japan_insight && (
            <section className="glass-panel rounded-xl p-5 border-neon-magenta/20">
              <h2 className="text-xs font-mono font-bold uppercase tracking-widest text-neon-magenta mb-3 flex items-center gap-1.5">
                <Flag size={11} />日本視点からの示唆
              </h2>
              <p className="text-sm leading-relaxed">{entity.japan_insight}</p>
            </section>
          )}
        </div>

        {/* Right: Timeline */}
        <div className="space-y-4">
          {timeline.length > 0 && (
            <section className="glass-panel rounded-xl p-5">
              <h2 className="text-xs font-mono font-bold uppercase tracking-widest text-neon-cyan mb-4 flex items-center gap-1.5">
                <Clock size={11} />タイムライン
              </h2>
              <CareerTimeline events={timeline} />
            </section>
          )}

          <a
            href={`https://x.com/${entity.handle}`}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="view-on-x"
            className="flex items-center justify-center gap-2 w-full p-3 rounded-xl border border-neon-cyan/30 text-neon-cyan hover:bg-neon-cyan/10 transition-colors text-xs font-mono font-bold"
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
