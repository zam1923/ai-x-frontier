// storage.ts — Supabase-backed storage (replaces SQLite template)
import supabase from "./supabase";
import type { Article, Entity, XPost, TrendTag, InsertArticle, InsertEntity, InsertXPost, InsertTrendTag } from "@shared/schema";

export interface IStorage {
  // Articles
  getArticles(limit?: number, offset?: number): Promise<Article[]>;
  getArticleById(id: string): Promise<Article | null>;
  createArticle(article: InsertArticle): Promise<Article>;
  // Entities
  getEntities(type?: string): Promise<Entity[]>;
  getEntityById(id: string): Promise<Entity | null>;
  getEntityByHandle(handle: string): Promise<Entity | null>;
  createEntity(entity: InsertEntity): Promise<Entity>;
  updateEntity(id: string, entity: Partial<InsertEntity>): Promise<Entity>;
  // X Posts
  getPostsByEntityId(entityId: string, limit?: number): Promise<XPost[]>;
  createPost(post: InsertXPost): Promise<XPost>;
  // Trend tags
  getTrendTags(date?: string): Promise<TrendTag[]>;
  upsertTrendTag(tag: InsertTrendTag): Promise<TrendTag>;
}

export class SupabaseStorage implements IStorage {
  // Articles
  async getArticles(limit = 20, offset = 0): Promise<Article[]> {
    const { data, error } = await supabase
      .from("articles")
      .select("*")
      .order("published_at", { ascending: false })
      .range(offset, offset + limit - 1);
    if (error) throw error;
    return (data || []).map(this.parseArticle);
  }

  async getArticleById(id: string): Promise<Article | null> {
    const { data, error } = await supabase
      .from("articles")
      .select("*")
      .eq("id", id)
      .single();
    if (error) return null;
    return this.parseArticle(data);
  }

  async createArticle(article: InsertArticle): Promise<Article> {
    const { data, error } = await supabase
      .from("articles")
      .insert({ ...article, tags: JSON.stringify(article.tags), entity_ids: JSON.stringify(article.entity_ids) })
      .select()
      .single();
    if (error) throw error;
    return this.parseArticle(data);
  }

  private parseArticle(row: any): Article {
    return {
      ...row,
      tags: typeof row.tags === "string" ? JSON.parse(row.tags) : row.tags || [],
      entity_ids: typeof row.entity_ids === "string" ? JSON.parse(row.entity_ids) : row.entity_ids || [],
    };
  }

  // Entities
  async getEntities(type?: string): Promise<Entity[]> {
    let query = supabase.from("entities").select("*").order("followers_count", { ascending: false });
    if (type) query = query.eq("type", type);
    const { data, error } = await query;
    if (error) throw error;
    return (data || []).map(this.parseEntity);
  }

  async getEntityById(id: string): Promise<Entity | null> {
    const { data, error } = await supabase
      .from("entities")
      .select("*")
      .eq("id", id)
      .single();
    if (error) return null;
    return this.parseEntity(data);
  }

  async getEntityByHandle(handle: string): Promise<Entity | null> {
    const { data, error } = await supabase
      .from("entities")
      .select("*")
      .eq("handle", handle)
      .single();
    if (error) return null;
    return this.parseEntity(data);
  }

  async createEntity(entity: InsertEntity): Promise<Entity> {
    const { data, error } = await supabase
      .from("entities")
      .insert({
        ...entity,
        key_contributions: JSON.stringify(entity.key_contributions),
        timeline: JSON.stringify(entity.timeline),
      })
      .select()
      .single();
    if (error) throw error;
    return this.parseEntity(data);
  }

  async updateEntity(id: string, entity: Partial<InsertEntity>): Promise<Entity> {
    const update: any = { ...entity };
    if (entity.key_contributions) update.key_contributions = JSON.stringify(entity.key_contributions);
    if (entity.timeline) update.timeline = JSON.stringify(entity.timeline);
    const { data, error } = await supabase
      .from("entities")
      .update(update)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return this.parseEntity(data);
  }

  private parseEntity(row: any): Entity {
    return {
      ...row,
      key_contributions: typeof row.key_contributions === "string" ? JSON.parse(row.key_contributions) : row.key_contributions || [],
      timeline: typeof row.timeline === "string" ? JSON.parse(row.timeline) : row.timeline || [],
    };
  }

  // X Posts
  async getPostsByEntityId(entityId: string, limit = 20): Promise<XPost[]> {
    const { data, error } = await supabase
      .from("x_posts")
      .select("*")
      .eq("entity_id", entityId)
      .order("posted_at", { ascending: false })
      .limit(limit);
    if (error) throw error;
    return data || [];
  }

  async createPost(post: InsertXPost): Promise<XPost> {
    const { data, error } = await supabase
      .from("x_posts")
      .insert(post)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  // Trend Tags
  async getTrendTags(date?: string): Promise<TrendTag[]> {
    let query = supabase.from("trend_tags").select("*").order("count", { ascending: false });
    if (date) query = query.eq("date", date);
    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  }

  async upsertTrendTag(tag: InsertTrendTag): Promise<TrendTag> {
    const { data, error } = await supabase
      .from("trend_tags")
      .upsert(tag, { onConflict: "tag,date" })
      .select()
      .single();
    if (error) throw error;
    return data;
  }
}

export const storage = new SupabaseStorage();
