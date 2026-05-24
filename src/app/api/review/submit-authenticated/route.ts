import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(req: NextRequest) {
  try {
    const accessToken = req.headers.get('authorization')?.replace('Bearer ', '')
    if (!accessToken) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 })
    }

    const { salesperson_id, phase, rating, content } = await req.json()

    if (!salesperson_id || !phase || !rating || !content?.trim()) {
      return NextResponse.json({ error: '入力内容が不正です' }, { status: 400 })
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: `Bearer ${accessToken}` } } }
    )

    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return NextResponse.json({ error: '認証トークンが無効です' }, { status: 401 })
    }

    const { data, error } = await supabase.rpc('submit_authenticated_review', {
      p_salesperson_id: salesperson_id,
      p_phase: phase,
      p_rating: rating,
      p_content: content.trim(),
    })

    if (error) {
      const msg = error.message
      if (msg.includes('invalid_phase')) return NextResponse.json({ error: 'フェーズが不正です' }, { status: 400 })
      if (msg.includes('invalid_rating')) return NextResponse.json({ error: '評価値が不正です' }, { status: 400 })
      if (msg.includes('salesperson_not_found')) return NextResponse.json({ error: '営業マンが見つかりません' }, { status: 404 })
      if (msg.includes('duplicate_review')) return NextResponse.json({ error: 'このフェーズの口コミはすでに投稿済みです' }, { status: 409 })
      throw error
    }

    return NextResponse.json({ success: true, id: data })
  } catch (e) {
    console.error('[review/submit-authenticated]', e)
    return NextResponse.json({ error: '投稿に失敗しました' }, { status: 500 })
  }
}
