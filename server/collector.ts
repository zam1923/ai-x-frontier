/**
 * collector.ts — Apify経由でXの投稿を自動収集するエンジン
 * まとめて取得して効率化、エラーハンドリング強化
 */

import { ApifyClient } from "apify-client";
import supabase from "./supabase";

const client = new ApifyClient({ token: process.env.APIFY_API_TOKEN });

// 監視対象アカウント一覧（大幅拡充）
export const WATCHED_HANDLES = [
  // 研究者
  "karpathy",      // Andrej Karpathy
  "ylecun",        // Yann LeCun
  "goodfellow_ian",// Ian Goodfellow
  "hardmaru",      // David Ha
  "fchollet",      // François Chollet
  "ilyasut",       // Ilya Sutskever
  "drfeifei",      // Fei-Fei Li
  "pirroh",        // Pieter Abbeel
  "GoogleDeepMind",
  // 企業家
  "sama",          // Sam Altman
  "demishassabis", // Demis Hassabis
  "elonmusk",      // Elon Musk
  "gdb",           // Greg Brockman
  "drjimfan",      // Jim Fan (NVIDIA)
  // 企業公式
  "AnthropicAI",
  "OpenAI",
  "xai",
  "MistralAI",
  "MetaAI",
  "NVIDIAAIDev",
  "huggingface",
  "LangChainAI",
  // 日本語AI情報
  "hillbig",       // 岡崎直観
  "shota_imai",    // 今井翔太
  "yoheinakajima", // 中島洋
];

// 注目キーワード検索クエリ
export const SEARCH_QUERIES = [
  "AI model release 2026",
  "LLM breakthrough",
  "AGI research latest",
  "new AI paper arxiv",
  "Claude GPT Gemini Grok update",
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
 * Apify tweet-scraper で複数アカウントのツイートを一括取得
 * 1アカウントずつではなく、まとめて取得して効率化
 */
export async function fetchPostsByHandles(
  handles: string[],
  maxPerHandle = 5
): Promise<RawPost[]> {
  if (!process.env.APIFY_API_TOKEN) {
    console.warn("[collector] APIFY_API_TOKEN not set — skipping");
    return [];
  }
  if (handles.length === 0) return [];

  console.log(`[collector] Apify呼び出し: ${handles.join(", ")} (各最大${maxPerHandle}件)`);

  try {
    const run = await client.actor("apidojo/tweet-scraper").call(
      {
        twitterHandles: handles,
        maxItems: handles.length * maxPerHandle,
        sort: "Latest",
        tweetLanguage: "en",
        addUserInfo: true,
      },
      { waitSecs: 120 }
    );

    const { items } = await client.dataset(run.defaultDatasetId).listItems();
    console.log(`[collector] Apify取得: ${items.length}件`);

    return items
      .map((item: any) => {
        const handle =
          item.author?.userName ||
          item.user?.screen_name ||
          item.username ||
          "";
        const tweetId = item.id || item.tweet_id || item.rest_id || String(Math.random());
        const tweetUrl =
          item.url ||
          item.permanentUrl ||
          (handle && tweetId
            ? `https://x.com/${handle}/status/${tweetId}`
            : "");
        return {
          id: tweetId,
          text: item.text || item.full_text || item.rawContent || "",
          author_handle: handle,
          author_name: item.author?.name || item.user?.name || handle,
          created_at:
            item.createdAt || item.created_at || new Date().toISOString(),
          likes: item.likeCount || item.favorite_count || 0,
          retweets: item.retweetCount || item.retweet_count || 0,
          replies: item.replyCount || item.reply_count || 0,
          url: tweetUrl,
        } as RawPost;
      })
      .filter((p: RawPost) => p.text.length > 20);
  } catch (err: any) {
    console.error("[collector] Apify handlesFetch error:", err?.message || err);
    return [];
  }
}

/**
 * Apify でキーワード検索して最新のAI関連ツイートを取得
 */
export async function fetchPostsBySearch(
  queries: string[],
  maxPerQuery = 10
): Promise<RawPost[]> {
  if (!process.env.APIFY_API_TOKEN) {
    console.warn("[collector] APIFY_API_TOKEN not set — skipping");
    return [];
  }

  console.log(`[collector] Apify検索: ${queries.join(" / ")}`);

  try {
    const run = await client.actor("apidojo/tweet-scraper").call(
      {
        searchTerms: queries,
        maxItems: queries.length * maxPerQuery,
        sort: "Latest",
        tweetLanguage: "en",
        minimumFavorites: 20,
      },
      { waitSecs: 120 }
    );

    const { items } = await client.dataset(run.defaultDatasetId).listItems();
    console.log(`[collector] Apify検索取得: ${items.length}件`);

    return items
      .map((item: any) => {
        const handle = item.author?.userName || item.user?.screen_name || "";
        const tweetId = item.id || item.tweet_id || String(Math.random());
        return {
          id: tweetId,
          text: item.text || item.full_text || "",
          author_handle: handle,
          author_name: item.author?.name || handle,
          created_at: item.createdAt || new Date().toISOString(),
          likes: item.likeCount || 0,
          retweets: item.retweetCount || 0,
          replies: item.replyCount || 0,
          url:
            item.url ||
            item.permanentUrl ||
            `https://x.com/${handle}/status/${tweetId}`,
        } as RawPost;
      })
      .filter((p: RawPost) => p.text.length > 30);
  } catch (err: any) {
    console.error("[collector] Apify search error:", err?.message || err);
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
