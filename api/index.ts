/**
 * api/index.ts — Vercel Serverless Function (Express アダプター)
 * Vercelの関数エントリポイント形式: Request/Response handler
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";

// 遅延インポートでExpressアプリを初期化
let appPromise: Promise<any> | null = null;

function getApp() {
  if (!appPromise) {
    appPromise = import("../server/app").then(m => m.default || m.app);
  }
  return appPromise;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const app = await getApp();
  return app(req, res);
}
