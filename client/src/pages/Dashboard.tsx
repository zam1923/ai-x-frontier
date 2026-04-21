/**
 * Dashboard → HOME
 * 人・企業カードのグリッド表示。各カードからエンティティページへ。
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import type { Entity } from "@shared/schema";
import { Skeleton } from "@/components/ui/skeleton";
import { FlaskConical, Briefcase, Building2, ChevronRight, Twitter } from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Avatar ───

function EntityAvatar({
  entity,
  className,
}: {
  entity: Entity;
  className?: string;
}) {
  const [err, setErr] = useState(false);
  const src =
    entity.avatar_url ||
    `https://unavatar.io/twitter/${entity.handle}`;

  if (err) {
    return (
      <div
        className={cn(
          "rounded-full bg-gradient-to-br from-neon-cyan/30 via-neon-purple/20 to-neon-magenta/30 flex items-center justify-center font-bold shrink-0 border border-white/10",
          className
        )}
      >
        {entity.name[0]}
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={entity.name}
      className={cn("rounded-full object-cover shrink-0", className)}
      onError={() => setErr(true)}
    />
  );
}

// ─── Entity Card ───

const TYPE_CFG = {
  researcher: {
    icon: FlaskConical,
    label: "研究者",
    ring: "ring-neon-cyan/30 hover:ring-neon-cyan/70",
    accent: "text-neon-cyan",
    glow: "hover:shadow-[0_0_24px_rgba(0,212,255,0.15)]",
  },
  entrepreneur: {
    icon: Briefcase,
    label: "企業家",
    ring: "ring-neon-magenta/30 hover:ring-neon-magenta/70",
    accent: "text-neon-magenta",
    glow: "hover:shadow-[0_0_24px_rgba(255,60,172,0.15)]",
  },
  company: {
    icon: Building2,
    label: "企業",
    ring: "ring-yellow-500/30 hover:ring-yellow-400/70",
    accent: "text-neon-gold",
    glow: "hover:shadow-[0_0_24px_rgba(255,215,0,0.12)]",
  },
} as const;

function EntityCard({ entity }: { entity: Entity }) {
  const cfg = TYPE_CFG[entity.type as keyof typeof TYPE_CFG] ?? TYPE_CFG.researcher;

  return (
    <Link href={`/entity/${entity.id}`}>
      <a
        className={cn(
          "group relative flex flex-col items-center text-center gap-3 p-5 rounded-2xl cursor-pointer",
          "bg-card/60 border border-border/40 backdrop-blur-sm",
          "ring-2 transition-all duration-300",
          cfg.ring,
          cfg.glow
        )}
      >
        {/* Avatar */}
        <div className="relative">
          <EntityAvatar
            entity={entity}
            className="w-20 h-20 text-2xl ring-2 ring-offset-2 ring-offset-background ring-white/10 group-hover:scale-105 transition-transform duration-300"
          />
          {/* Type indicator dot */}
          <div className={cn("absolute bottom-0.5 right-0.5 w-4 h-4 rounded-full bg-background border-2 border-background flex items-center justify-center")}>
            <cfg.icon size={8} className={cfg.accent} />
          </div>
        </div>

        {/* Name */}
        <div className="space-y-0.5">
          <div className="font-bold text-sm leading-tight group-hover:text-white transition-colors">
            {entity.name}
          </div>
          {entity.name_ja && (
            <div className="text-[10px] text-muted-foreground">{entity.name_ja}</div>
          )}
          <a
            href={`https://x.com/${entity.handle}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={e => e.stopPropagation()}
            className={cn("inline-flex items-center gap-0.5 text-[10px] font-mono mt-1", cfg.accent)}
          >
            <Twitter size={8} />
            @{entity.handle}
          </a>
        </div>

        {/* Bio snippet */}
        {entity.bio_ja && (
          <p className="text-[10px] text-muted-foreground line-clamp-3 leading-relaxed flex-1">
            {entity.bio_ja}
          </p>
        )}

        {/* CTA */}
        <div className={cn("flex items-center gap-0.5 text-[10px] font-mono mt-auto opacity-0 group-hover:opacity-100 transition-opacity", cfg.accent)}>
          詳細 <ChevronRight size={9} />
        </div>
      </a>
    </Link>
  );
}

// ─── Section ───

const SECTIONS = [
  { type: "researcher", ...TYPE_CFG.researcher },
  { type: "entrepreneur", ...TYPE_CFG.entrepreneur },
  { type: "company", ...TYPE_CFG.company },
] as const;

// ─── Dashboard (HOME) ───

export default function Dashboard() {
  const { data: entities, isLoading } = useQuery<Entity[]>({
    queryKey: ["/api/entities"],
    queryFn: () => apiRequest("GET", "/api/entities").then(r => r.json()),
    refetchInterval: 300000,
  });

  const now = new Date();
  const weekdays = ["日", "月", "火", "水", "木", "金", "土"];
  const dateStr = `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日（${weekdays[now.getDay()]}）`;

  return (
    <div className="min-h-full grid-bg">
      {/* Hero header */}
      <div className="relative overflow-hidden px-6 pt-8 pb-6 border-b border-border/50">
        <div className="absolute inset-0 bg-gradient-radial-cyan pointer-events-none opacity-50" />
        <div className="absolute inset-0 bg-gradient-to-b from-neon-purple/5 to-transparent pointer-events-none" />
        <div className="relative">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-2 h-2 rounded-full bg-neon-cyan live-dot" />
            <span className="text-[10px] font-mono text-neon-cyan uppercase tracking-widest">Live</span>
          </div>
          <h1 className="text-3xl font-black tracking-tight mb-1">
            <span className="neon-text-cyan">AI X</span>{" "}
            <span className="text-foreground">FRONTIER</span>
          </h1>
          <p className="text-xs text-muted-foreground font-mono">
            世界のAI研究者・起業家・企業 {entities?.length ?? "—"} 名のXを追跡
          </p>
          <span className="absolute top-0 right-0 text-[10px] font-mono text-muted-foreground/60">{dateStr}</span>
        </div>
      </div>

      {/* Sections */}
      <div className="p-6 space-y-12">
        {isLoading ? (
          [0, 1, 2].map(s => (
            <div key={s} className="space-y-4">
              <Skeleton className="h-4 w-28 bg-card rounded" />
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-56 rounded-2xl bg-card" />
                ))}
              </div>
            </div>
          ))
        ) : (
          SECTIONS.map(({ type, label, icon: Icon, accent }) => {
            const items = entities?.filter(e => e.type === type) ?? [];
            if (!items.length) return null;
            return (
              <section key={type}>
                <div className={cn("flex items-center gap-2 mb-5", accent)}>
                  <Icon size={14} />
                  <h2 className="text-xs font-bold font-mono uppercase tracking-widest">{label}</h2>
                  <div className="flex-1 h-px bg-current opacity-20" />
                  <span className="text-[10px] font-mono opacity-50">{items.length}</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                  {items.map(entity => (
                    <EntityCard key={entity.id} entity={entity} />
                  ))}
                </div>
              </section>
            );
          })
        )}
      </div>
    </div>
  );
}
