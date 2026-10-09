-- unlocked_profiles の未使用な権限を剥奪する
--
-- 目的:
--   public.unlocked_profiles（有料開示の決済済みレコード）に残っている
--   「呼び出し元が存在しない権限」を anon / authenticated から剥奪する。
--   現状は RLS（INSERT / UPDATE / DELETE ポリシー無し）で書き込みは拒否されているが、
--   TRUNCATE は RLS の対象外であり、将来ポリシーが追加された際の事故も防ぐため、
--   GRANT 側でも封鎖する（多層防御）。
--
-- 適用前の本番調査結果（確認済み）:
--   RLS            : enabled
--   ポリシー       : authenticated の本人 SELECT ポリシー（buyer_id = auth.uid()）のみ
--   GRANT          : anon / authenticated / service_role に全 7 種類
--   列単位 GRANT   : 独立したものは無し
--   参照元         : contract_reviews の SELECT ポリシーが本テーブルを参照
--                    unlocked_profiles を参照する RLS はすべて authenticated 専用
--   contract_reviews のポリシー : 全 5 件とも authenticated 専用
--                                 anon 向けの SELECT ポリシーは存在しない
--                                 （現行の contract_reviews の RLS ポリシーはすべて
--                                   authenticated 専用であり、確認済みのポリシーに対する
--                                   anon の SELECT 権限剥奪の影響はない）
--   DEFINER RPC    : get_my_unlocked_salesperson_profiles / get_unlocked_salesperson_profile
--                    いずれも postgres 所有の SECURITY DEFINER
--
-- 現行コードの利用経路（全件調査済み）:
--   INSERT : supabase/functions/stripe-webhook-eraberu/index.ts（service_role）のみ
--   UPDATE / DELETE / upsert : 0 件
--   SELECT : src/app/api/offers/create/route.ts（authenticated・本人行）… 直接 SELECT
--            詳細ページ・検索・マップ … 上記 DEFINER RPC 経由（postgres 権限で実行）
--   anon からの参照 : 0 件
--
-- authenticated の SELECT を残す理由:
--   offers/create の開示済み確認が直接 SELECT しているため。
--   また contract_reviews の SELECT ポリシー内サブクエリは呼び出し元ロールで評価されるため、
--   剥奪すると authenticated の contract_reviews 参照が権限エラーになる。
--
-- 触れないもの:
--   authenticated の SELECT 権限、RLS ポリシー、テーブル定義、RPC、
--   service_role / postgres の全権限

-- 1. anon: 呼び出し元もポリシーも存在しないため全権限を剥奪
REVOKE ALL PRIVILEGES
ON TABLE public.unlocked_profiles
FROM anon;

-- 2. authenticated: SELECT 以外を剥奪
REVOKE INSERT, UPDATE, DELETE,
       TRUNCATE, REFERENCES, TRIGGER
ON TABLE public.unlocked_profiles
FROM authenticated;

-- 適用後の確認クエリ（手動）:
--   SELECT grantee, privilege_type
--   FROM information_schema.role_table_grants
--   WHERE table_schema = 'public' AND table_name = 'unlocked_profiles'
--   ORDER BY grantee, privilege_type;
--   → anon          : 0 行
--   → authenticated : SELECT の 1 行のみ
--   → service_role  : 7 種類すべて残る
--
-- 適用後テスト:
--   - 一般ユーザー JWT で unlocked_profiles に INSERT / UPDATE / DELETE → 権限エラー
--   - 一般ユーザー JWT で unlocked_profiles を SELECT → 自分の行のみ返る
--   - anon で unlocked_profiles を SELECT → 権限エラー
--   - 営業詳細ページ・検索・マップの開示済み表示が変わらない（DEFINER RPC）
--   - ログインユーザーで contract_reviews の参照（詳細ページの口コミ表示・AI ルート）が変わらない
--   - service_role の INSERT 権限が維持されていることを確認（上記確認クエリ）。
--     実際の決済・Webhook テストは決済再開前に実施する
--
-- ロールバック（必要な場合のみ手動実行）:
--   GRANT ALL PRIVILEGES ON TABLE public.unlocked_profiles TO anon;
--   GRANT INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
--     ON TABLE public.unlocked_profiles TO authenticated;
