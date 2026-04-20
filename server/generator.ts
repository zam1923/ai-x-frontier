/**
 * generator.ts — Grok Agent Tools API で記事・深掘りコンテンツを自動生成するエンジン
 * /v1/responses + tools: x_search を使用（search_parameters は 2026/1 廃止）
 */

import supabase from "./supabase";
import type { InsertArticle } from "@shared/schema";

// Agent Tools API エンドポイント
const GROK_API_URL = "https://api.x.ai/v1/responses";
const GROK_MODEL = process.env.GROK_MODEL || "grok-4-1-fast";

// ─────────────────────────────────────────────
// Live Search で取得したポストの型
// ─────────────────────────────────────────────

export interface LiveSearchPost {
  post_id: string;
  author_handle: string;
  text: string;
  url: string;
  published_at: string;
}

// ─────────────────────────────────────────────
// Grok Agent Tools API 呼び出し（共通）
// ─────────────────────────────────────────────

// レスポンスのテキスト中に JSON が埋め込まれている場合も抽出できるようにする
function extractJSON(text: string): any {
  try {
    return JSON.parse(text);
  } catch {}
  const match = text.match(/\{[\s\S]*\}/);
  if (match) {
    try {
      return JSON.parse(match[0]);
    } catch {}
  }
  return null;
}

async function callGrokWithLiveSearch(
  systemPrompt: string,
  userContent: string,
  xHandles?: string[],
  _maxResults = 15
): Promise<{ content: string; posts: LiveSearchPost[] }> {
  const apiKey = process.env.GROK_API_KEY;
  if (!apiKey) throw new Error("GROK_API_KEY not set");

  // x_search ツール（allowed_x_handles は最大10件）
  const tool: Record<string, any> = { type: "x_search" };
  if (xHandles && xHandles.length > 0) {
    tool.allowed_x_handles = xHandles.slice(0, 10);
  }

  const res = await fetch(GROK_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: GROK_MODEL,
      input: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent },
      ],
      tools: [tool],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Grok API error ${res.status}: ${err}`);
  }

  const data = await res.json();

  // Responses API のテキスト抽出（output_text → output[].content[].text → fallback）
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

  // citations の場所はモデルによって異なる
  const citations: any[] =
    data.citations ?? outputMsg?.citations ?? [];

  console.log(
    `[generator] Grok response: contentLen=${content.length} citations=${citations.length}`
  );

  const posts: LiveSearchPost[] = [];
  for (const c of citations) {
    const url = c.url || "";
    const match = url.match(/x\.com\/([^/]+)\/status\/(\d+)/);
    if (match) {
      posts.push({
        post_id: match[2],
        author_handle: match[1].toLowerCase(),
        text: c.content || c.text || c.snippet || "",
        url,
        published_at: c.published_date || c.date || new Date().toISOString(),
      });
    }
  }

  return { content, posts };
}

// ─────────────────────────────────────────────
// 1. 記事生成（Live Search）
// ─────────────────────────────────────────────

const ARTICLE_LIVE_SEARCH_SYSTEM_PROMPT = `あなたはAI最先端情報のキュレーターです。
指定されたX（旧Twitter）アカウントの最新投稿を検索・分析して、
日本人AI研究者・エンジニア・スタートアップ向けの熱量ある日本語の記事を生成してください。

必ずJSON形式で以下のキーを返してください：
{
  "title": "キャッチーな日本語タイトル（40字以内）",
  "summary": "要点の日本語サマリー（120字程度）",
  "content": "詳細分析（500字程度）。技術的意義・業界への影響・日本視点の示唆を含む",
  "heat_score": 0〜100の数値（話題性・重要度。重要な投稿がなければ15以下に）,
  "tags": ["タグ1", "タグ2", "タグ3"]（最大5個）
}`;

export async function generateArticleWithLiveSearch(
  handles: string[],
  sourceHandle: string
): Promise<{ article: InsertArticle | null; posts: LiveSearchPost[] }> {
  const batchHandles = handles.slice(0, 10); // allowed_x_handles 上限 10

  const userContent =
    batchHandles.length === 0
      ? "最新のAI技術トレンドについてX投稿を検索して記事を生成してください。Claude、GPT、Gemini、LLM、AGI、AI安全性などのキーワードで最新動向を調べてください。"
      : batchHandles.length === 1
      ? `@${batchHandles[0]} の最新AI関連X投稿を検索して記事を生成してください。`
      : `次のAI研究者・企業の最新X投稿を検索して、最も重要なトピックについて記事を生成してください：\n${batchHandles.map((h) => `@${h}`).join("、")}`;

  // エラーは呼び出し元（scheduler）に伝播させて errors[] に記録させる
  const { content, posts } = await callGrokWithLiveSearch(
    ARTICLE_LIVE_SEARCH_SYSTEM_PROMPT,
    userContent,
    batchHandles.length > 0 ? batchHandles : undefined,
    Math.max(15, batchHandles.length * 3)
  );

  const parsed = extractJSON(content);
  if (!parsed) {
    throw new Error(
      `JSON parse failed. content preview: ${content.slice(0, 150)}`
    );
  }
  const heatScore = Math.min(100, Math.max(0, Number(parsed.heat_score) || 50));

  return {
    article: {
      title: parsed.title || "AI最新動向まとめ",
      summary: parsed.summary || "",
      content: parsed.content || "",
      source_handle: sourceHandle,
      source_url: handles.length === 1 ? `https://x.com/${sourceHandle}` : "",
      published_at: new Date().toISOString(),
      heat_score: heatScore,
      tags: Array.isArray(parsed.tags) ? parsed.tags : [],
      entity_ids: [],
    },
    posts,
  };
}

// ─────────────────────────────────────────────
// 2. エンティティ深掘り更新（Live Search）
// ─────────────────────────────────────────────

const ENTITY_UPDATE_SYSTEM_PROMPT = `あなたはAI研究者・企業家・企業の専門アナリストです。
最新のXポストを分析して、人物/企業の深掘りプロフィールを日本語で生成・更新してください。

必ずJSON形式で以下のキーを返してください：
{
  "thinking_style": "思考スタイルの分析（150字程度）。どんな視点・哲学・アプローチを持っているか",
  "japan_insight": "日本視点の示唆（150字程度）。日本のAI業界・政策・教育への示唆",
  "bio_ja": "プロフィール日本語版（200字程度）",
  "new_contributions": ["新しい実績・発言・プロジェクト"]（最大5個）
}`;

export async function updateEntityProfileWithLiveSearch(
  entityId: string,
  entityName: string,
  handle: string
): Promise<{ updated: boolean; posts: LiveSearchPost[] }> {
  const userContent = `対象: ${entityName} (@${handle})\n@${handle} の最新X投稿を検索して、この人物/企業のプロフィールを更新してください。`;

  // エラーは呼び出し元に伝播させる
  const { content, posts } = await callGrokWithLiveSearch(
    ENTITY_UPDATE_SYSTEM_PROMPT,
    userContent,
    [handle],
    15
  );

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
