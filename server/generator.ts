/**
 * generator.ts — Grok APIで記事・深掘りコンテンツを自動生成するエンジン
 */

import type { RawPost } from "./collector";
import supabase from "./supabase";
import type { InsertArticle, InsertEntity } from "@shared/schema";

const GROK_API_URL = "https://api.x.ai/v1/chat/completions";
const GROK_MODEL = "grok-3-latest";

async function callGrok(systemPrompt: string, userContent: string): Promise<string> {
  const apiKey = process.env.GROK_API_KEY;
  if (!apiKey) throw new Error("GROK_API_KEY not set");

  const res = await fetch(GROK_API_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: GROK_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent },
      ],
      temperature: 0.75,
      max_tokens: 1200,
      response_format: { type: "json_object" },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Grok API error ${res.status}: ${err}`);
  }

  const data = await res.json();
  return data.choices[0].message.content;
}

// ─────────────────────────────────────────────
// 1. 記事生成
// ─────────────────────────────────────────────

const ARTICLE_SYSTEM_PROMPT = `あなたはAI最先端情報のキュレーターです。
Xのポストを分析して、日本人AI研究者・エンジニア・スタートアップ向けの
熱量ある日本語の記事を生成してください。

必ずJSON形式で以下のキーを返してください：
{
  "title": "キャッチーな日本語タイトル（40字以内）",
  "summary": "要点の日本語サマリー（120字程度）",
  "content": "詳細分析（500字程度）。技術的意義・業界への影響・日本視点の示唆を含む",
  "heat_score": 0〜100の数値（話題性・重要度。バズり具合+技術的重要度で判断）,
  "tags": ["タグ1", "タグ2", "タグ3"]（最大5個）
}`;

export async function generateArticle(
  posts: RawPost[],
  sourceHandle: string
): Promise<InsertArticle | null> {
  if (posts.length === 0) return null;

  const postsText = posts
    .slice(0, 5)
    .map((p) => `@${p.author_handle}: ${p.text} [❤${p.likes} 🔁${p.retweets}]`)
    .join("\n\n");

  try {
    const raw = await callGrok(
      ARTICLE_SYSTEM_PROMPT,
      `以下のXポストから記事を生成してください：\n\n${postsText}`
    );

    const parsed = JSON.parse(raw);

    return {
      title: parsed.title || "AI最新動向まとめ",
      summary: parsed.summary || "",
      content: parsed.content || "",
      source_handle: sourceHandle,
      source_url: `https://x.com/${sourceHandle}`,
      published_at: new Date().toISOString(),
      heat_score: Math.min(100, Math.max(0, Number(parsed.heat_score) || 50)),
      tags: Array.isArray(parsed.tags) ? parsed.tags : [],
      entity_ids: [],
    };
  } catch (err) {
    console.error("[generator] article generation error:", err);
    return null;
  }
}

// ─────────────────────────────────────────────
// 2. エンティティ深掘り更新
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

export async function updateEntityProfile(
  entityId: string,
  entityName: string,
  handle: string,
  posts: RawPost[]
): Promise<boolean> {
  if (posts.length === 0) return false;

  const postsText = posts
    .slice(0, 8)
    .map((p) => `${p.text} [❤${p.likes}]`)
    .join("\n\n");

  try {
    const raw = await callGrok(
      ENTITY_UPDATE_SYSTEM_PROMPT,
      `対象: ${entityName} (@${handle})\n\n最新ポスト:\n${postsText}`
    );

    const parsed = JSON.parse(raw);

    // 既存の key_contributions を取得して新しいものをマージ
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

    const updatePayload: any = {
      last_synced_at: new Date().toISOString(),
    };
    if (parsed.thinking_style) updatePayload.thinking_style = parsed.thinking_style;
    if (parsed.japan_insight) updatePayload.japan_insight = parsed.japan_insight;
    if (parsed.bio_ja) updatePayload.bio_ja = parsed.bio_ja;
    if (mergedContribs.length > 0) {
      updatePayload.key_contributions = JSON.stringify(mergedContribs);
    }

    const { error } = await supabase
      .from("entities")
      .update(updatePayload)
      .eq("id", entityId);

    if (error) {
      console.error("[generator] entity update error:", error);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[generator] entity profile error:", err);
    return false;
  }
}

// ─────────────────────────────────────────────
// 3. トレンドタグ集計
// ─────────────────────────────────────────────

export async function updateTrendTags(articles: InsertArticle[]): Promise<void> {
  const tagCounts = new Map<string, number>();
  const today = new Date().toISOString().split("T")[0];

  for (const article of articles) {
    for (const tag of article.tags) {
      tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
    }
  }

  for (const [tag, count] of tagCounts.entries()) {
    await supabase.from("trend_tags").upsert(
      { tag, count, date: today },
      { onConflict: "tag,date" }
    );
  }
}
