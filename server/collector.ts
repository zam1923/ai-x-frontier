/**
 * collector.ts — 監視対象リストとSupabaseユーティリティ
 * Grok Live Search に移行したため、Apify依存を完全削除
 */

import supabase from "./supabase";

// 監視対象アカウント一覧（世界的に著名なAI研究者・企業家・企業のみ）
export const WATCHED_HANDLES = [
  // 研究者
  "karpathy",         // Andrej Karpathy
  "ylecun",           // Yann LeCun
  "goodfellow_ian",   // Ian Goodfellow
  "hardmaru",         // David Ha
  "fchollet",         // François Chollet
  "ilyasut",          // Ilya Sutskever
  "drfeifei",         // Fei-Fei Li
  "pirroh",           // Pieter Abbeel
  "geoffreyhinton",   // Geoffrey Hinton
  "yoshuabengio",     // Yoshua Bengio
  "ch402",            // Chris Olah (解釈可能性研究)
  "nshazeer",         // Noam Shazeer (Transformer共著者)
  // 企業家
  "sama",             // Sam Altman
  "demishassabis",    // Demis Hassabis
  "elonmusk",         // Elon Musk
  "gdb",              // Greg Brockman
  "drjimfan",         // Jim Fan (NVIDIA)
  "darioamodei",      // Dario Amodei (Anthropic CEO)
  "JensenHuang",      // Jensen Huang (NVIDIA CEO)
  "artmsch",          // Arthur Mensch (Mistral AI CEO)
  "alexandr_wang",    // Alexandr Wang (Scale AI CEO)
  "aidangomez",       // Aidan Gomez (Cohere CEO, Transformer共著者)
  // 企業公式
  "AnthropicAI",
  "OpenAI",
  "GoogleDeepMind",
  "xai",
  "MistralAI",
  "MetaAI",
  "NVIDIAAIDev",
  "huggingface",
  "LangChainAI",
  "deepseek_ai",      // DeepSeek
  "NVIDIA",           // NVIDIA
  "runwayml",         // Runway (動画生成AI)
  "perplexity_ai",    // Perplexity
  "elevenlabsio",     // ElevenLabs
  "scale_ai",         // Scale AI
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
 * 収集したポストをSupabaseのx_postsテーブルに保存（重複防止）
 */
export async function savePosts(
  posts: RawPost[],
  entityId: string
): Promise<number> {
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
