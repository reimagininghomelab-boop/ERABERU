# 営業マンの通知表サイト〜ERABERU〜 - CLAUDE.md

## 事業ビジョン

住宅業界の「情報の非対称性」を解消し、誠実なプレイヤーが正当に評価される生態系（OS）を構築する。
「成り行きで会社を選ぶ」のではなく、**「施主が主体となって誠実な営業マンを指名する」**という、家づくりの順番そのものを変革する。

### ターゲットユーザー
- **施主**: 住宅検討者 `prospective`・建築中 `building`・OB（既築オーナー） `owner_ob`（情報提供者として）
- **営業担当者**: ハウスメーカー・工務店に所属する個人（特に誠実なトップ営業） `sales`
- **住宅会社・売主**: 自社営業の分析データを必要とする企業、秘匿性の高い土地情報を持つ地主・分譲業者

※ステータスは `profiles.status` enum（`prospective` / `building` / `owner_ob` / `sales`）で管理する

---

## 収益モデル

### CtoC/BtoCマッチング収益
| 項目 | 金額 | 支払者 |
|------|------|--------|
| 施主オファー料（営業マンへの指名・プラン診断時） | ¥1,000 | 施主 |
| 営業受諾料（マッチング成立時） | ¥5,000〜¥10,000 | 営業側 |
| 土地探しサブスク | 月額 | 施主 |

### BtoB収益・データ販売
- **住宅会社向けSaaS**: 自社営業の強み・弱みを分析するデータ販売（SETUP Lab内の機能）
- **広告・教育収益（営業の大学 / Sales Academy）**: 建材メーカー等からの広告・視聴料
- **人材データ販売**: 優秀な営業マンの紹介料（1人あたり100万円想定）

---

## 設計思想・決定事項

### やること
- **誠実さの数値化**: 口コミの非公開率を明示。非公開率30%超で新規オファー停止（自浄作用ルール）
- **厳格な本人確認**: 建築確認番号・位置情報付き写真（Exif照合）による、営業を介さない認証
- **主要ロジックはサーバーサイド**: セキュリティのためEdge Functionsに集約
- **役割の分離**: 営業向けの便利ツールは「営業の大学（Sales Academy）」へ統合。施主向けのマイページはSETUP Lab内に構築

### やらないこと
- 人的リソースの投入（書類確認・審査は AI/OCR で自動化）
- 宅建業領域への介入（情報とツールの提供に徹するSaaSモデル）
- 安易な金銭報酬による口コミ収集（マッチング優待・社会貢献を動機とする）

---

## 将来ビジョン
- 年商1,200億円・利益率99%でSUUMOを凌駕する業界信頼インフラ
- 10人以下の少数精鋭運営（AIと専門家ギルド活用）
- 「公認バッジ」で優秀な営業マンを守り、不誠実な業者が自然淘汰されるアルゴリズム
- 「お宅見学」「SETUP Lab」の行動データを土地取引・営業評価にシームレスに還元する循環構造

---

## プロジェクト概要

**サービス名**: 営業マンの通知表サイト〜ERABERU〜

住宅営業マンを探せるマッチングサービス（SETUP Lab事業OSの入口となるプロダクト）。
ユーザーが営業マンのプロフィールを閲覧し、¥1,000で詳細を開示する。

### プロダクトファミリー（SETUP Lab）
| サービス名 | 略称 | 内容 |
|---|---|---|
| 営業マンの通知表サイト | ERABERU | 営業マンを選ぶ（★現在開発中） |
| 営業の大学 | MANABERU | 営業マンが学ぶ |
| 土地の直売所 | MITUKERU | 土地を見つける |
| 理想のお宅見学 | HANASERU | 施主同士が話せる |
| 住宅要望整理 | EGAKERU | 理想の家を描く |

