-- 営業フリガナ（family_name_kana / given_name_kana）を正式登録し、英字イニシャルをフリガナから自動生成する
--
-- 目的:
--   1. salesperson_profiles にフリガナ列を追加し、全角カタカナへの正規化と形式チェックを DB で行う。
--   2. name_initials をフリガナから「姓.名.」の英字イニシャルとして自動生成する（漢字からは生成しない）。
--   3. real_name を姓名が実際に変更された場合のみ「姓 名」形式で同期する。
--   4. 営業本人（authenticated）による real_name / name_initials の直接変更、
--      登録済みフリガナの削除、姓名の空欄化を禁止する。
--
-- 適用前の本番調査結果（2026-10-28 確認済み・読み取りのみ）:
--   PostgreSQL 17.6 / server_encoding UTF8 / ICU。normalize(..., 'NFKC') 利用可
--   既存トリガー（いずれも BEFORE UPDATE・NEW を書き換えない）:
--     block_company_self_change（prevent_salesperson_company_change, SECURITY INVOKER）
--     block_status_self_approve（prevent_salesperson_status_change, SECURITY DEFINER）
--   salesperson_profiles を INSERT / UPDATE / DELETE する SECURITY DEFINER 関数: 無し
--   権限:
--     anon          : 列単位 SELECT のみ（安全列）。テーブル単位の権限は無し
--                     → 追加列は anon に公開されない
--     authenticated : テーブル単位 SELECT / UPDATE ほか（INSERT は剥奪済み）。RLS で本人行・管理者に限定
--                     → 追加列は本人が SELECT / UPDATE 可能（ダッシュボード入力に必要）
--     public スキーマの関数にはデフォルト権限で anon / authenticated に EXECUTE が明示付与される
--   開示 RPC 4 件は返却列を明示しており、追加列は返却されない
--   データ: 10 件（全件 active）。姓・名・real_name の NULL / 空文字 0 件、
--           real_name が「姓 名」と不一致 1 件、name_initials は 9 件が英大文字 X.Y. 形式
--   境界条件（SELECT 式で検証済み）:
--     ｶﾞｯｺｳ / がっこう → ガッコウ、ｳﾞｨ / ゔぃ → ヴィ、ゐゑを → ヰヱヲ、か + 結合濁点 → ガ
--     単独の ゛゜、・、ヷ、ゝ、ヽ、〜、－、―、‐、小書き片仮名拡張（ㇰ 等）、変体仮名 → CHECK で拒否
--     ㌀ → アパート 等の互換文字は NFKC 展開後の値で判定（許可）
--     先頭に来られる 74 文字すべてがイニシャル変換表で A-Z の 1 文字に変換される
--
-- 設計:
--   - トリガーは 1 つ（BEFORE INSERT OR UPDATE）。正規化 → 直接変更検査 → real_name 同期 →
--     イニシャル生成を 1 関数の中でこの順に行う。直接変更の検査は、本人が送信した NEW を
--     自動設定より前に OLD と比較するため、トリガー内部の自動更新と両立する。
--   - SECURITY INVOKER とし、current_user（呼び出し元ロール）で判定する（既存の会社情報保護と同じ方式）。
--     authenticated / anon だけを直接変更禁止の対象とし、service_role（登録 API）・postgres（SQL エディタ）
--     は対象外とする。フリガナ削除の禁止も本人のみとし、運営による訂正経路を残す。
--   - INSERT では呼び出し元ロールに関係なく姓名の NULL・空欄・空白のみを拒否し（23514）、
--     real_name / name_initials を姓名・フリガナから導出して任意の値を設定できないようにする
--     （authenticated の INSERT 権限は剥奪済み）。登録 API は trim 済みの姓名を必須として送るため影響しない。
--   - 姓名変更時に既存フリガナを DB で自動消去しない。フリガナの再確認はアプリ側で必須とする
--     （フリガナ登録済みの営業が姓名のみ変更した場合、name_initials は既存フリガナから再生成される）。
--   - UPDATE で service_role / postgres が real_name / name_initials を明示的に変更した場合は、
--     姓名変更時の同期・フリガナからの生成・フリガナ削除時の NULL 化が優先され、
--     それ以外は送信値を保持する（運営による訂正用）。
--   - 運営が登録済みフリガナを削除（両方 NULL）した場合は、古いフリガナ由来の name_initials を残さず NULL にする。
--     OLD・NEW ともフリガナ未登録の既存行では、姓名が変わらない限り既存の name_initials を維持する。
--   - CHECK 制約はトリガー適用後の行に対して評価されるため、正規化後の値を検証する。
--   - 既存トリガーとは扱う列が重ならず、いずれも NEW を書き換えないため、実行順に依存しない。
--
-- イニシャル変換表（ヘボン式・先頭文字のみ）:
--   ア行 A I U E O / カ行 K / ガ行 G / サ行 S（シ S）/ ザ行 Z（ジ J）/ タ行 T（チ C・ツ T）/
--   ダ行 D（ヂ J・ヅ Z）/ ナ行 N / ハ行 H（フ F）/ バ行 B / パ行 P / マ行 M / ヤ行 Y / ラ行 R /
--   ワ W・ヰ I・ヱ E・ヲ O / ン N / ヴ V
--
-- 触れないもの:
--   既存 10 件のデータ（バックフィル・イニシャル一括変更・real_name 一括修正は行わない）、
--   safe_salesperson_profiles VIEW、既存 RPC、RLS ポリシー、テーブルの GRANT / REVOKE、
--   既存トリガー・関数（会社情報保護・status 保護）、新規 INSERT でのフリガナ必須化（後工程）

