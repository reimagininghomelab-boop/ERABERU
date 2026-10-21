-- salesperson_profiles の直接 INSERT を禁止し、会社情報の本人変更を保護する
--
-- 目的:
--   1. 一般ログインユーザー（authenticated）による salesperson_profiles への直接 INSERT を禁止する。
--      現状は RLS「salesperson insert own」（user_id = auth.uid()）のみで、
--      登録 API の会社ドメイン判定を迂回して status / is_verified 付きの行を作れる。
--   2. 会社認証に関わる列（company_id / company_name / application_company_name /
--      application_email）と user_id を、営業本人が直接 UPDATE で変更できないようにする。
--      現状は RLS「salesperson update own」により本人行の全列を UPDATE できる。
--
-- 適用前の本番調査結果（確認済み）:
--   GRANT          : authenticated にテーブル全体の INSERT / UPDATE
--   列単位 GRANT   : authenticated への個別 INSERT 権限は無し
--   ポリシー       : salesperson insert own / salesperson update own（user_id = auth.uid()）
--                    管理者向け UPDATE ポリシー
--   既存トリガー   : block_status_self_approve（prevent_salesperson_status_change）
--                    status / is_verified の変更を管理者 UUID 2 件以外で拒否。
--                    service_role は auth.uid() が NULL となり判定式が NULL → 通過する
--
-- 現行コードの利用経路（全件調査済み）:
--   INSERT : src/app/api/salesperson/register-profile/route.ts（service_role）のみ
--   会社情報の UPDATE :
--     register-profile（service_role）… status = 'pending' の行のみ（commit 5718470）
--     dashboard … company_name を送信しない・欄は読み取り専用（commit 5718470）
--     admin 画面 … 会社情報の更新処理は無し
--
-- 新規トリガーの設計:
--   - SECURITY INVOKER とし、current_user（呼び出し元ロール）で判定する。
--     authenticated / anon 以外（service_role・postgres）は対象外とし、
--     登録 API の pending 再送信による会社情報更新を維持する。
--   - 管理者も対象外にしない（管理画面に会社情報の変更機能は無い）。
--     運営による会社情報の変更は SQL エディタまたは service_role で行う。
--   - NEW を書き換えず検査のみ行うため、既存トリガー block_status_self_approve と競合しない。
--   - 変更の有無（IS DISTINCT FROM）で判定するため、同じ値の UPDATE は通過する。
--
-- 触れないもの:
--   authenticated の UPDATE / SELECT 権限、RLS ポリシー、既存トリガー・関数、
--   テーブル定義、service_role / postgres の全権限

-- 1. authenticated の直接 INSERT を禁止
REVOKE INSERT ON TABLE public.salesperson_profiles FROM authenticated;

-- 2. 会社情報の本人変更を保護
CREATE OR REPLACE FUNCTION public.prevent_salesperson_company_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  -- service_role（登録 API）・postgres（SQL エディタ）は対象外
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;

  IF NEW.company_id               IS DISTINCT FROM OLD.company_id
  OR NEW.company_name             IS DISTINCT FROM OLD.company_name
  OR NEW.application_company_name IS DISTINCT FROM OLD.application_company_name
  OR NEW.application_email        IS DISTINCT FROM OLD.application_email
  OR NEW.user_id                  IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'permission denied: company information can only be changed by the operator'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER block_company_self_change
  BEFORE UPDATE ON public.salesperson_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_salesperson_company_change();

-- 適用後の確認クエリ（手動）:
--   SELECT grantee, privilege_type
--   FROM information_schema.role_table_grants
--   WHERE table_schema = 'public' AND table_name = 'salesperson_profiles'
--     AND grantee = 'authenticated'
--   ORDER BY privilege_type;
--   → INSERT が無いこと（UPDATE / SELECT は残る）
--
--   SELECT tgname, tgenabled FROM pg_trigger
--   WHERE tgrelid = 'public.salesperson_profiles'::regclass AND NOT tgisinternal;
--   → block_status_self_approve と block_company_self_change が有効であること
--
-- 適用後テスト:
--   - 営業 JWT で salesperson_profiles に INSERT → 権限エラー
--   - 営業 JWT で company_id / company_name / application_company_name /
--     application_email / user_id を UPDATE → 42501
--   - ダッシュボードのプロフィール保存・公開切替・顔写真・QR 再発行・AI 紹介文 → 成功
--   - 新規登録（ドメイン一致 → active / 不一致 → pending）→ 成功
--   - pending の再送信（会社変更・is_verified 再計算を含む）→ 成功
--   - 管理画面の承認・非公開化・QR 再発行 → 成功
--
-- ロールバック（必要な場合のみ手動実行）:
--   DROP TRIGGER IF EXISTS block_company_self_change ON public.salesperson_profiles;
--   DROP FUNCTION IF EXISTS public.prevent_salesperson_company_change();
--   GRANT INSERT ON TABLE public.salesperson_profiles TO authenticated;
