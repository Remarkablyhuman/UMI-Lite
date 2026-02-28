import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { createClient } from '@/lib/supabase/server'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

const RATE_LIMIT_MS = 10 * 60 * 1000 // 10 minutes
const MIN_KB_ENTRIES = 1
const KB_FETCH_LIMIT = 30

const REQUIRED_PERSONA_KEYS = [
  'schema_version',
  'meta',
  'core',
  'voice_style',
  'content_system',
  'boundaries',
  'growth',
  'modules',
  'evidence',
]

function buildPersonaPrompt(entries: { raw_text: string; source_type: string }[]): string {
  const formatted = entries
    .map((e, i) => `[${i + 1}] (${e.source_type})\n${e.raw_text}`)
    .join('\n\n')

  return `你是一位专业的达人画像建模师。以下是达人自己提交的知识库内容（共 ${entries.length} 条，已按时间降序排列）：

---
${formatted}
---

请根据以上内容，生成一份结构化达人画像 JSON。要求：
1. 仅使用知识库中出现的真实信息，不得编造任何内容
2. 如某字段信息不足，填写 null 或空数组，切勿虚构
3. 不包含 video_type 字段
4. 必须返回包含以下顶层字段的有效 JSON 对象：
   schema_version, meta, core, voice_style, content_system, boundaries, growth, modules, evidence

字段说明：
- schema_version: 字符串 "1.0"
- meta: { generated_at (ISO8601), kb_entry_count, source_types_used (数组) }
- core: { display_name, domain, expertise_areas (数组), background_summary, positioning }
- voice_style: { tone, language_pattern, signature_expressions (数组), taboo_expressions (数组) }
- content_system: { core_topics (数组), storytelling_approach, content_pillars (数组), preferred_formats (数组) }
- boundaries: { hard_limits (数组), preferred_avoid (数组), values (数组) }
- growth: { key_milestones (数组), current_stage, next_focus }
- modules: 数组，每项 { name, description, example_from_kb }
- evidence: { key_quotes (数组，每项 { quote, source_type }), concrete_cases (数组，每项 { case, context }) }

只返回 JSON，不加任何额外解释。`
}

export async function POST(req: NextRequest) {
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

    // Rate limit: check most recent version for this guest
    const { data: latestVersion } = await supabase
      .from('guest_profile_versions')
      .select('created_at')
      .eq('guest_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (latestVersion) {
      const elapsed = Date.now() - new Date(latestVersion.created_at).getTime()
      if (elapsed < RATE_LIMIT_MS) {
        const retryAfterSec = Math.ceil((RATE_LIMIT_MS - elapsed) / 1000)
        return NextResponse.json(
          { error: 'Rate limit: please wait before regenerating', retry_after_seconds: retryAfterSec },
          { status: 429 }
        )
      }
    }

    // Evidence gate: count consent=true KB entries
    const { count: kbCount, error: countErr } = await supabase
      .from('guest_kb_entries')
      .select('id', { count: 'exact', head: true })
      .eq('guest_id', user.id)
      .eq('consent', true)

    if (countErr) {
      console.error('[persona/regenerate] count error:', countErr)
      return NextResponse.json({ error: countErr.message }, { status: 500 })
    }

    if ((kbCount ?? 0) < MIN_KB_ENTRIES) {
      return NextResponse.json(
        { error: `Insufficient knowledge base: need at least ${MIN_KB_ENTRIES} consent=true entries, currently have ${kbCount ?? 0}` },
        { status: 409 }
      )
    }

    // Fetch latest N KB entries with consent=true
    const { data: kbEntries, error: kbErr } = await supabase
      .from('guest_kb_entries')
      .select('raw_text, source_type')
      .eq('guest_id', user.id)
      .eq('consent', true)
      .order('created_at', { ascending: false })
      .limit(KB_FETCH_LIMIT)

    if (kbErr) {
      console.error('[persona/regenerate] kb fetch error:', kbErr)
      return NextResponse.json({ error: kbErr.message }, { status: 500 })
    }

    if (!kbEntries || kbEntries.length === 0) {
      return NextResponse.json({ error: 'No usable KB entries found' }, { status: 409 })
    }

    // Generate persona via OpenAI
    const prompt = buildPersonaPrompt(kbEntries)
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      response_format: { type: 'json_object' },
    })

    const rawJson = completion.choices[0]?.message?.content
    if (!rawJson) {
      return NextResponse.json({ error: 'No response from AI' }, { status: 500 })
    }

    let personaData: Record<string, unknown>
    try {
      personaData = JSON.parse(rawJson)
    } catch {
      console.error('[persona/regenerate] JSON parse failed:', rawJson)
      return NextResponse.json({ error: 'AI returned invalid JSON' }, { status: 500 })
    }

    // Validate required keys
    const missingKeys = REQUIRED_PERSONA_KEYS.filter(k => !(k in personaData))
    if (missingKeys.length > 0) {
      console.error('[persona/regenerate] missing keys:', missingKeys, personaData)
      return NextResponse.json(
        { error: `Persona JSON missing required keys: ${missingKeys.join(', ')}` },
        { status: 500 }
      )
    }

    // Get current max version for this guest
    const { data: maxVersionRow } = await supabase
      .from('guest_profile_versions')
      .select('version')
      .eq('guest_id', user.id)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle()

    const nextVersion = (maxVersionRow?.version ?? 0) + 1

    // Insert version history record
    const { error: versionErr } = await supabase
      .from('guest_profile_versions')
      .insert({
        guest_id: user.id,
        version: nextVersion,
        profile_data: personaData,
        note: `Generated from ${kbEntries.length} KB entries`,
        created_by: user.id,
      })

    if (versionErr) {
      console.error('[persona/regenerate] version insert error:', versionErr)
      return NextResponse.json({ error: versionErr.message }, { status: 500 })
    }

    // Upsert active profile
    const { error: upsertErr } = await supabase
      .from('guest_profiles')
      .upsert(
        {
          guest_id: user.id,
          profile_data: personaData,
          status: 'ACTIVE',
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'guest_id' }
      )

    if (upsertErr) {
      console.error('[persona/regenerate] upsert error:', upsertErr)
      return NextResponse.json({ error: upsertErr.message }, { status: 500 })
    }

    return NextResponse.json({
      version: nextVersion,
      kb_entries_used: kbEntries.length,
      persona: personaData,
    })
  } catch (err: any) {
    console.error('[persona/regenerate]', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
