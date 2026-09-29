-- M1: submit_anonymous_review の公開実行を封鎖する
--
-- 背景:
--   submit_anonymous_review は SECURITY DEFINER で anon / authenticated から EXECUTE 可能。
--   重複判定は引数 p_ip（呼び出し側の自己申告）のみで、qr_token は /review/<token> という
--   URL に現れる準公開値であるため、公開 anon key だけで任意の営業へ偽口コミを投稿できる。
--   唯一の呼び出し元だった /api/review/submit はどの画面からも呼ばれておらず（デッドルート）、
--   正式な投稿経路はメール認証付きの submit_email_verified_review 等へ移行済み。
--
-- このマイグレーションで行うこと:
--   submit_anonymous_review の EXECUTE 権限を anon / authenticated / PUBLIC から剥奪するのみ。
--   関数本体は削除しない（将来の再設計・調査のため保持する）。
--   他の関数・GRANT・RLS・テーブル権限には一切触れない。
--
-- 対象シグネチャ（Phase 0 本番DB調査で確認済み）:
--   public.submit_anonymous_review(
--     p_token   uuid,
--     p_rating  integer,
--     p_content text,
--     p_ip      text
--   )
--
-- 適用後の本番確認結果:
--   anon          : EXECUTE不可
--   authenticated : EXECUTE不可
--   service_role  : EXECUTE可
--
-- service_role の EXECUTE 権限は本 REVOKE 後も残ることを本番で確認済み。

REVOKE EXECUTE
  ON FUNCTION public.submit_anonymous_review(uuid, integer, text, text)
  FROM anon, authenticated, PUBLIC;

-- 適用後の確認クエリ（手動）:
--   SELECT p.oid::regprocedure AS signature, p.proacl
--   FROM pg_proc p
--   JOIN pg_namespace n ON n.oid = p.pronamespace
--   WHERE n.nspname = 'public' AND p.proname = 'submit_anonymous_review';
--   → proacl に anon= / authenticated= / 先頭の「=X/」(PUBLIC) が残っていないこと
--
-- ロールバック（必要な場合のみ手動実行）:
--   GRANT EXECUTE ON FUNCTION public.submit_anonymous_review(uuid, integer, text, text) TO anon;
