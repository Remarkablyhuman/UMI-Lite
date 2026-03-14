import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { createClient } from '@/lib/supabase/server'

const MIN_KB_ENTRIES = 1
const KB_FETCH_LIMIT = 30

const REQUIRED_PERSONA_KEYS = [
  'schema_version', 'meta', 'identity', 'persona_tags', 'key_experiences',
  'best_entry_point', 'content_directions', 'target_audience', 'audience_pain_points',
  'content_positioning', 'voice_style', 'expression_habits', 'reasoning_logic',
  'high_freq_scenes', 'case_directions', 'taboo_expressions', 'rewrite_principles',
  'title_style', 'opening_style', 'closing_style',
]

const SOURCE_TYPE_LABELS: Record<string, string> = {
  self_intro: '自我介绍', interview: '访谈记录', qa: '问答',
  case_study: '案例研究', update_patch: '更新补充',
}
function getSourceLabel(t: string): string { return SOURCE_TYPE_LABELS[t] ?? t }

interface PersonaMeta { kb_entry_count: number; source_types_used: string[] }

const NEW_PERSONA_SCHEMA_TEMPLATE = {
  schema_version: '2.0',
  meta: { generated_at: null, kb_entry_count: 0, source_types_used: [] },
  identity: { name: null, short_name: null, current_role: null, industry: null, main_business: null, region: null, realistic_position: null },
  persona_tags: [],
  key_experiences: [],
  best_entry_point: { primary_entry: null, reason: null, target_audience: null, avoid_entries: [] },
  content_directions: { primary: [], secondary: [], avoid: [] },
  target_audience: { core_groups: [], stage: null, typical_state: null, main_anxiety: null, desired_outcome: null, trigger_questions: [] },
  audience_pain_points: [],
  content_positioning: { types: [], orientation: null },
  voice_style: { tone: null, pace: null, pressure_level: null, warmth_level: null, expertise_life_ratio: null },
  expression_habits: { structure_preference: null, sentence_style: null, use_examples: null, personal_observations: null, sharp_expression: null, signature_style: null },
  reasoning_logic: { risk_vs_opportunity: null, audience_stage_vs_method: null, long_term_vs_immediate: null, real_life_vs_rules: null },
  high_freq_scenes: [],
  case_directions: [],
  taboo_expressions: { forbidden_phrases: [], forbidden_tone: [], forbidden_title_style: [], persona_breaking_patterns: [] },
  rewrite_principles: [],
  title_style: { preferred: [], avoid: [], effective_angles: [] },
  opening_style: { preferred: null, approach: null },
  closing_style: null,
}

function buildExtractionPrompt(entries: { raw_text: string; source_type: string }[]): { system: string; user: string } {
  const system = `你是一位短视频角色信息提取助手。

你的任务是从达人提交的多条原始知识库内容中，提取出所有真实可用的人物信息，整理成结构清晰的中文提取稿，供后续生成角色说明书使用。

提取规则：
1. 只提取知识库中明确出现的信息，不得推断或编造
2. 按以下分类组织提取结果：
   - 【基本身份】姓名、简称、当前职业/角色、所在行业、主营业务、地区
   - 【个人经历】关键经历、转型节点、重要事件（保留原话或近似原话）
   - 【内容方向】擅长/常讲的话题方向、明确表示不做的方向
   - 【目标受众】服务的人群描述、受众阶段、受众痛点、受众期望
   - 【表达风格】讲话语气、节奏、惯用句式、常用词汇、标志性表达
   - 【推理逻辑】本人对风险/机会的看法、对受众阶段与方法的判断、长期与短期的取舍
   - 【典型场景】经常出现在哪些场景下输出内容
   - 【案例方向】有哪些可复用的案例类型或故事结构
   - 【禁区与边界】明确不说的词汇、不用的语气、不碰的话题
3. 如某类别信息不足，保留标题但注明"暂无"
4. 保留原文中有价值的具体数字、案例、引用句`

  const user = entries
    .map((e, i) => `[${i + 1}] (${getSourceLabel(e.source_type)})\n${e.raw_text}`)
    .join('\n\n')

  return { system, user }
}