-- 1. フリガナ列と CHECK 制約
ALTER TABLE public.salesperson_profiles
  ADD COLUMN family_name_kana text,
  ADD COLUMN given_name_kana  text,
  ADD CONSTRAINT salesperson_profiles_kana_format CHECK (
    (family_name_kana IS NULL
      OR (family_name_kana ~ '^[ァ-ヶー]{1,30}$'
          AND family_name_kana !~ '^[ァィゥェォッャュョヮヵヶー]'))
    AND
    (given_name_kana IS NULL
      OR (given_name_kana ~ '^[ァ-ヶー]{1,30}$'
          AND given_name_kana !~ '^[ァィゥェォッャュョヮヵヶー]'))
  ),
  ADD CONSTRAINT salesperson_profiles_kana_pair CHECK (
    (family_name_kana IS NULL) = (given_name_kana IS NULL)
  );

COMMENT ON COLUMN public.salesperson_profiles.family_name_kana IS
  '姓のフリガナ（全角カタカナ・長音のみ、1〜30文字）。トリガー sync_salesperson_name_fields で正規化される';
COMMENT ON COLUMN public.salesperson_profiles.given_name_kana IS
  '名のフリガナ（全角カタカナ・長音のみ、1〜30文字）。トリガー sync_salesperson_name_fields で正規化される';

-- 2. 正規化・直接変更検査・real_name 同期・イニシャル生成
CREATE OR REPLACE FUNCTION public.sync_salesperson_name_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  -- ひらがな（ぁ〜ゖ）→ 全角カタカナ（ァ〜ヶ）の 1 対 1 対応（各 86 文字）
  c_hiragana constant text :=
    'ぁあぃいぅうぇえぉおかがきぎくぐけげこごさざしじすずせぜそぞただちぢっつづてでとどなにぬねのはばぱひびぴふぶぷへべぺほぼぽまみむめもゃやゅゆょよらりるれろゎわゐゑをんゔゕゖ';
  c_katakana constant text :=
    'ァアィイゥウェエォオカガキギクグケゲコゴサザシジスズセゼソゾタダチヂッツヅテデトドナニヌネノハバパヒビピフブプヘベペホボポマミムメモャヤュユョヨラリルレロヮワヰヱヲンヴヵヶ';
  -- 先頭に来られる片仮名（各 74 文字）→ ヘボン式の頭文字
  c_head_kana constant text :=
    'アイウエオカガキギクグケゲコゴサザシジスズセゼソゾタダチヂツヅテデトドナニヌネノハバパヒビピフブプヘベペホボポマミムメモヤユヨラリルレロワヰヱヲンヴ';
  c_head_alpha constant text :=
    'AIUEOKGKGKGKGKGSZSJSZSZSZTDCJTZTDTDNNNNNHBPHBPFBPHBPHBPMMMMMYYYRRRRRWIEONV';
  v_is_client    boolean := current_user IN ('authenticated', 'anon');
  v_name_changed boolean;
  v_kana_removed boolean := false;
  v_family_head  text;
  v_given_head   text;
  v_initials     text;
