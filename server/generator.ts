/**
 * generator.ts — Grok Agent Tools API (/v1/responses + x_search)
 * - searchPostsByHandles: X投稿URLを収集（メイン処理）
 * - updateEntityProfileWithLiveSearch: エンティティ深掘り（Grokで生成）
 * - updateTrendTags: タグ集計
 */

import supabase from "./supabase";
import type { InsertArticle } from "@shared/schema";

const GROK_API_URL = "https://api.x.ai/v1/responses";
const GROK_MODEL = process.env.GROK_MODEL || "grok-4-1-fast";

// ─────────────────────────────────────────────
// 型定義
// ─────────────────────────────────────────────

export interface LiveSearchPost {
  post_id: string;
  author_handle: string;
  text: string;
  url: string;
  published_at: string;
}

// ─────────────────────────────────────────────
// 共通ユーティリティ
// ─────────────────────────────────────────────

// <grok:render> タグを除去してから JSON 抽出（タグ内の " が JSON を破壊するため）
function extractJSON(text: string): any {
  const cleaned = text.replace(/<grok:[^>]*>[\s\S]*?<\/grok:[^>]*>/g, "");
  try {
    return JSON.parse(cleaned);
  } catch {}
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (match) {
    try {
      return JSON.parse(match[0]);
    } catch {}
  }
  return null;
}

async function callGrok(
  input: { role: string; content: string }[],
  tool: Record<string, any>
): Promise<{ content: string; citations: any[] }> {
  const apiKey = process.env.GROK_API_KEY;
  if (!apiKey) throw new Error("GROK_API_KEY not set");

  const res = await fetch(GROK_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: GROK_MODEL,
      input,
      tools: [tool],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Grok API error ${res.status}: ${err}`);
  }

  const data = await res.json();

  const outputMsg = data.output?.find(
    (o: any) => o.type === "message" || o.role === "assistant"
  );
  const content: string =
    data.output_text ??
    outputMsg?.content?.find(
      (c: any) => c.type === "output_text" || c.type === "text"
    )?.text ??
    (typeof outputMsg?.content === "string" ? outputMsg.content : "") ??
    data.choices?.[0]?.message?.content ??
    "";

  const citations: any[] =
    data.citations ??
    outputMsg?.citations ??
    [];

  console.log(
    `[generator] Grok response: contentLen=${content.length} citations=${citations.length}`
  );

  return { content, citations };
}

function citationsToLivePosts(citations: any[]): LiveSearchPost[] {
  const posts: LiveSearchPost[] = [];
  for (const c of citations) {
    const url = c.url || "";
    const match = url.match(/x\.com\/([^/]+)\/status\/(\d+)/);
    if (match) {
      posts.push({
        post_id: match[2],
        author_handle: match[1].toLowerCase(),
        text: c.content || c.text || c.snippet || c.title || "",
        url,
        published_at: c.published_date || c.date || new Date().toISOString(),
      });
    }
  }
  return posts;
}

// ─────────────────────────────────────────────
// 1. X投稿収集（メイン — 記事生成なし）
// ─────────────────────────────────────────────

export async function searchPostsByHandles(
  handles: string[]
): Promise<LiveSearchPost[]> {
  const tool: Record<string, any> = { type: "x_search" };
  if (handles.length > 0) {
    tool.allowed_x_handles = handles.slice(0, 10);
  }

  const query =
    handles.length === 0
      ? "最新のAI技術トレンドについてX投稿を検索してください。Claude、GPT、Gemini、LLM、AGIなど。"
      : `${handles.map((h) => `@${h}`).join(" ")} の最新AI関連X投稿を検索してください。`;

  const { citations } = await callGrok(
    [{ role: "user", content: query }],
    tool
  );

  const posts = citationsToLivePosts(citations);
  console.log(
    `[generator] searchPostsByHandles(${handles.slice(0, 3).join(",")}) → ${posts.length}件`
  );
  return posts;
}

// ─────────────────────────────────────────────
// 2. エンティティ深掘り更新（Grok で生成）
// ─────────────────────────────────────────────

const ENTITY_UPDATE_SYSTEM_PROMPT = `あなたはAI研究者・企業家・企業の専門アナリストです。
最新のXポストを分析して、人物/企業の深掘りプロフィールを日本語で生成・更新してください。

必ずJSON形式で以下のキーを返してください：
{
  "thinking_style": "思考スタイルの分析（150字程度）",
  "japan_insight": "日本視点の示唆（150字程度）",
  "bio_ja": "プロフィール日本語版（200字程度）",
  "new_contributions": ["新しい実績・発言・プロジェクト"]（最大5個）
}`;

export async function updateEntityProfileWithLiveSearch(
  entityId: string,
  entityName: string,
  handle: string
): Promise<{ updated: boolean; posts: LiveSearchPost[] }> {
  const { content, citations } = await callGrok(
    [
      { role: "system", content: ENTITY_UPDATE_SYSTEM_PROMPT },
      {
        role: "user",
        content: `対象: ${entityName} (@${handle})\n@${handle} の最新X投稿を検索して、この人物/企業のプロフィールを更新してください。`,
      },
    ],
    { type: "x_search", allowed_x_handles: [handle] }
  );

  const posts = citationsToLivePosts(citations);

  const parsed = extractJSON(content);
  if (!parsed) {
    throw new Error(
      `entity JSON parse failed. content preview: ${content.slice(0, 150)}`
    );
  }

  const { data: existing } = await supabase
    .from("entities")
    .select("key_contributions")
    .eq("id", entityId)
    .single();

  const existingContribs: string[] = existing?.key_contributions
    ? typeof existing.key_contributions === "string"
      ? JSON.parse(existing.key_contributions)
      : existing.key_contributions
    : [];

  const newContribs = Array.isArray(parsed.new_contributions)
    ? parsed.new_contributions
    : [];
  const mergedContribs = Array.from(
    new Set([...newContribs, ...existingContribs])
  ).slice(0, 8);

  const updatePayload: any = { last_synced_at: new Date().toISOString() };
  if (parsed.thinking_style) updatePayload.thinking_style = parsed.thinking_style;
  if (parsed.japan_insight) updatePayload.japan_insight = parsed.japan_insight;
  if (parsed.bio_ja) updatePayload.bio_ja = parsed.bio_ja;
  if (mergedContribs.length > 0)
    updatePayload.key_contributions = JSON.stringify(mergedContribs);

  const { error } = await supabase
    .from("entities")
    .update(updatePayload)
    .eq("id", entityId);

  if (error) throw new Error(`entity update error: ${error.message}`);
  return { updated: true, posts };
}

// ─────────────────────────────────────────────
// 3. トレンドタグ集計
// ─────────────────────────────────────────────

export async function updateTrendTags(
  articles: InsertArticle[]
): Promise<void> {
  const tagCounts = new Map<string, number>();
  const today = new Date().toISOString().split("T")[0];

  for (const article of articles) {
    for (const tag of article.tags) {
      tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
    }
  }

  for (const [tag, count] of tagCounts.entries()) {
    await supabase
      .from("trend_tags")
      .upsert({ tag, count, date: today }, { onConflict: "tag,date" });
  }
}