function buildPersonaSheetPrompt(extractedText: string, meta: PersonaMeta): { system: string; user: string } {
  const system = `你是一位短视频改写专用角色说明书生成助手。

你的任务是根据已整理好的人物信息提取稿，生成一份结构化的达人角色说明书 JSON，专门用于指导短视频脚本改写工作。

生成规则：
1. 严格基于提取稿中的真实信息，不得编造
2. 所有字段信息不足时填写 null 或空数组
3. 内容要具体、可操作，避免空泛描述
4. 标签类字段（数组）应精炼，每条不超过 20 字
5. 描述类字段应清晰具体，让改写者看到即知道如何操作
6. 只返回 JSON，不加任何额外解释`

  const user = `以下是已整理好的人物信息提取稿：

${extractedText}

请严格按照以下 JSON schema 输出，不得增减顶层字段：
${JSON.stringify(NEW_PERSONA_SCHEMA_TEMPLATE, null, 2)}

补充规则：
- schema_version 固定为 "2.0"
- meta.generated_at 填写当前 ISO8601 时间
- meta.kb_entry_count 填写 ${meta.kb_entry_count}
- meta.source_types_used 填写 ${JSON.stringify(meta.source_types_used)}
- 所有字段信息不足时填写 null 或空数组，不得编造
- 只返回 JSON，不加任何额外解释`

  return { system, user }
}

function buildAdvisoryPrompt(selfIntroEntries: { raw_text: string }[]): string {
  const content = selfIntroEntries
    .map((e, i) => `[${i + 1}]\n${e.raw_text}`)
    .join('\n\n')

  return `你是一位专业的社交媒体视频内容顾问。以下是一位内容创作者提交的自我介绍：

---
${content}
---

请根据上述内容，为这位创作者提供一段专业、实用的社媒短视频创作建议。建议须涵盖以下三个方面并不少于300字：

1. **内容方向定位**：结合其背景与优势，建议聚焦哪类内容赛道
2. **整体语气与风格**：建议视频呈现的整体调性、节奏感与风格取向
3. **语言运用技巧**：如何在视频脚本或讲述中更有效地表达、打动观众

再提供 3 个具体且具备传播潜力的视频选题

请以流畅、自然的段落形式呈现，直接面向创作者本人，语气专业、坦诚且具体可执行。不要使用编号列表，融合为连贯叙述。`
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

    // ── Step 1: Extraction ────────────────
    const { system: s1, user: u1 } = buildExtractionPrompt(kbEntries)
    console.log('[persona/regenerate:step1] running extraction for', kbEntries.length, 'entries')
    const r1 = await openai.chat.completions.create({
      model: 'gpt-5.4',
      messages: [{ role: 'system', content: s1 }, { role: 'user', content: u1 }],
      temperature: 0.3,
    })
    const extractedText = r1.choices[0]?.message?.content
    if (!extractedText) return NextResponse.json({ error: 'Extraction step returned no content' }, { status: 500 })

    // ── Step 2: Persona sheet ─────────────
    const sourceTypesUsed = [...new Set(kbEntries.map(e => e.source_type))]
    const { system: s2, user: u2 } = buildPersonaSheetPrompt(extractedText, {
      kb_entry_count: kbEntries.length,
      source_types_used: sourceTypesUsed,
    })
    console.log('[persona/regenerate:step2] building persona sheet')
    const r2 = await openai.chat.completions.create({
      model: 'gpt-5.4',
      messages: [{ role: 'system', content: s2 }, { role: 'user', content: u2 }],
      temperature: 0.3,
      response_format: { type: 'json_object' },
    })
    const rawJson = r2.choices[0]?.message?.content
    if (!rawJson) return NextResponse.json({ error: 'No response from AI' }, { status: 500 })

    let personaData: Record<string, unknown>
    try {
      personaData = JSON.parse(rawJson)
    } catch {
      console.error('[persona/regenerate:step2] JSON parse failed:', rawJson)
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

    // Generate advisory if any self_intro entries were used
    let advisory: string | null = null
    const selfIntroEntries = kbEntries.filter(e => e.source_type === 'self_intro')
    if (selfIntroEntries.length > 0) {
      const advisoryPrompt = buildAdvisoryPrompt(selfIntroEntries)
      const advisoryCompletion = await openai.chat.completions.create({
        model: 'gpt-5.4',
        messages: [{ role: 'user', content: advisoryPrompt }],
        temperature: 0.7,
      })
      advisory = advisoryCompletion.choices[0]?.message?.content ?? null
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
          advisory: advisory ?? null,
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
      ...(advisory != null ? { advisory } : {}),
    })
  } catch (err: any) {
    console.error('[persona/regenerate]', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
