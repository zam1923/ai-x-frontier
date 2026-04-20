import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useParams } from "wouter";
import type { Article } from "@shared/schema";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, ExternalLink, Flame, Clock, Tag, Twitter } from "lucide-react";
import { Link } from "wouter";
import { cn } from "@/lib/utils";

function HeatBar({ score }: { score: number }) {
  const pct = Math.min(100, score);
  const label = score >= 90 ? "超HOT" : score >= 70 ? "HOT" : score >= 50 ? "注目" : "通常";
  const color = score >= 90 ? "text-neon-magenta" : score >= 70 ? "text-neon-cyan" : "text-muted-foreground";
  return (
    <div className="flex items-center gap-2">
      <Flame size={12} className={color} />
      <div className="w-24 h-2 bg-muted rounded-full overflow-hidden">
        <div className="heat-bar h-full rounded-full" style={{ width: `${pct}%` }} />
      </div>
      <span className={cn("text-xs font-mono font-bold", color)}>{score} · {label}</span>
    </div>
  );
}

export default function ArticlePage() {
  const { id } = useParams<{ id: string }>();

  const { data: article, isLoading } = useQuery<Article>({
    queryKey: ["/api/articles", id],
    queryFn: () => apiRequest("GET", `/api/articles/${id}`).then(r => r.json()),
  });

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-48 rounded bg-card" />
        <Skeleton className="h-32 rounded-lg bg-card" />
        <Skeleton className="h-64 rounded-lg bg-card" />
      </div>
    );
  }

  if (!article) {
    return (
      <div className="p-6 text-center">
        <p className="text-muted-foreground">記事が見つかりません</p>
        <Link href="/"><a className="text-neon-cyan hover:underline text-sm mt-2 inline-block">← ダッシュボードに戻る</a></Link>
      </div>
    );
  }

  const tags: string[] = Array.isArray(article.tags) ? article.tags : [];
  const timeAgo = (() => {
    const diff = Date.now() - new Date(article.published_at).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}分前`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}時間前`;
    return `${Math.floor(hrs / 24)}日前`;
  })();

  return (
    <div className="min-h-full grid-bg">
      {/* Header */}
      <div className="relative px-6 pt-6 pb-5 border-b border-border/50">
        <div className="absolute inset-0 bg-gradient-radial-cyan pointer-events-none" />
        <Link href="/">
          <a className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-neon-cyan transition-colors mb-4">
            <ArrowLeft size={12} />
            ダッシュボードに戻る
          </a>
        </Link>
        <div className="max-w-2xl relative">
          <div className="flex items-center gap-2 mb-3">
            <HeatBar score={article.heat_score} />
            <span className="text-[10px] font-mono text-muted-foreground">·</span>
            <div className="flex items-center gap-1 text-[10px] text-muted-foreground font-mono">
              <Clock size={9} />
              {timeAgo}
            </div>
          </div>
          <h1 className="text-lg font-bold leading-snug mb-2">{article.title}</h1>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            {article.source_handle && (
              <a
                href={article.source_url || `https://x.com/${article.source_handle}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 hover:text-neon-cyan transition-colors"
              >
                <Twitter size={10} />
                @{article.source_handle}
                <ExternalLink size={8} />
              </a>
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="p-6 max-w-2xl space-y-5">
        {/* Summary */}
        <div className="glass-panel rounded-lg p-5 border-neon-cyan/20">
          <h2 className="text-[10px] font-mono font-bold uppercase tracking-widest text-neon-cyan mb-2">サマリー</h2>
          <p className="text-sm leading-relaxed font-medium">{article.summary}</p>
        </div>

        {/* Full content */}
        {article.content && article.content !== article.summary && (
          <div className="glass-panel rounded-lg p-5">
            <h2 className="text-[10px] font-mono font-bold uppercase tracking-widest text-muted-foreground mb-3">詳細分析</h2>
            <div className="text-sm leading-relaxed space-y-3">
              {article.content.split('\n').map((para, i) => (
                para.trim() && <p key={i}>{para}</p>
              ))}
            </div>
          </div>
        )}

        {/* Tags */}
        {tags.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            <Tag size={11} className="text-muted-foreground" />
            {tags.map(tag => (
              <span key={tag} className="tag-chip">{tag}</span>
            ))}
          </div>
        )}

        {/* Source link */}
        {article.source_url && (
          <a
            href={article.source_url}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="source-link"
            className="flex items-center justify-center gap-2 w-full p-3 rounded-lg border border-neon-cyan/30 text-neon-cyan hover:bg-neon-cyan/10 transition-colors text-xs font-mono font-bold"
          >
            <Twitter size={12} />
            Xで元ポストを確認する
            <ExternalLink size={10} />
          </a>
        )}
      </div>
    </div>
  );
}
