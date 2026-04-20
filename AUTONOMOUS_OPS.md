# AI X Frontier — 完全自律運用設計書

## 概要

このドキュメントは、「AI X Frontier」を**完全無人・自律運用**するための設計書です。
n8n（またはMake/Zapier）を使って、Xからの情報収集→AI記事化→深掘りページ更新→Supabaseへの自動保存まで、
すべてをゼロタッチで動かします。

---

## アーキテクチャ全体図

```
X（Twitter）
  └─ Apify Actor (X Scraper)
       └─ n8n Workflow
            ├─ Grok API（記事生成・深掘り分析）
            ├─ Supabase（データ永続化）
            └─ Vercel / Perplexity Computer（フロント自動反映）
```

---

## 自律化コンポーネント

### 1. X投稿収集（Apify）

**使用Actor**: `apify/twitter-scraper`

```json
{
  "searchTerms": ["#AI", "#LLM", "#AGI", "#MachineLearning"],
  "twitterHandles": [
    "karpathy", "ylecun", "sama", "AnthropicAI",
    "xai", "OpenAI", "GoogleDeepMind", "mistralai"
  ],
  "maxItems": 100,
  "onlyVerifiedUsers": true,
  "since": "{{$now.minus(1, 'hours').toISO()}}"
}
```

**スケジュール**: 毎時0分、8分後に実行

**コスト**: Apify無料枠で月5ドル程度

---

### 2. AI処理パイプライン（Grok API）

#### 2a. 記事生成プロンプト

```
あなたはAI最先端情報キュレーターです。
以下のXポストから、日本語の熱量ある記事を生成してください。

入力ポスト:
{{posts_json}}

出力形式（JSON）:
{
  "title": "キャッチーな日本語タイトル（30字以内）",
  "summary": "要点の日本語サマリー（100字程度）",
  "content": "詳細分析（400字程度）- 技術的意義、業界への影響、日本視点の示唆を含む",
  "heat_score": 0-100の数値（話題性・重要度）,
  "tags": ["タグ1", "タグ2", "タグ3"],
  "source_handle": "@ハンドル"
}
```

#### 2b. エンティティ深掘り更新プロンプト

```
以下の研究者/企業家/企業に関する最新Xポストを分析し、
プロフィールページを更新するための日本語コンテンツを生成してください。

対象: {{entity_name}} (@{{handle}})
最新ポスト: {{posts_json}}

出力（JSON）:
{
  "thinking_style": "思考スタイルの分析（更新版）",
  "japan_insight": "日本視点の示唆（更新版）",
  "new_contributions": ["新たな実績や発言"]
}
```

---

### 3. n8n ワークフロー設計

#### ワークフロー1: 毎時記事収集

```
[Schedule: 毎時] 
  → [HTTP: Apify Actor実行]
  → [Wait: 5分]
  → [HTTP: Apify結果取得]
  → [Code: ポストをフィルタリング（いいね50以上 OR フォロワー10万以上のアカウント）]
  → [HTTP: Grok API - 記事生成]
  → [Code: JSONパース]
  → [HTTP: POST /api/articles（Supabase経由）]
  → [HTTP: POST /api/trends（タグ集計更新）]
```

#### ワークフロー2: 毎日エンティティ更新

```
[Schedule: 毎日 AM6:00]
  → [HTTP: GET /api/entities（全エンティティ取得）]
  → [Loop: 各エンティティ]
    → [HTTP: Apify - @handleの最新ポスト取得]
    → [HTTP: Grok API - 深掘り分析]
    → [HTTP: PATCH /api/entities/:id（更新）]
    → [HTTP: POST /api/posts（X投稿を保存）]
```

---

### 4. n8n HTTPノード設定例

#### Supabase API呼び出し（記事作成）

```
Method: POST
URL: https://dslzeejftrsrdmyvhmkd.supabase.co/rest/v1/articles
Headers:
  Authorization: Bearer {{SUPABASE_ANON_KEY}}
  apikey: {{SUPABASE_ANON_KEY}}
  Content-Type: application/json
Body: {{$json.article}}
```

#### Grok API呼び出し

```
Method: POST
URL: https://api.x.ai/v1/chat/completions
Headers:
  Authorization: Bearer {{GROK_API_KEY}}
  Content-Type: application/json
Body:
{
  "model": "grok-3",
  "messages": [
    {"role": "system", "content": "..."},
    {"role": "user", "content": "{{$json.posts_text}}"}
  ],
  "temperature": 0.7,
  "response_format": {"type": "json_object"}
}
```

---

### 5. 監視アカウントリスト（初期設定推奨）

```
# 研究者
karpathy, ylecun, goodfellow_ian, hardmaru, clmntkeyser
jeffdean, vinyals, koray_kavukcuoglu, drfeifei

# 企業家・CEO
sama, elonmusk, demishassabis, miramurati

# 企業公式
AnthropicAI, OpenAI, GoogleDeepMind, xai, MistralAI
Meta, Microsoft, AmazonScience

# 日本AI関係
shota_imai, kashish_patel_ai
```

---

### 6. 環境変数一覧

```bash
# Supabase
SUPABASE_URL=https://dslzeejftrsrdmyvhmkd.supabase.co
SUPABASE_ANON_KEY=eyJhbGci...

# Grok API（xAI）
GROK_API_KEY=xai-...

# Apify
APIFY_API_TOKEN=apify_api_...

# Optional: OpenRouter fallback
OPENROUTER_API_KEY=sk-or-...
```

---

### 7. コスト試算（月額）

| サービス | 無料枠 | 推定使用量 | コスト |
|--------|--------|----------|-------|
| Supabase | 500MB DB | 〜50MB/月 | **$0** |
| Apify | 5ドル分 | 毎時100件×720h | **$0-5** |
| Grok API | - | 〜3000回/月 | **$3-10** |
| n8n Cloud | 2000実行/月 | 〜1500回/月 | **$0** |
| Vercel/Perplexity | 無料 | - | **$0** |
| **合計** | | | **$3-15/月** |

---

### 8. 拡張ロードマップ

1. **フェーズ1（現在）**: シードデータ + 手動管理
2. **フェーズ2**: n8n自動収集 + Grok記事生成
3. **フェーズ3**: Telegram通知（重要記事をBot配信）
4. **フェーズ4**: ユーザーカスタマイズ（監視アカウント追加UI）
5. **フェーズ5**: マルチ言語対応（英語版ダッシュボード）

---

### 9. n8nワークフローJSONテンプレート

最小限の動作ワークフローをAPIで作成するコマンド:

```bash
# n8n Self-hosted（VPS推奨）でのセットアップ
docker run -it --rm \
  -e N8N_BASIC_AUTH_ACTIVE=true \
  -e N8N_BASIC_AUTH_USER=admin \
  -e N8N_BASIC_AUTH_PASSWORD=yourpassword \
  -p 5678:5678 \
  -v ~/.n8n:/home/node/.n8n \
  n8nio/n8n
```

Hetzner VPS（CAX11 = €3.79/月）にn8nを常駐させると
月額500円以下で完全自律化が実現します。

---

## まとめ

| 要素 | 技術 | 役割 |
|-----|------|-----|
| フロントエンド | React + Vite | ダッシュボード表示 |
| バックエンド | Express + TypeScript | API提供 |
| データベース | Supabase (PostgreSQL) | 永続データ |
| AI生成 | Grok API (xAI) | 記事・深掘り生成 |
| 収集 | Apify | X投稿スクレイピング |
| 自動化 | n8n | ワークフロー実行 |
| ホスティング | Perplexity Computer | 公開URL |
| ソースコード | GitHub (private) | バージョン管理 |