BEGIN
  -- (1) フリガナの正規化: NFKC → 前後の空白除去 → ひらがなを片仮名へ → 空文字は NULL
  IF NEW.family_name_kana IS NOT NULL THEN
    NEW.family_name_kana := pg_catalog.translate(
      pg_catalog.btrim(pg_catalog.normalize(NEW.family_name_kana, 'NFKC'), E' \t\r\n'),
      c_hiragana, c_katakana);
    IF NEW.family_name_kana = '' THEN
      NEW.family_name_kana := NULL;
    END IF;
  END IF;

  IF NEW.given_name_kana IS NOT NULL THEN
    NEW.given_name_kana := pg_catalog.translate(
      pg_catalog.btrim(pg_catalog.normalize(NEW.given_name_kana, 'NFKC'), E' \t\r\n'),
      c_hiragana, c_katakana);
    IF NEW.given_name_kana = '' THEN
      NEW.given_name_kana := NULL;
    END IF;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    -- (2) 本人による直接変更の検査（自動設定より前に、送信された NEW と OLD を比較する）
    IF v_is_client THEN
      IF NEW.real_name     IS DISTINCT FROM OLD.real_name
      OR NEW.name_initials IS DISTINCT FROM OLD.name_initials THEN
        RAISE EXCEPTION 'permission denied: real_name and name_initials cannot be changed directly'
          USING ERRCODE = '42501';
      END IF;

      -- 登録済みのフリガナを本人が削除することは禁止（片方のみの NULL は CHECK 制約で拒否）
      IF (OLD.family_name_kana IS NOT NULL OR OLD.given_name_kana IS NOT NULL)
         AND NEW.family_name_kana IS NULL
         AND NEW.given_name_kana  IS NULL THEN
        RAISE EXCEPTION 'permission denied: registered name kana cannot be removed'
          USING ERRCODE = '42501';
      END IF;
    END IF;

    v_name_changed := NEW.family_name IS DISTINCT FROM OLD.family_name
                   OR NEW.given_name  IS DISTINCT FROM OLD.given_name;

    -- 登録済みのフリガナが NULL に戻された（本人は (2) で拒否済みのため、運営による削除のみ該当）
    v_kana_removed := (OLD.family_name_kana IS NOT NULL OR OLD.given_name_kana IS NOT NULL)
                      AND (NEW.family_name_kana IS NULL OR NEW.given_name_kana IS NULL);

    -- (3) 姓名の保護と real_name 同期（姓名が実際に変更された場合のみ）
    IF v_name_changed THEN
      IF NEW.family_name IS NULL OR NEW.given_name IS NULL
         OR pg_catalog.btrim(pg_catalog.normalize(NEW.family_name, 'NFKC'), E' \t\r\n') = ''
         OR pg_catalog.btrim(pg_catalog.normalize(NEW.given_name,  'NFKC'), E' \t\r\n') = '' THEN
        RAISE EXCEPTION 'family_name and given_name cannot be empty'
          USING ERRCODE = '23514';
      END IF;
      NEW.real_name := NEW.family_name || ' ' || NEW.given_name;
    END IF;
  ELSE
    -- INSERT: 姓名の NULL・空欄・空白のみを拒否し、real_name は姓名から導出して任意の値を設定させない
    v_name_changed := true;
    IF NEW.family_name IS NULL OR NEW.given_name IS NULL
       OR pg_catalog.btrim(pg_catalog.normalize(NEW.family_name, 'NFKC'), E' \t\r\n') = ''
       OR pg_catalog.btrim(pg_catalog.normalize(NEW.given_name,  'NFKC'), E' \t\r\n') = '' THEN
      RAISE EXCEPTION 'family_name and given_name cannot be empty'
        USING ERRCODE = '23514';
    END IF;
    NEW.real_name := NEW.family_name || ' ' || NEW.given_name;
  END IF;

  -- (4) name_initials の決定
  IF NEW.family_name_kana IS NOT NULL AND NEW.given_name_kana IS NOT NULL THEN
    -- フリガナ登録済み: 先頭文字から生成（生成できない場合は NULL。行の書き込みは拒否しない）
    v_family_head := pg_catalog.translate(pg_catalog.left(NEW.family_name_kana, 1), c_head_kana, c_head_alpha);
    v_given_head  := pg_catalog.translate(pg_catalog.left(NEW.given_name_kana, 1),  c_head_kana, c_head_alpha);
    IF v_family_head ~ '^[A-Z]$' AND v_given_head ~ '^[A-Z]$' THEN
      v_initials := v_family_head || '.' || v_given_head || '.';
    ELSE
      v_initials := NULL;
    END IF;
    NEW.name_initials := v_initials;
  ELSIF v_name_changed OR v_kana_removed THEN
    -- フリガナ未登録の INSERT、姓名変更時、または登録済みフリガナの削除時:
    -- 漢字からは生成せず、削除前のフリガナ由来のイニシャルも残さず NULL
    NEW.name_initials := NULL;
  END IF;
  -- それ以外（OLD・NEW ともフリガナ未登録で姓名も変わらない UPDATE）は既存の name_initials を維持する
  -- （本人は (2) により OLD と同じ値に限定される）

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_salesperson_name_fields() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER sync_salesperson_name_fields
  BEFORE INSERT OR UPDATE ON public.salesperson_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_salesperson_name_fields();

