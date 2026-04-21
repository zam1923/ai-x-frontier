import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { XPost, Entity } from "@shared/schema";
import { Skeleton } from "@/components/ui/skeleton";
import { Zap } from "lucide-react";
import { Tweet } from "react-tweet";

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
      <div className="p-6" data-theme="dark">
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {Array.from({ length: 12 }).map((_, i) => (
              <Skeleton key={i} className="h-64 rounded-lg bg-card" />
            ))}
          </div>
        ) : !posts?.length ? (
          <div className="grid grid-cols-1">
            <EmptyState entities={entities || []} />
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {posts.map((post) => (
              <div key={post.id} className="flex justify-center">
                <Tweet id={post.post_id} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
