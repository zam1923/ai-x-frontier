import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { XPost, Entity } from "@shared/schema";
import { Skeleton } from "@/components/ui/skeleton";
import { Twitter, ExternalLink, Clock, Zap } from "lucide-react";

// ─── utils ───

function getTimeAgo(dateStr: string): string {
  if (!dateStr) return "";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "たった今";
  if (mins < 60) return `${mins}分前`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}時間前`;
  return `${Math.floor(hrs / 24)}日前`;
}

function handleFromUrl(url: string): string {
  const m = url?.match(/x\.com\/([^/]+)\/status\//);
  return m ? m[1] : "";
}

// ─── PostCard ───

function PostCard({ post }: { post: XPost }) {
  const ago = getTimeAgo(post.posted_at || post.created_at);
  const handle = handleFromUrl(post.url);
  const profileUrl = handle ? `https://x.com/${handle}` : "#";

  return (
    <div className="glass-panel rounded-lg p-4 flex flex-col gap-3 hover:border-neon-cyan/40 transition-all duration-200 hover:shadow-neon-sm">
      {/* header */}
      <div className="flex items-center justify-between">
        <a
          href={profileUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 text-neon-cyan hover:opacity-70 transition-opacity"
        >
          <Twitter size={11} />
          <span className="text-[11px] font-mono font-bold">
            {handle ? `@${handle}` : "—"}
          </span>
        </a>
        <span className="flex items-center gap-1 text-[10px] text-muted-foreground font-mono">
          <Clock size={9} />
          {ago}
        </span>
      </div>

      {/* text */}
      <p className="text-xs leading-relaxed flex-1 line-clamp-6 whitespace-pre-wrap">
        {post.text}
      </p>

      {/* footer */}
      {post.url && (
        <a
          href={post.url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 text-[10px] text-muted-foreground hover:text-neon-cyan transition-colors font-mono mt-auto"
        >
          <ExternalLink size={9} />
          Xで見る
        </a>
      )}
    </div>
  );
}

// ─── EmptyState ───

function EmptyState({ entities }: { entities: Entity[] }) {
  return (
    <div className="col-span-full flex flex-col items-center py-24 gap-5">
      <div className="w-16 h-16 rounded-full bg-neon-cyan/10 flex items-center justify-center">
        <Zap size={28} className="text-neon-cyan" />
      </div>
      <div className="text-center">
        <p className="text-sm font-semibold mb-1">投稿を収集中です</p>
        <p className="text-xs text-muted-foreground">
          {entities.length} アカウントを監視中 — 次回同期で表示されます
        </p>
      </div>
      {entities.length > 0 && (
        <div className="flex flex-wrap gap-2 justify-center max-w-xl mt-1">
          {entities.map((e) => (
            <span key={e.id} className="tag-chip text-[10px] font-mono">
              @{e.handle}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Dashboard ───

export default function Dashboard() {
  const { data: posts, isLoading } = useQuery<XPost[]>({
    queryKey: ["/api/posts"],
    queryFn: () => apiRequest("GET", "/api/posts?limit=200").then((r) => r.json()),
    refetchInterval: 60000,
  });

  const { data: entities } = useQuery<Entity[]>({
    queryKey: ["/api/entities"],
    queryFn: () => apiRequest("GET", "/api/entities").then((r) => r.json()),
    refetchInterval: 300000,
  });

  const now = new Date();
  const weekdays = ["日", "月", "火", "水", "木", "金", "土"];
  const dateStr = `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日（${weekdays[now.getDay()]}）`;

  return (
    <div className="min-h-full grid-bg">
      {/* header */}
      <div className="px-6 pt-5 pb-4 border-b border-border/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-2 h-2 rounded-full bg-neon-cyan live-dot" />
            <h1 className="text-lg font-bold tracking-tight">
              <span className="neon-text-cyan">AI X</span> FRONTIER
            </h1>
            <span className="text-[10px] font-mono text-muted-foreground hidden sm:block">
              {dateStr}
            </span>
          </div>
          <span className="text-[10px] font-mono text-muted-foreground">
            {posts?.length ?? 0} posts
          </span>
        </div>
      </div>

      {/* grid */}
      <div className="p-6">
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {Array.from({ length: 12 }).map((_, i) => (
              <Skeleton key={i} className="h-44 rounded-lg bg-card" />
            ))}
          </div>
        ) : !posts?.length ? (
          <div className="grid grid-cols-1">
            <EmptyState entities={entities || []} />
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {posts.map((post) => (
              <PostCard key={post.id} post={post} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
