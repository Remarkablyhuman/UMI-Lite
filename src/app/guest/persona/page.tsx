'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const SOURCE_TYPES = [
  { value: 'self_intro', label: '自我介绍' },
  { value: 'interview', label: '访谈记录' },
  { value: 'qa', label: '问答' },
  { value: 'case_study', label: '案例研究' },
  { value: 'update_patch', label: '更新补充' },
]

type KbEntry = {
  id: string
  raw_text: string
  source_type: string
  consent: boolean
  created_at: string
}

type VersionRow = {
  id: string
  version: number
  note: string | null
  created_at: string
}

type ActivePersona = {
  profile_data: Record<string, unknown>
  updated_at: string
}

// ── Markdown builder ──────────────────────────────────────────────────────────

function s(v: unknown): string { return v != null ? String(v) : '' }
function arr(v: unknown): string[] {
  if (!Array.isArray(v)) return []
  return v.filter(x => x != null).map(x => typeof x === 'string' ? x : JSON.stringify(x))
}
function objArr(v: unknown): Record<string, unknown>[] {
  if (!Array.isArray(v)) return []
  return v.filter(x => x != null && typeof x === 'object') as Record<string, unknown>[]
}

function buildPersonaMarkdown(d: Record<string, unknown>): string {
  const meta     = (d.meta          ?? {}) as Record<string, unknown>
  const core     = (d.core          ?? {}) as Record<string, unknown>
  const content  = (d.content_system ?? {}) as Record<string, unknown>
  const voice    = (d.voice_style   ?? {}) as Record<string, unknown>
  const bounds   = (d.boundaries    ?? {}) as Record<string, unknown>
  const growth   = (d.growth        ?? {}) as Record<string, unknown>
  const modules  = objArr(d.modules)
  const evidence = (d.evidence      ?? {}) as Record<string, unknown>

  const lines: string[] = []
  const add = (...l: string[]) => lines.push(...l)

  // Title
  add(`# 《${s(core.display_name)}｜角色说明书》`, '', '---', '')

  // 核心定位
  add('## 核心定位', '')
  add(`**${s(core.positioning)}**`, '')
  add(`**领域：** ${s(core.domain)}`, '')
  add('**专业方向：**')
  for (const e of arr(core.expertise_areas)) add(`- ${e}`)
  add('')
  add('**背景简介：**', s(core.background_summary), '', '---', '')

  // 内容体系
  add('## 内容体系', '')
  add('**核心话题：**')
  for (const t of arr(content.core_topics)) add(`- ${t}`)
  add('')
  add('**内容支柱：**')
  for (const p of arr(content.content_pillars)) add(`- ${p}`)
  add('')
  add('**叙事方式：**', s(content.storytelling_approach), '')
  add('**偏好形式：**')
  for (const f of arr(content.preferred_formats)) add(`- ${f}`)
  add('', '---', '')

  // 表达风格
  add('## 表达风格', '')
  add('**整体语气：**', s(voice.tone), '')
  add('**语言模式：**', s(voice.language_pattern), '')
  add('**标志性表达：**')
  for (const e of arr(voice.signature_expressions)) add(`- ${e}`)
  add('')
  add('**禁用表达：**')
  for (const e of arr(voice.taboo_expressions)) add(`- ${e}`)
  add('', '---', '')

  // 内容边界
  add('## 内容边界', '')
  add('**核心价值观：**')
  for (const v of arr(bounds.values)) add(`- ${v}`)
  add('')
  add('**禁止内容：**')
  for (const h of arr(bounds.hard_limits)) add(`- ${h}`)
  add('')
  add('**尽量避免：**')
  for (const p of arr(bounds.preferred_avoid)) add(`- ${p}`)
  add('', '---', '')

  // 成长轨迹
  add('## 成长轨迹', '')
  add('**关键里程碑：**')
  for (const m of arr(growth.key_milestones)) add(`- ${m}`)
  add('')
  add('**当前阶段：**', s(growth.current_stage), '')
  add('**下一步重点：**', s(growth.next_focus), '', '---', '')

  // 扩展模块
  add('## 扩展模块', '')
  if (modules.length === 0) {
    add('（暂无扩展模块）', '')
  } else {
    for (const m of modules) {
      add(`### ${s(m.name)}`, '')
      add(s(m.description), '')
      if (m.example_from_kb) add(`**知识库示例：** ${s(m.example_from_kb)}`, '')
    }
  }
  add('---', '')

  // 论据与素材
  add('## 论据与素材', '')
  add('**核心引用：**')
  for (const q of objArr(evidence.key_quotes)) {
    add(`- 「${s(q.quote)}」（${s(q.source_type)}）`)
  }
  add('')
  add('**典型案例：**')
  for (const c of objArr(evidence.concrete_cases)) {
    add(`- **${s(c.case)}**${s(c.context) ? `：${s(c.context)}` : ''}`)
  }
  add('', '---', '')

  // Footer
  add(`> 本角色说明书由系统基于嘉宾知识库自动生成与更新。`)
  add(`> 当前版本：v${s(d.schema_version)}`)
  add(`> 生成时间：${s(meta.generated_at)}`)
  add(`> 知识库条目：${s(meta.kb_entry_count)} 条`)

  return lines.join('\n')
}

