-- safe_salesperson_profiles の name_initials から漢字イニシャルのフォールバックを廃止する
--
-- 目的:
--   公開VIEW safe_salesperson_profiles の name_initials は、保存値が NULL の場合に
--   姓・名の先頭1文字（漢字）から「小.雄.」のような値を生成して anon / authenticated に返している。
--   開示前の氏名秘匿を弱めるため、この生成を廃止し、保存値が英字イニシャル形式
--   （例: O.Y.）の場合だけ公開し、それ以外は NULL を返す。
--
-- 適用前の本番調査結果（確認済み）:
--   所有者     : postgres
--   reloptions : NULL
--   relacl     : postgres / anon / authenticated / service_role に arwdDxtm
--   FROM       : salesperson_profiles sp LEFT JOIN companies c ON sp.company_id = c.id
--   WHERE      : sp.status = 'active' AND sp.is_visible = true
--   name_initials の現行式:
--     COALESCE(sp.name_initials,
--              CASE WHEN sp.family_name IS NOT NULL AND sp.given_name IS NOT NULL
--                   THEN LEFT(sp.family_name, 1) || '.' || LEFT(sp.given_name, 1) || '.'
--                   ELSE NULL::text END)
--   既存の name_initials : 10 件中 9 件が ^[A-Za-z]\.[A-Za-z]\.$ に一致、1 件が NULL（いずれもテストアカウント）
--
-- 変更点:
--   name_initials の式のみ。列名・列順・型、FROM / JOIN / WHERE は現行定義のまま。
--   参照先テーブルはスキーマ修飾（public.）しているが、参照するオブジェクトは現行と同一。
--   reloptions は NULL のため WITH 句は付けない。
--   CREATE OR REPLACE VIEW のため、所有者と既存の権限は維持される（DROP しない）。
--
-- 触れないもの:
--   salesperson_profiles / companies のデータ・定義・権限・RLS、GRANT / REVOKE、
--   関数・トリガー、他の VIEW

CREATE OR REPLACE VIEW public.safe_salesperson_profiles AS
SELECT
  sp.id,
  COALESCE(c.name, sp.company_name) AS company_name,
  sp.status,
  sp.is_verified,
  sp.department,
  sp.core_city,
  sp.available_prefectures,
  sp.specialty_styles,
  sp.qualifications,
  sp.sales_styles,
  sp.area_prefecture,
  sp.ai_summary,
  CASE
    WHEN sp.name_initials ~ '^[A-Za-z]\.[A-Za-z]\.$' THEN sp.name_initials
    ELSE NULL::text
  END AS name_initials,
  sp.profile_image_url
FROM public.salesperson_profiles sp
LEFT JOIN public.companies c ON sp.company_id = c.id
WHERE sp.status = 'active'
  AND sp.is_visible = true;

-- 適用前後の確認クエリ（手動・読み取り専用。適用前と適用後で結果を比較する）:
--   SELECT c.relowner::regrole AS owner, c.relacl, c.reloptions
--   FROM pg_class c WHERE c.oid = 'public.safe_salesperson_profiles'::regclass;
--   → 所有者 postgres、relacl・reloptions（NULL）が適用前と同一であること
--
--   SELECT a.attnum, a.attname, format_type(a.atttypid, a.atttypmod) AS type
--   FROM pg_attribute a
--   WHERE a.attrelid = 'public.safe_salesperson_profiles'::regclass
--     AND a.attnum > 0 AND NOT a.attisdropped
--   ORDER BY a.attnum;
--   → 列番号・列名・型が適用前と同一であること
--
--   SELECT count(*) AS total,
--          count(*) FILTER (WHERE name_initials ~ '^[A-Za-z]\.[A-Za-z]\.$') AS alpha,
--          count(*) FILTER (WHERE name_initials IS NULL) AS null_count,
--          count(*) FILTER (WHERE name_initials IS NOT NULL
--                             AND name_initials !~ '^[A-Za-z]\.[A-Za-z]\.$') AS other
--   FROM public.safe_salesperson_profiles;
--   → other が 0 件、total が適用前と同じであること
--
-- ロールバック（必要な場合のみ手動実行。漢字イニシャルの公開が復活する点に注意）:
--   CREATE OR REPLACE VIEW public.safe_salesperson_profiles AS
--   SELECT
--     sp.id,
--     COALESCE(c.name, sp.company_name) AS company_name,
--     sp.status,
--     sp.is_verified,
--     sp.department,
--     sp.core_city,
--     sp.available_prefectures,
--     sp.specialty_styles,
--     sp.qualifications,
--     sp.sales_styles,
--     sp.area_prefecture,
--     sp.ai_summary,
--     COALESCE(
--       sp.name_initials,
--       CASE
--         WHEN sp.family_name IS NOT NULL AND sp.given_name IS NOT NULL
--         THEN LEFT(sp.family_name, 1) || '.' || LEFT(sp.given_name, 1) || '.'
--         ELSE NULL::text
--       END
--     ) AS name_initials,
--     sp.profile_image_url
--   FROM public.salesperson_profiles sp
--   LEFT JOIN public.companies c ON sp.company_id = c.id
--   WHERE sp.status = 'active'
--     AND sp.is_visible = true;
