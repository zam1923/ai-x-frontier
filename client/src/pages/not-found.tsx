import { Link } from "wouter";

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <div className="text-6xl font-mono font-bold neon-text-cyan mb-4">404</div>
        <p className="text-muted-foreground mb-4">ページが見つかりません</p>
        <Link href="/"><a className="text-neon-cyan hover:underline text-sm">← ダッシュボードに戻る</a></Link>
      </div>
    </div>
  );
}