// ── Inline markdown renderer ──────────────────────────────────────────────────

function renderInline(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/)
  return parts.map((part, i) =>
    part.startsWith('**') && part.endsWith('**')
      ? <strong key={i} style={{ color: '#e0e0e0' }}>{part.slice(2, -2)}</strong>
      : part
  )
}

function MarkdownView({ md }: { md: string }) {
  const elements: React.ReactNode[] = []
  const lines = md.split('\n')
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    if (line.startsWith('### ')) {
      elements.push(
        <h3 key={i} style={{ fontSize: 16, fontWeight: 600, color: '#ccc', margin: '20px 0 6px', letterSpacing: 0.3 }}>
          {renderInline(line.slice(4))}
        </h3>
      )
    } else if (line.startsWith('## ')) {
      elements.push(
        <h2 key={i} style={{ fontSize: 19, fontWeight: 700, color: '#e8e8e8', margin: '32px 0 10px', paddingBottom: 6, borderBottom: '1px solid #222' }}>
          {renderInline(line.slice(3))}
        </h2>
      )
    } else if (line.startsWith('# ')) {
      elements.push(
        <h1 key={i} style={{ fontSize: 22, fontWeight: 700, color: '#f0f0f0', margin: '0 0 16px' }}>
          {renderInline(line.slice(2))}
        </h1>
      )
    } else if (line === '---') {
      elements.push(<hr key={i} style={{ border: 'none', borderTop: '1px solid #1e1e1e', margin: '16px 0' }} />)
    } else if (line.startsWith('> ')) {
      // Collect consecutive blockquote lines
      const bqLines: string[] = []
      while (i < lines.length && lines[i].startsWith('> ')) {
        bqLines.push(lines[i].slice(2))
        i++
      }
      elements.push(
        <blockquote key={`bq-${i}`} style={{ borderLeft: '3px solid #2a2a2a', paddingLeft: 16, margin: '8px 0', color: '#555', fontSize: 13 }}>
          {bqLines.map((bl, bi) => <div key={bi}>{renderInline(bl)}</div>)}
        </blockquote>
      )
      continue
    } else if (line.startsWith('- ')) {
      // Collect consecutive list items
      const items: React.ReactNode[] = []
      while (i < lines.length && lines[i].startsWith('- ')) {
        items.push(<li key={i} style={{ color: '#aaa', marginBottom: 3 }}>{renderInline(lines[i].slice(2))}</li>)
        i++
      }
      elements.push(<ul key={`ul-${i}`} style={{ paddingLeft: 20, margin: '4px 0 10px', listStyle: 'disc' }}>{items}</ul>)
      continue
    } else if (line.trim() !== '') {
      elements.push(
        <p key={i} style={{ color: '#aaa', margin: '3px 0 8px', lineHeight: 1.75, fontSize: 15 }}>
          {renderInline(line)}
        </p>
      )
    }

    i++
  }

  return <div style={{ lineHeight: 1.75 }}>{elements}</div>
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function GuestPersonaPage() {
  const router = useRouter()
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState<string | null>(null)

  const [rawText, setRawText] = useState('')
  const [sourceType, setSourceType] = useState('self_intro')
  const [consent, setConsent] = useState(false)
  const [kbSubmitting, setKbSubmitting] = useState(false)
  const [kbMsg, setKbMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const [audioFile, setAudioFile] = useState<File | null>(null)
  const [transcribing, setTranscribing] = useState(false)
  const audioInputRef = useRef<HTMLInputElement>(null)

  const [kbEntries, setKbEntries] = useState<KbEntry[]>([])
  const [activePersona, setActivePersona] = useState<ActivePersona | null>(null)
  const [versions, setVersions] = useState<VersionRow[]>([])
  const [generating, setGenerating] = useState(false)
  const [genMsg, setGenMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [advisory, setAdvisory] = useState<string | null>(null)
  const [rollingBack, setRollingBack] = useState<number | null>(null)

  const loadData = useCallback(async (uid: string) => {
    const [kbRes, personaRes, versionsRes] = await Promise.all([
      supabase
        .from('guest_kb_entries')
        .select('id, raw_text, source_type, consent, created_at')
        .eq('guest_id', uid)
        .order('created_at', { ascending: false })
        .limit(50),
      supabase
        .from('guest_profiles')
        .select('profile_data, updated_at')
        .eq('guest_id', uid)
        .maybeSingle(),
      supabase
        .from('guest_profile_versions')
        .select('id, version, note, created_at')
        .eq('guest_id', uid)
        .order('version', { ascending: false })
        .limit(20),
    ])
    setKbEntries((kbRes.data ?? []) as KbEntry[])
    setActivePersona((personaRes.data as ActivePersona) ?? null)
    setVersions((versionsRes.data ?? []) as VersionRow[])
  }, [])

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace('/login'); return }

      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()

      if (!profile) { router.replace('/login'); return }
      if (profile.role !== 'guest') { router.replace('/'); return }

      setUserId(user.id)
      await loadData(user.id)
      setLoading(false)
    }
    init()
  }, [])

  async function handleTranscribe() {
    if (!audioFile) return
    setTranscribing(true)
    setKbMsg(null)
    const fd = new FormData()
    fd.append('file', audioFile)
    const res = await fetch('/api/kb/transcribe', { method: 'POST', body: fd })
    const json = await res.json()
    setTranscribing(false)
    if (!res.ok) { setKbMsg({ ok: false, text: json.error ?? '转录失败' }); return }
    setRawText(prev => prev ? prev + '\n\n' + json.text : json.text)
    setAudioFile(null)
    if (audioInputRef.current) audioInputRef.current.value = ''
  }

  async function handleKbSubmit(e: React.FormEvent) {
    e.preventDefault()
    setKbSubmitting(true)
    setKbMsg(null)

    const res = await fetch('/api/kb/ingest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ raw_text: rawText, source_type: sourceType, consent }),
    })
    const json = await res.json()

    if (!res.ok) {
      setKbMsg({ ok: false, text: json.error ?? '提交失败' })
    } else {
      setKbMsg({ ok: true, text: `已拆分为 ${json.chunk_count} 个片段并入库` })
      setRawText('')
      setConsent(false)
      if (userId) await loadData(userId)
    }
    setKbSubmitting(false)
  }

  async function handleRegenerate() {
    setGenerating(true)
    setGenMsg(null)

    const res = await fetch('/api/persona/regenerate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    const json = await res.json()

    if (!res.ok) {
      if (res.status === 429) {
        const mins = Math.ceil((json.retry_after_seconds ?? 600) / 60)
        setGenMsg({ ok: false, text: `生成过于频繁，请 ${mins} 分钟后再试` })
      } else if (res.status === 409) {
        setGenMsg({ ok: false, text: json.error ?? '知识库条目不足' })
      } else {
        setGenMsg({ ok: false, text: json.error ?? '生成失败' })
      }
    } else {
      setGenMsg({ ok: true, text: `已生成 v${json.version}（使用 ${json.kb_entries_used} 条知识库）` })
      setAdvisory(json.advisory ?? null)
      if (userId) await loadData(userId)
    }
    setGenerating(false)
  }

  async function handleRollback(version: number) {
    setRollingBack(version)
    setGenMsg(null)

    const res = await fetch('/api/persona/rollback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ version }),
    })
    const json = await res.json()

    if (!res.ok) {
      setGenMsg({ ok: false, text: json.error ?? '回滚失败' })
    } else {
      setGenMsg({ ok: true, text: `已回滚至 v${json.rolled_back_to_version}` })
      if (userId) await loadData(userId)
    }
    setRollingBack(null)
  }

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.replace('/login')
  }

  if (loading) return (
    <div style={{ padding: 48, background: '#111', minHeight: '100vh', color: '#f0f0f0' }}>
      Loading...
    </div>
  )

  const currentVersion = versions[0]?.version ?? null

  return (
    <div style={{ minHeight: '100vh', background: '#111', color: '#f0f0f0' }}>
      <div style={{ maxWidth: 1080, margin: '0 auto', padding: 48, fontFamily: 'monospace' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 48 }}>
          <h1 style={{ fontSize: 30, fontWeight: 700 }}>UMI — 我的画像</h1>
          <div style={{ display: 'flex', gap: 12 }}>
            <button
              onClick={() => router.push('/guest/inbox')}
              style={{ fontSize: 18, cursor: 'pointer', background: 'none', border: '1px solid #2a2a2a', padding: '6px 15px', color: '#888' }}
            >
              ← 任务
            </button>
            <button
              onClick={handleSignOut}
              style={{ fontSize: 18, cursor: 'pointer', background: 'none', border: '1px solid #2a2a2a', padding: '6px 15px', color: '#888' }}
            >
              退出登录
            </button>
          </div>
        </div>

        {/* ── KB Submit ── */}
        <section style={{ marginBottom: 60 }}>
          <h2 style={{ fontSize: 21, fontWeight: 600, marginBottom: 24, color: '#aaa' }}>
            提交知识库内容
          </h2>
          <form onSubmit={handleKbSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <select
              value={sourceType}
              onChange={e => setSourceType(e.target.value)}
              style={{ padding: '10px 14px', fontSize: 18, background: '#1a1a1a', color: '#f0f0f0', border: '1px solid #2a2a2a', outline: 'none' }}
            >
              {SOURCE_TYPES.map(st => (
                <option key={st.value} value={st.value}>{st.label}</option>
              ))}
            </select>

            {/* Audio upload */}
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <input
                ref={audioInputRef}
                type="file"
                accept="audio/*"
                style={{ display: 'none' }}
                onChange={e => setAudioFile(e.target.files?.[0] ?? null)}
              />
              <button
                type="button"
                onClick={() => audioInputRef.current?.click()}
                style={{ padding: '8px 18px', fontSize: 17, background: '#1a1a1a', color: '#888', border: '1px solid #2a2a2a', cursor: 'pointer' }}
              >
                {audioFile ? audioFile.name : '上传音频文件（可选）'}
              </button>
              {audioFile && (
                <button
                  type="button"
                  onClick={handleTranscribe}
                  disabled={transcribing}
                  style={{ padding: '8px 18px', fontSize: 17, background: '#1a1a1a', color: transcribing ? '#555' : '#6ee7b7', border: '1px solid #2a2a2a', cursor: transcribing ? 'wait' : 'pointer' }}
                >
                  {transcribing ? '转录中…' : '转录为文字'}
                </button>
              )}
            </div>

            <div style={{ position: 'relative' }}>
              <textarea
                value={rawText}
                onChange={e => setRawText(e.target.value)}
                placeholder="粘贴或输入内容……（至少 200 字符）"
                rows={8}
                style={{
                  width: '100%', boxSizing: 'border-box',
                  padding: '12px 14px', paddingBottom: 32,
                  fontSize: 18, background: '#1a1a1a', color: '#f0f0f0',
                  border: `1px solid ${rawText.trim().length > 0 && rawText.trim().length < 200 ? '#7f1d1d' : '#2a2a2a'}`,
                  outline: 'none', resize: 'vertical', lineHeight: 1.7,
                }}
              />
              <span style={{ position: 'absolute', bottom: 8, right: 12, fontSize: 13, color: rawText.trim().length < 200 ? '#555' : '#6ee7b7', pointerEvents: 'none' }}>
                {rawText.trim().length} / 200
              </span>
            </div>

            <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 17, cursor: 'pointer', color: '#ccc' }}>
              <input
                type="checkbox"
                checked={consent}
                onChange={e => setConsent(e.target.checked)}
                style={{ width: 18, height: 18, cursor: 'pointer' }}
              />
              允许将此内容用于生成画像
            </label>

            {kbMsg && (
              <p style={{ fontSize: 17, color: kbMsg.ok ? '#6ee7b7' : '#f87171', margin: 0 }}>
                {kbMsg.text}
              </p>
            )}

            <button
              type="submit"
              disabled={kbSubmitting || rawText.trim().length < 200}
              style={{ padding: '12px', fontSize: 19, fontWeight: 600, background: '#f0f0f0', color: '#111', border: 'none', cursor: 'pointer', opacity: kbSubmitting || rawText.trim().length < 200 ? 0.5 : 1 }}
            >
              {kbSubmitting ? '处理中…' : '提交入库'}
            </button>
          </form>
        </section>

        {/* ── KB List ── */}
        <section style={{ marginBottom: 60 }}>
          <h2 style={{ fontSize: 21, fontWeight: 600, marginBottom: 18, color: '#aaa' }}>
            知识库 ({kbEntries.length} 条)
          </h2>
          {kbEntries.length === 0
            ? <p style={{ fontSize: 18, color: '#444' }}>暂无内容</p>
            : (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {kbEntries.map(entry => (
                  <div key={entry.id} style={{ padding: '14px 0', borderBottom: '1px solid #1e1e1e' }}>
                    <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 6 }}>
                      <span style={{ fontSize: 14, color: '#555', minWidth: 90 }}>
                        {new Date(entry.created_at).toLocaleDateString('zh-CN')}
                      </span>
                      <span style={{ fontSize: 14, color: '#666', background: '#1a1a1a', padding: '2px 8px', border: '1px solid #2a2a2a' }}>
                        {SOURCE_TYPES.find(st => st.value === entry.source_type)?.label ?? entry.source_type}
                      </span>
                      <span style={{ fontSize: 14, color: entry.consent ? '#6ee7b7' : '#555' }}>
                        {entry.consent ? '✓ 可用' : '× 仅存档'}
                      </span>
                    </div>
                    <p style={{ fontSize: 16, color: '#888', margin: 0, whiteSpace: 'pre-wrap', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' }}>
                      {entry.raw_text}
                    </p>
                  </div>
                ))}
              </div>
            )
          }
        </section>

        {/* ── Persona ── */}
        <section>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
            <h2 style={{ fontSize: 21, fontWeight: 600, color: '#aaa', margin: 0 }}>
              我的画像 {currentVersion !== null ? `(当前 v${currentVersion})` : ''}
            </h2>
            <button
              onClick={handleRegenerate}
              disabled={generating}
              style={{ fontSize: 18, padding: '8px 18px', cursor: 'pointer', background: generating ? '#1a1a1a' : '#f0f0f0', color: generating ? '#555' : '#111', border: '1px solid #2a2a2a', opacity: generating ? 0.7 : 1 }}
            >
              {generating ? '生成中…' : '重新生成'}
            </button>
          </div>

          {genMsg && (
            <p style={{ fontSize: 17, color: genMsg.ok ? '#6ee7b7' : '#f87171', marginBottom: 18 }}>
              {genMsg.text}
            </p>
          )}

          {advisory && (
            <div style={{ background: '#0d1a14', border: '1px solid #1a3326', padding: '28px 32px', marginBottom: 32 }}>
              <h3 style={{ fontSize: 17, fontWeight: 600, color: '#6ee7b7', margin: '0 0 16px', letterSpacing: 0.3 }}>
                社媒视频创作建议
              </h3>
              <p style={{ fontSize: 15, color: '#a0c4b4', lineHeight: 1.85, margin: 0, whiteSpace: 'pre-wrap' }}>
                {advisory}
              </p>
            </div>
          )}

          {activePersona ? (
            <div style={{ background: '#0a0a0a', border: '1px solid #1e1e1e', padding: '32px 36px', marginBottom: 36 }}>
              <MarkdownView md={buildPersonaMarkdown(activePersona.profile_data)} />
            </div>
          ) : (
            <p style={{ fontSize: 18, color: '#444', marginBottom: 36 }}>
              尚未生成画像。提交至少 1 条允许使用的知识库内容（≥ 200 字符）后，点击「重新生成」。
            </p>
          )}

          {/* Version history */}
          {versions.length > 0 && (
            <>
              <h3 style={{ fontSize: 18, fontWeight: 600, color: '#555', marginBottom: 14 }}>版本历史</h3>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {versions.map(v => (
                  <div key={v.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid #1a1a1a' }}>
                    <div style={{ display: 'flex', gap: 18, alignItems: 'center' }}>
                      <span style={{ fontSize: 17, fontWeight: 600, minWidth: 36 }}>v{v.version}</span>
                      <span style={{ fontSize: 15, color: '#555' }}>
                        {new Date(v.created_at).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                      </span>
                      {v.note && <span style={{ fontSize: 14, color: '#444' }}>{v.note}</span>}
                    </div>
                    {v.version !== currentVersion ? (
                      <button
                        onClick={() => handleRollback(v.version)}
                        disabled={rollingBack === v.version}
                        style={{ fontSize: 15, padding: '4px 12px', cursor: 'pointer', background: 'none', border: '1px solid #2a2a2a', color: '#888', opacity: rollingBack === v.version ? 0.5 : 1 }}
                      >
                        {rollingBack === v.version ? '…' : '回滚'}
                      </button>
                    ) : (
                      <span style={{ fontSize: 14, color: '#555' }}>当前</span>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </section>

      </div>
    </div>
  )
}
