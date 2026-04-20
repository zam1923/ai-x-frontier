import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { Entity } from "@shared/schema";
import {
  LayoutDashboard, FlaskConical, Briefcase, Building2,
  ChevronRight, ChevronLeft, Zap, Users, Globe,
  TrendingUp, Activity, Settings
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/", icon: LayoutDashboard, label: "ダッシュボード" },
  { href: "/admin", icon: Settings, label: "管理パネル" },
];

const ENTITY_SECTIONS = [
  { type: "researcher", icon: FlaskConical, label: "研究者", color: "text-neon-cyan" },
  { type: "entrepreneur", icon: Briefcase, label: "企業家", color: "text-neon-magenta" },
  { type: "company", icon: Building2, label: "企業", color: "text-neon-gold" },
] as const;

// Logo SVG
function LogoMark({ collapsed }: { collapsed: boolean }) {
  return (
    <div className={cn("flex items-center gap-2 px-3 py-4 border-b border-border/50", collapsed && "justify-center px-2")}>
      <svg
        width="32" height="32" viewBox="0 0 32 32" fill="none"
        aria-label="AI X Frontier Logo"
        xmlns="http://www.w3.org/2000/svg"
        className="shrink-0"
      >
        {/* Outer ring */}
        <circle cx="16" cy="16" r="15" stroke="#00D4FF" strokeWidth="1" opacity="0.4" />
        {/* Inner hex shape */}
        <path d="M16 4 L26 10 L26 22 L16 28 L6 22 L6 10 Z" stroke="#00D4FF" strokeWidth="1.5" fill="rgba(0,212,255,0.06)" />
        {/* X mark */}
        <line x1="10" y1="10" x2="22" y2="22" stroke="#FF3CAC" strokeWidth="2" strokeLinecap="round" />
        <line x1="22" y1="10" x2="10" y2="22" stroke="#FF3CAC" strokeWidth="2" strokeLinecap="round" />
        {/* Center dot */}
        <circle cx="16" cy="16" r="2.5" fill="#00D4FF" />
        {/* AI text arcs — decorative tick marks */}
        <line x1="16" y1="1" x2="16" y2="4" stroke="#784BA0" strokeWidth="1.5" strokeLinecap="round" />
        <line x1="31" y1="16" x2="28" y2="16" stroke="#784BA0" strokeWidth="1.5" strokeLinecap="round" />
        <line x1="1" y1="16" x2="4" y2="16" stroke="#784BA0" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
      {!collapsed && (
        <div>
          <div className="font-bold text-sm leading-none tracking-wide">
            <span className="neon-text-cyan">AI X</span>
            <span className="text-foreground"> Frontier</span>
          </div>
          <div className="text-[10px] text-muted-foreground font-mono mt-0.5 tracking-widest uppercase">
            X最先端情報
          </div>
        </div>
      )}
    </div>
  );
}

// Live indicator
function LiveBadge() {
  return (
    <div className="flex items-center gap-1.5 px-3 py-1.5">
      <div className="w-1.5 h-1.5 rounded-full bg-neon-cyan live-dot" />
      <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">Live</span>
    </div>
  );
}

export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const [location] = useLocation();

  const { data: entities } = useQuery<Entity[]>({
    queryKey: ["/api/entities"],
    queryFn: () => apiRequest("GET", "/api/entities").then(r => r.json()),
  });

  const researchers = entities?.filter(e => e.type === "researcher") || [];
  const entrepreneurs = entities?.filter(e => e.type === "entrepreneur") || [];
  const companies = entities?.filter(e => e.type === "company") || [];

  const entityGroups = [
    { ...ENTITY_SECTIONS[0], items: researchers },
    { ...ENTITY_SECTIONS[1], items: entrepreneurs },
    { ...ENTITY_SECTIONS[2], items: companies },
  ];

  return (
    <aside
      data-testid="sidebar"
      className={cn(
        "flex flex-col h-screen shrink-0 border-r border-border/50 bg-card/50 backdrop-blur-sm transition-all duration-300 overflow-y-auto overscroll-contain",
        collapsed ? "w-14" : "w-60"
      )}
    >
      <LogoMark collapsed={collapsed} />

      {/* Live badge */}
      {!collapsed && <LiveBadge />}

      {/* Main nav */}
      <nav className="flex-1 px-2 py-2 space-y-0.5">
        {NAV_ITEMS.map(item => (
          <Link key={item.href} href={item.href}>
            <a
              data-testid={`nav-${item.href}`}
              className={cn(
                "sidebar-nav-item flex items-center gap-2.5 px-2.5 py-2 rounded-md text-sm font-medium cursor-pointer",
                location === item.href
                  ? "bg-accent text-accent-foreground neon-text-cyan"
                  : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                collapsed && "justify-center px-2"
              )}
            >
              <item.icon size={16} className="shrink-0" />
              {!collapsed && <span>{item.label}</span>}
            </a>
          </Link>
        ))}

        {/* Entity sections */}
        {entityGroups.map(group => (
          <div key={group.type} className="pt-3">
            {!collapsed && (
              <div className={cn("flex items-center gap-1.5 px-2.5 pb-1.5", group.color)}>
                <group.icon size={11} />
                <span className="text-[10px] font-mono font-bold uppercase tracking-widest opacity-80">{group.label}</span>
              </div>
            )}
            {group.items.map(entity => (
              <Link key={entity.id} href={`/entity/${entity.id}`}>
                <a
                  data-testid={`entity-link-${entity.id}`}
                  className={cn(
                    "sidebar-nav-item flex items-center gap-2 px-2.5 py-1.5 rounded-md text-sm cursor-pointer",
                    location === `/entity/${entity.id}`
                      ? "bg-accent text-accent-foreground"
                      : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                    collapsed && "justify-center px-2"
                  )}
                >
                  {entity.avatar_url ? (
                    <img
                      src={entity.avatar_url}
                      alt={entity.name}
                      className="w-5 h-5 rounded-full object-cover shrink-0 ring-1 ring-border"
                      onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                  ) : (
                    <div className="w-5 h-5 rounded-full bg-muted flex items-center justify-center shrink-0">
                      <span className="text-[8px] font-bold">{entity.name[0]}</span>
                    </div>
                  )}
                  {!collapsed && (
                    <span className="truncate text-xs">{entity.name}</span>
                  )}
                </a>
              </Link>
            ))}
          </div>
        ))}
      </nav>

      {/* Collapse button */}
      <div className="border-t border-border/50 p-2">
        <button
          data-testid="sidebar-toggle"
          onClick={() => setCollapsed(v => !v)}
          className={cn(
            "w-full flex items-center gap-2 px-2.5 py-2 rounded-md text-xs text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors",
            collapsed && "justify-center"
          )}
        >
          {collapsed ? <ChevronRight size={14} /> : <><ChevronLeft size={14} /><span>折りたたむ</span></>}
        </button>
      </div>
    </aside>
  );
}