-- 適用後の確認クエリ（手動・読み取り専用）:
--   SELECT tgname, tgenabled FROM pg_trigger
--   WHERE tgrelid = 'public.salesperson_profiles'::regclass AND NOT tgisinternal
--   ORDER BY tgname;
--   → block_company_self_change / block_status_self_approve / sync_salesperson_name_fields が有効
--
--   SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
--   WHERE conrelid = 'public.salesperson_profiles'::regclass AND conname LIKE 'salesperson_profiles_kana_%';
--   → salesperson_profiles_kana_format / salesperson_profiles_kana_pair が存在
--
--   SELECT grantee, privilege_type FROM information_schema.column_privileges
--   WHERE table_schema = 'public' AND table_name = 'salesperson_profiles'
--     AND column_name IN ('family_name_kana', 'given_name_kana') AND grantee = 'anon';
--   → 0 件（anon に公開されない）
--
--   SELECT has_function_privilege('anon', 'public.sync_salesperson_name_fields()', 'EXECUTE') AS anon_x,
--          has_function_privilege('authenticated', 'public.sync_salesperson_name_fields()', 'EXECUTE') AS auth_x;
--   → いずれも false
--
--   SELECT count(*) AS total,
--          count(*) FILTER (WHERE name_initials ~ '^[A-Za-z]\.[A-Za-z]\.$') AS alpha,
--          count(*) FILTER (WHERE family_name_kana IS NOT NULL OR given_name_kana IS NOT NULL) AS kana
--   FROM public.salesperson_profiles;
--   → total 10 / alpha 9 / kana 0（適用前と同じ。既存データは変更されない）
--
-- 適用後テスト（営業 JWT = authenticated）:
--   - フリガナ未登録の既存営業がプロフィール保存（姓名変更なし）→ 成功、real_name / name_initials 不変
--   - フリガナ登録済みの営業がプロフィール保存（姓名変更なし）→ 成功、name_initials 不変（同じ値を再生成）
--   - 公開切替・顔写真・QR 再発行・AI 紹介文 → 成功
--   - フリガナ登録（ひらがな・半角カナ入力）→ 全角カタカナで保存、name_initials がフリガナから再生成
--   - フリガナ修正 → name_initials が新しいフリガナから再生成
--   - 姓名のみ変更（フリガナ未登録）→ real_name 同期、name_initials NULL
--   - 姓名を空欄 / NULL に変更 → 23514
--   - real_name / name_initials を直接 UPDATE → 42501
--   - 登録済みフリガナを両方 NULL / 空文字に変更 → 42501、片方のみ NULL → CHECK 違反
--   - 不正なフリガナ（・、－、先頭ッ / ー、31 文字、英字）→ CHECK 違反
--   - company_id / status 等の変更 → 既存トリガーにより従来どおり拒否
--   service_role / postgres（運営）:
--   - 新規登録（ドメイン一致 → active / 不一致 → pending）→ 成功、real_name =「姓 名」、name_initials NULL
--   - 姓名が NULL / 空文字 / 空白のみの INSERT → 23514
--   - pending の再送信 → 成功
--   - 登録済みフリガナを両方 NULL に変更 → 成功、name_initials NULL（姓名変更の有無を問わない）
--   イニシャル生成失敗:
--   - 先頭文字が変換表に無い場合は name_initials NULL とし、行の書き込みは拒否しない。
--     CHECK 制約で先頭文字は変換表の 74 文字に限定されるため、通常の入力では発生しない（防御的な分岐）
--
-- ロールバック（必要な場合のみ手動実行。フリガナ列のデータは失われる）:
--   DROP TRIGGER IF EXISTS sync_salesperson_name_fields ON public.salesperson_profiles;
--   DROP FUNCTION IF EXISTS public.sync_salesperson_name_fields();
--   ALTER TABLE public.salesperson_profiles
--     DROP CONSTRAINT IF EXISTS salesperson_profiles_kana_pair,
--     DROP CONSTRAINT IF EXISTS salesperson_profiles_kana_format,
--     DROP COLUMN IF EXISTS given_name_kana,
--     DROP COLUMN IF EXISTS family_name_kana;
