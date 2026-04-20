// AI X Frontier — shared schema (TypeScript types for Supabase)
// No Drizzle ORM — using Supabase directly

export type EntityType = "researcher" | "entrepreneur" | "company";

export interface Article {
  id: string;
  title: string;
  summary: string;
  content: string;
  source_handle: string; // X @handle
  source_url: string;
  published_at: string;
  heat_score: number; // 0-100 trending score
  tags: string[]; // JSON array stored as text, parsed in app
  entity_ids: string[]; // related entity IDs
  created_at: string;
}

export interface Entity {
  id: string;
  type: EntityType;
  name: string;
  name_ja: string;
  handle: string; // X @handle
  avatar_url: string;
  bio: string;
  bio_ja: string;
  affiliation: string;
  country: string;
  website: string;
  followers_count: number;
  // Analysis fields (AI-generated)
  thinking_style: string;
  key_contributions: string[]; // JSON
  japan_insight: string;
  // Timeline events (JSON)
  timeline: TimelineEvent[];
  last_synced_at: string;
  created_at: string;
}

export interface TimelineEvent {
  year: number;
  event: string;
  event_ja: string;
}

export interface XPost {
  id: string;
  entity_id: string;
  post_id: string; // X post ID
  text: string;
  posted_at: string;
  likes: number;
  retweets: number;
  replies: number;
  url: string;
  created_at: string;
}

export interface TrendTag {
  id: string;
  tag: string;
  count: number;
  date: string; // YYYY-MM-DD
  created_at: string;
}

// Insert types (omit auto-generated fields)
export type InsertArticle = Omit<Article, "id" | "created_at">;
export type InsertEntity = Omit<Entity, "id" | "created_at">;
export type InsertXPost = Omit<XPost, "id" | "created_at">;
export type InsertTrendTag = Omit<TrendTag, "id" | "created_at">;