- **URL**: https://eigyo-no-tsuchihyo.vercel.app
- **スタック**: Next.js 16 + Supabase + Tailwind CSS v4 + TypeScript
- **デプロイ**: Vercel (Hobby plan, reimagininghomelab-boops-projects)
- **DB**: Supabase (プロジェクト: sales-review, org: arch-toolbox's Org)

---

## ディレクトリ構成

```
src/
  app/
    page.tsx        # トップページ（営業マン一覧）
    layout.tsx
    globals.css
  lib/
    supabase.ts     # Supabaseクライアント
```

---

## Supabaseクライアントの構成

`src/lib/supabase.ts` は `createBrowserClient` のみのシンプルな構成にする。
Server Componentでは使わない。

```ts
import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
```

---

## 環境変数

### ローカル (.env.local)
```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

### Vercel
Settings → Environment Variables に以下を設定済み：
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

---

## Supabaseのテーブル・View構成

| 名前 | 種別 | 用途 |
|------|------|------|
| `salesperson_profiles` | BASE TABLE | 営業マンの本体データ |
| `safe_salesperson_profiles` | VIEW | 公開用（個人情報をマスク） |
| `profiles` | BASE TABLE | ユーザープロフィール |
| `contract_reviews` | BASE TABLE | 成約後レビュー |
| `pending_reviews` | BASE TABLE | レビュー未承認データ |
| `unlocked_profiles` | BASE TABLE | 開示済みプロフィール |
| `municipalities_master` | BASE TABLE | 市区町村マスタ |
| `email_request_logs` | BASE TABLE | メールリクエストログ |
| `messages` | BASE TABLE | メッセージ |

---

## RLS・権限設定（重要）

`safe_salesperson_profiles` はViewなのでRLSポリシーを直接設定できない。
以下をすべて設定済み：

```sql
-- 1. ベーステーブルにRLSポリシーを設定
ALTER TABLE salesperson_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "allow public read"
ON salesperson_profiles
FOR SELECT
TO anon
USING (true);

-- 2. ViewへのSELECT権限を付与
GRANT SELECT ON safe_salesperson_profiles TO anon;

-- 3. anonロールへの基本権限
GRANT USAGE ON SCHEMA public TO anon;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;
GRANT SELECT ON ALL SEQUENCES IN SCHEMA public TO anon;
```

---

## よくあるトラブルと対処法

### Vercelビルドエラー（Ecmascript file had an error）
- `supabase.ts` で `@supabase/ssr` のimportが問題になることがある
- `createBrowserClient` のみを使うシンプルな構成にする
- `page.tsx` に `'use client'` をつけてクライアントコンポーネントにする

### カードが表示されない（401 Unauthorized）
- Supabaseの `safe_salesperson_profiles` はViewのため、RLSポリシーはベーステーブル（`salesperson_profiles`）に設定する
- さらにViewとschema publicへのGRANTも必要（上記SQL参照）

### ローカルはOKだがVercelでエラー
- Vercelの環境変数が設定されているか確認
- 環境変数を追加した後は必ずRedeploy

---

## 開発コマンド

```bash
npm run dev      # ローカル起動
npm run build    # ビルド確認（Vercelと同じ）
git add .
git commit -m "メッセージ"
git push         # Vercelへ自動デプロイ
```

---

## Stripe決済基盤（MITUKERUで構築済み・流用可能）

土地の直売所（MITUKERU）プロジェクトで以下が実装・疎通確認済み：

- **Stripe Webhook**（Edge Function: index.ts）: 決済成功通知を受信 → Service RoleでDB更新
- **PaymentIntent API**: ¥10,000デポジット決済（詳細制御可能な方式）
- **商品メタデータ**: Stripe商品に `municipality_code`（JISコード）を紐付け
- **自動権限付与**: 決済成功 → `user_municipalities` テーブルへ保存 → RLSでアクセス制御

ERABERUへの転用方針：
- 金額: ¥10,000 → ¥1,000
- メタデータ: `municipality_code` → `salesperson_id`
- 権限テーブル: `user_municipalities` → `unlocked_profiles`
- それ以外のWebhook・PaymentIntentの構造はそのまま流用

---

## 今後の実装予定

- [x] プロフィール詳細ページ（¥1,000で開示UI）
- [ ] 認証（Supabase Auth）
- [ ] Stripe決済連携（MITUKERUの実装を流用）
- [ ] レビュー表示
- [ ] 検索・フィルター機能
