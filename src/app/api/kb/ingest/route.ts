import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { createClient } from '@/lib/supabase/server'

const KB_SOURCE_TYPES = ['self_intro', 'interview', 'qa', 'case_study', 'update_patch'] as const
type KbSourceType = (typeof KB_SOURCE_TYPES)[number]

function chunkText(text: string, targetSize = 1000, overlap = 100): string[] {
  const trimmed = text.trim()
  if (trimmed.length <= targetSize) return trimmed ? [trimmed] : []

  const chunks: string[] = []
  let start = 0

  while (start < trimmed.length) {
    const end = start + targetSize
    if (end >= trimmed.length) {
      const last = trimmed.slice(start).trim()
      if (last) chunks.push(last)
      break
    }

    // Find sentence boundary near the end of the window
    const window = trimmed.slice(start, end)
    const candidates = [
      window.lastIndexOf('。'),
      window.lastIndexOf('\n'),
      window.lastIndexOf('. '),
      window.lastIndexOf('！'),
      window.lastIndexOf('？'),
    ]
    const best = Math.max(...candidates)
    // Only use boundary if it leaves at least 400 chars in the chunk
    const cutAt = best > 400 ? start + best + 1 : end

    chunks.push(trimmed.slice(start, cutAt).trim())
    start = cutAt - overlap
  }

  return chunks.filter(c => c.length > 0)
}

export async function POST(req: NextRequest) {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  try {
    const supabase = await createClient()

    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Role check: block editors
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 403 })
    if (profile.role === 'editor') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const body = await req.json()
    const { raw_text, source_type, consent } = body

    if (!raw_text || typeof raw_text !== 'string' || !raw_text.trim()) {
      return NextResponse.json({ error: 'raw_text is required' }, { status: 400 })
    }
    if (raw_text.trim().length < 200) {
      return NextResponse.json({ error: `内容至少需要 200 字符（当前 ${raw_text.trim().length} 字符）` }, { status: 400 })
    }
    if (!KB_SOURCE_TYPES.includes(source_type as KbSourceType)) {
      return NextResponse.json({ error: `source_type must be one of: ${KB_SOURCE_TYPES.join(', ')}` }, { status: 400 })
    }
    if (typeof consent !== 'boolean') {
      return NextResponse.json({ error: 'consent must be a boolean' }, { status: 400 })
    }

    const chunks = chunkText(raw_text)
    if (chunks.length === 0) {
      return NextResponse.json({ error: 'Text is empty after processing' }, { status: 400 })
    }

    const insertedIds: string[] = []

    for (const chunk of chunks) {
      const embedRes = await openai.embeddings.create({
        model: 'text-embedding-ada-002',
        input: chunk,
      })
      const embedding = embedRes.data[0].embedding

      const { data: inserted, error: insErr } = await supabase
        .from('guest_kb_entries')
        .insert({
          guest_id: user.id,
          raw_text: chunk,
          source_type,
          consent,
          embedding,
        })
        .select('id')
        .single()

      if (insErr) {
        console.error('[kb/ingest] insert error:', insErr)
        return NextResponse.json({ error: insErr.message }, { status: 500 })
      }
      if (inserted) insertedIds.push(inserted.id)
    }

    return NextResponse.json({
      inserted: insertedIds.length,
      chunk_count: chunks.length,
      ids: insertedIds,
    })
  } catch (err: any) {
    console.error('[kb/ingest]', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
