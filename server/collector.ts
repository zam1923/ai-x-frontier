/**
 * collector.ts — Apify経由でXの投稿を自動収集するエンジン
 * 監視対象アカウントを定期的にスキャンし、新着ポストをSupabaseに保存する
 */

import { ApifyClient } from "apify-client";
import supabase from "./supabase";

const client = new ApifyClient({ token: process.env.APIFY_API_TOKEN });

// 監視対象アカウント一覧
export const WATCHED_HANDLES = [
  // 研究者
  "karpathy", "ylecun", "goodfellow_ian", "hardmaru",
  // 企業家
  "sama", "demishassabis",
  // 企業公式
  "AnthropicAI", "OpenAI", "GoogleDeepMind", "xai", "MistralAI",
  // 日本語AI情報
  "hillbig", "shota_imai",
];

// 注目キーワード検索クエリ
export const SEARCH_QUERIES = [
  "LLM breakthrough",
  "AI model release",
  "AGI research",
  "new AI paper",
  "GPT Claude Gemini Grok",
];

export interface RawPost {
  id: string;
  text: string;
  author_handle: string;
  author_name: string;
  created_at: string;
  likes: number;
  retweets: number;
  replies: number;
  url: string;
}

/**
 * Apify twitter-scraper で特定アカウントの最新ツイートを取得
 */
export async function fetchPostsByHandles(
  handles: string[],
  maxPerHandle = 10
): Promise<RawPost[]> {
  if (!process.env.APIFY_API_TOKEN) {
    console.warn("[collector] APIFY_API_TOKEN not set — skipping");
    return [];
  }

  try {
    const run = await client.actor("apidojo/tweet-scraper").call({
      twitterHandles: handles,
      maxItems: handles.length * maxPerHandle,
      sort: "Latest",
      tweetLanguage: "en",
    });

    const { items } = await client.dataset(run.defaultDatasetId).listItems();

    return items.map((item: any) => ({
      id: item.id || item.tweet_id || String(Math.random()),
      text: item.text || item.full_text || "",
      author_handle: item.author?.userName || item.user?.screen_name || "",
      author_name: item.author?.name || item.user?.name || "",
      created_at: item.createdAt || item.created_at || new Date().toISOString(),
      likes: item.likeCount || item.favorite_count || 0,
      retweets: item.retweetCount || item.retweet_count || 0,
      replies: item.replyCount || item.reply_count || 0,
      url: item.url || `https://x.com/${item.author?.userName}/status/${item.id}`,
    })).filter((p: RawPost) => p.text.length > 20);
  } catch (err) {
    console.error("[collector] Apify error:", err);
    return [];
  }
}

/**
 * Apify でキーワード検索して最新のAI関連ツイートを取得
 */
export async function fetchPostsBySearch(
  queries: string[],
  maxPerQuery = 20
): Promise<RawPost[]> {
  if (!process.env.APIFY_API_TOKEN) {
    console.warn("[collector] APIFY_API_TOKEN not set — skipping");
    return [];
  }

  try {
    const run = await client.actor("apidojo/tweet-scraper").call({
      searchTerms: queries,
      maxItems: queries.length * maxPerQuery,
      sort: "Latest",
      tweetLanguage: "en",
      onlyVerifiedUsers: false,
      minimumFavorites: 10,
    });

    const { items } = await client.dataset(run.defaultDatasetId).listItems();

    return items.map((item: any) => ({
      id: item.id || String(Math.random()),
      text: item.text || item.full_text || "",
      author_handle: item.author?.userName || "",
      author_name: item.author?.name || "",
      created_at: item.createdAt || new Date().toISOString(),
      likes: item.likeCount || 0,
      retweets: item.retweetCount || 0,
      replies: item.replyCount || 0,
      url: item.url || "",
    })).filter((p: RawPost) => p.text.length > 30);
  } catch (err) {
    console.error("[collector] search error:", err);
    return [];
  }
}

/**
 * 収集したポストをSupabaseのx_postsテーブルに保存
 * 既存のpost_idはスキップ（重複防止）
 */
export async function savePosts(posts: RawPost[], entityId: string): Promise<number> {
  if (posts.length === 0) return 0;

  let saved = 0;
  for (const post of posts) {
    const { error } = await supabase.from("x_posts").upsert(
      {
        entity_id: entityId,
        post_id: post.id,
        text: post.text,
        posted_at: post.created_at,
        likes: post.likes,
        retweets: post.retweets,
        replies: post.replies,
        url: post.url,
      },
      { onConflict: "post_id" }
    );
    if (!error) saved++;
  }
  return saved;
}

/**
 * 全監視アカウントのエンティティIDをSupabaseから取得
 */
export async function getEntityMap(): Promise<Map<string, string>> {
  const { data } = await supabase.from("entities").select("id, handle");
  const map = new Map<string, string>();
  for (const e of data || []) {
    map.set(e.handle.toLowerCase(), e.id);
  }
  return map;
}
