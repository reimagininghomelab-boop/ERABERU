// 営業フリガナの正規化・検証（DB トリガー sync_salesperson_name_fields / CHECK 制約と同じ規則）
// 保存値の正規化・イニシャル生成は DB が正。ここは入力補助とエラー表示のために使う。

const EDGE_SPACES = /^[ \t\r\n]+|[ \t\r\n]+$/g // DB の btrim(…, E' \t\r\n') と同じ文字集合
const KANA_RE = /^[ァ-ヶー]{1,30}$/u
const BAD_HEAD_RE = /^[ァィゥェォッャュョヮヵヶー]/u
const INITIALS_RE = /^[A-Za-z]\.[A-Za-z]\.$/ // safe_salesperson_profiles が公開する形式

// NFKC → 前後の空白除去 → ひらがな（ぁ〜ゖ）を全角カタカナ（ァ〜ヶ）へ
export function normalizeKana(input: string): string {
  return input
    .normalize('NFKC')
    .replace(EDGE_SPACES, '')
    .replace(/[ぁ-ゖ]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x60))
}

// 正規化済みの値を検証する。問題なければ null
export function kanaError(kana: string): string | null {
  if (kana === '') return 'フリガナを入力してください'
  if ([...kana].length > 30) return 'フリガナは30文字以内で入力してください'
  if (!KANA_RE.test(kana)) return 'フリガナは全角カタカナ（長音「ー」を含む）で入力してください'
  if (BAD_HEAD_RE.test(kana)) return 'フリガナの先頭に小さい文字や「ー」は使えません'
  return null
}

// 姓・名のフリガナを正規化して検証する
export function validateKanaPair(familyKana: string, givenKana: string): {
  family: string
  given: string
  error: string | null
} {
  const family = normalizeKana(familyKana)
  const given = normalizeKana(givenKana)
  const familyError = kanaError(family)
  if (familyError) return { family, given, error: `セイ: ${familyError}` }
  const givenError = kanaError(given)
  if (givenError) return { family, given, error: `メイ: ${givenError}` }
  return { family, given, error: null }
}

// 未開示の営業の表示名。英字イニシャルが無い・不正な場合は「担当者」
export function maskedName(initials: string | null | undefined): string {
  return initials && INITIALS_RE.test(initials) ? `${initials} さん` : '担当者'
}
