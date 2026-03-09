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

type KbEntry = { id: string; raw_text: string; source_type: string; consent: boolean; created_at: string }
type VersionRow = { id: string; version: number; note: string | null; created_at: string }
type ActivePersona = { profile_data: Record<string, unknown>; updated_at: string }

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
  const meta = (d.meta ?? {}) as Record<string, unknown>
  const core = (d.core ?? {}) as Record<string, unknown>
  const content = (d.content_system ?? {}) as Record<string, unknown>
  const voice = (d.voice_style ?? {}) as Record<string, unknown>
  const bounds = (d.boundaries ?? {}) as Record<string, unknown>
  const growth = (d.growth ?? {}) as Record<string, unknown>
  const modules = objArr(d.modules)
  const evidence = (d.evidence ?? {}) as Record<string, unknown>
  const lines: string[] = []
  const add = (...l: string[]) => lines.push(...l)

  add(`# 《${s(core.display_name)}｜角色说明书》`, '', '---', '')
  add('## 核心定位', '', `**${s(core.positioning)}**`, '', `**领域：** ${s(core.domain)}`, '', '**专业方向：**')
  for (const e of arr(core.expertise_areas)) add(`- ${e}`)
  add('', '**背景简介：**', s(core.background_summary), '', '---', '')
  add('## 内容体系', '', '**核心话题：**')
  for (const t of arr(content.core_topics)) add(`- ${t}`)
  add('', '**内容支柱：**')
  for (const p of arr(content.content_pillars)) add(`- ${p}`)
  add('', `**叙事方式：**`, s(content.storytelling_approach), '', '**偏好形式：**')
  for (const f of arr(content.preferred_formats)) add(`- ${f}`)
  add('', '---', '')
  add('## 表达风格', '', `**整体语气：**`, s(voice.tone), '', `**语言模式：**`, s(voice.language_pattern), '', '**标志性表达：**')
  for (const e of arr(voice.signature_expressions)) add(`- ${e}`)
  add('', '**禁用表达：**')
  for (const e of arr(voice.taboo_expressions)) add(`- ${e}`)
  add('', '---', '')
  add('## 内容边界', '', '**核心价值观：**')
  for (const v of arr(bounds.values)) add(`- ${v}`)
  add('', '**禁止内容：**')
  for (const h of arr(bounds.hard_limits)) add(`- ${h}`)
  add('', '**尽量避免：**')
  for (const p of arr(bounds.preferred_avoid)) add(`- ${p}`)
  add('', '---', '')
  add('## 成长轨迹', '', '**关键里程碑：**')
  for (const m of arr(growth.key_milestones)) add(`- ${m}`)
  add('', `**当前阶段：**`, s(growth.current_stage), '', `**下一步重点：**`, s(growth.next_focus), '', '---', '')
  add('## 扩展模块', '')
  if (modules.length === 0) { add('（暂无扩展模块）', '') } else {
    for (const m of modules) {
      add(`### ${s(m.name)}`, '', s(m.description), '')
      if (m.example_from_kb) add(`**知识库示例：** ${s(m.example_from_kb)}`, '')
    }
  }
  add('---', '')
  add('## 论据与素材', '', '**核心引用：**')
  for (const q of objArr(evidence.key_quotes)) add(`- 「${s(q.quote)}」（${s(q.source_type)}）`)
  add('', '**典型案例：**')
  for (const c of objArr(evidence.concrete_cases)) add(`- **${s(c.case)}**${s(c.context) ? `：${s(c.context)}` : ''}`)
  add('', '---', '')
  add(`> 本角色说明书由系统基于嘉宾知识库自动生成与更新。`, `> 当前版本：v${s(d.schema_version)}`, `> 生成时间：${s(meta.generated_at)}`, `> 知识库条目：${s(meta.kb_entry_count)} 条`)
  return lines.join('\n')
}

function renderInline(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/)
  return parts.map((part, i) =>
    part.startsWith('**') && part.endsWith('**')
      ? <strong key={i} style={{ color: '#d8d4cc' }}>{part.slice(2, -2)}</strong>
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
      elements.push(<h3 key={i} style={{ fontSize: 14, fontWeight: 600, color: '#c0bcb4', margin: '18px 0 5px', letterSpacing: 0.3 }}>{renderInline(line.slice(4))}</h3>)
    } else if (line.startsWith('## ')) {
      elements.push(<h2 key={i} style={{ fontSize: 17, fontWeight: 700, color: '#e8e4dc', margin: '28px 0 8px', paddingBottom: 6, borderBottom: '1px solid #242424' }}>{renderInline(line.slice(3))}</h2>)
    } else if (line.startsWith('# ')) {
      elements.push(<h1 key={i} style={{ fontSize: 20, fontWeight: 700, color: '#e8e4dc', margin: '0 0 14px' }}>{renderInline(line.slice(2))}</h1>)
    } else if (line === '---') {
      elements.push(<hr key={i} style={{ border: 'none', borderTop: '1px solid #1c1c1c', margin: '14px 0' }} />)
    } else if (line.startsWith('> ')) {
      const bqLines: string[] = []
      while (i < lines.length && lines[i].startsWith('> ')) { bqLines.push(lines[i].slice(2)); i++ }
      elements.push(<blockquote key={`bq-${i}`} style={{ borderLeft: '2px solid #2a2a2a', paddingLeft: 14, margin: '6px 0', color: '#5a5650', fontSize: 12 }}>{bqLines.map((bl, bi) => <div key={bi}>{renderInline(bl)}</div>)}</blockquote>)
      continue
    } else if (line.startsWith('- ')) {
      const items: React.ReactNode[] = []
      while (i < lines.length && lines[i].startsWith('- ')) { items.push(<li key={i} style={{ color: '#a0a098', marginBottom: 2 }}>{renderInline(lines[i].slice(2))}</li>); i++ }
      elements.push(<ul key={`ul-${i}`} style={{ paddingLeft: 18, margin: '3px 0 8px', listStyle: 'disc' }}>{items}</ul>)
      continue
    } else if (line.trim() !== '') {
      elements.push(<p key={i} style={{ color: '#a0a098', margin: '2px 0 6px', lineHeight: 1.75, fontSize: 14 }}>{renderInline(line)}</p>)
    }
    i++
  }
  return <div style={{ lineHeight: 1.75 }}>{elements}</div>
}

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
  const [audioError, setAudioError] = useState<string | null>(null)
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
      supabase.from('guest_kb_entries').select('id, raw_text, source_type, consent, created_at').eq('guest_id', uid).order('created_at', { ascending: false }).limit(50),
      supabase.from('guest_profiles').select('profile_data, advisory, updated_at').eq('guest_id', uid).maybeSingle(),
      supabase.from('guest_profile_versions').select('id, version, note, created_at').eq('guest_id', uid).order('version', { ascending: false }).limit(20),
    ])
    setKbEntries((kbRes.data ?? []) as KbEntry[])
    setActivePersona((personaRes.data as ActivePersona) ?? null)
    setAdvisory((personaRes.data as any)?.advisory ?? null)
    setVersions((versionsRes.data ?? []) as VersionRow[])
  }, [])

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace('/login'); return }
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
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
    setTranscribing(true); setAudioError(null)
    const fd = new FormData(); fd.append('file', audioFile)
    const res = await fetch('/api/kb/transcribe', { method: 'POST', body: fd })
    let json: any = {}
    try { json = await res.json() } catch {}
    setTranscribing(false)
    if (res.status === 413) { setAudioError('音频文件过大，请上传小于 25MB 的文件'); return }
    if (!res.ok) { setAudioError(json.error ?? '转录失败'); return }
    setRawText(prev => prev ? prev + '\n\n' + json.text : json.text)
    setAudioFile(null)
    if (audioInputRef.current) audioInputRef.current.value = ''
  }

  async function handleKbSubmit(e: React.FormEvent) {
    e.preventDefault(); setKbSubmitting(true); setKbMsg(null)
    const res = await fetch('/api/kb/ingest', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ raw_text: rawText, source_type: sourceType, consent }),
    })
    const json = await res.json()
    if (!res.ok) { setKbMsg({ ok: false, text: json.error ?? '提交失败' }) } else {
      setKbMsg({ ok: true, text: `已拆分为 ${json.chunk_count} 个片段并入库` })
      setRawText(''); setConsent(false)
      if (userId) await loadData(userId)
    }
    setKbSubmitting(false)
  }

  async function handleRegenerate() {
    setGenerating(true); setGenMsg(null)
    const res = await fetch('/api/persona/regenerate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) })
    const json = await res.json()
    if (!res.ok) {
      if (res.status === 429) { const mins = Math.ceil((json.retry_after_seconds ?? 600) / 60); setGenMsg({ ok: false, text: `生成过于频繁，请 ${mins} 分钟后再试` }) }
      else if (res.status === 409) { setGenMsg({ ok: false, text: json.error ?? '知识库条目不足' }) }
      else { setGenMsg({ ok: false, text: json.error ?? '生成失败' }) }
    } else {
      setGenMsg({ ok: true, text: `已生成 v${json.version}（使用 ${json.kb_entries_used} 条知识库）` })
      setAdvisory(json.advisory ?? null)
      if (userId) await loadData(userId)
    }
    setGenerating(false)
  }

  async function handleRollback(version: number) {
    setRollingBack(version); setGenMsg(null)
    const res = await fetch('/api/persona/rollback', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ version }) })
    const json = await res.json()
    if (!res.ok) { setGenMsg({ ok: false, text: json.error ?? '回滚失败' }) } else {
      setGenMsg({ ok: true, text: `已回滚至 v${json.rolled_back_to_version}` })
      if (userId) await loadData(userId)
    }
    setRollingBack(null)
  }

  async function handleSignOut() { await supabase.auth.signOut(); router.replace('/login') }

  if (loading) return (
    <>
      <style>{css}</style>
      <div className="shell">
        <div className="loading-state">
          <span className="dot" /><span className="dot" style={{ animationDelay: '.15s' }} /><span className="dot" style={{ animationDelay: '.3s' }} />
        </div>
      </div>
    </>
  )

  const currentVersion = versions[0]?.version ?? null

  return (
    <>
      <style>{css}</style>
      <div className="shell">

        <header className="header">
          <div className="header-left">
            <div className="brand-mark">U</div>
            <div>
              <h1 className="brand-title">UMI</h1>
              <p className="brand-sub">我的画像</p>
            </div>
          </div>
          <nav className="header-nav">
            <button className="nav-btn" onClick={() => router.push('/guest/inbox')}>← 任务</button>
            <button className="nav-btn nav-btn--ghost" onClick={handleSignOut}>退出</button>
          </nav>
        </header>

        <main className="main">

          {/* ── KB Submit ── */}
          <section className="section">
            <h2 className="section-title">提交知识库内容</h2>
            <form onSubmit={handleKbSubmit} className="form-stack">
              <select className="form-select" value={sourceType} onChange={e => setSourceType(e.target.value)}>
                {SOURCE_TYPES.map(st => <option key={st.value} value={st.value}>{st.label}</option>)}
              </select>

              <div className="audio-row">
                <input ref={audioInputRef} type="file" accept="audio/*" style={{ display: 'none' }}
                  onChange={e => { setAudioFile(e.target.files?.[0] ?? null); setAudioError(null) }} />
                <button type="button" className="btn-ghost" onClick={() => audioInputRef.current?.click()}>
                  {audioFile ? audioFile.name : '上传音频文件（可选）'}
                </button>
                {audioFile && (
                  <button type="button" className={`btn-ghost btn-ghost--green`} onClick={handleTranscribe} disabled={transcribing}>
                    {transcribing ? '转录中…' : '转录为文字'}
                  </button>
                )}
              </div>

              {audioError && <p className="msg-err">{audioError}</p>}

              <div className="textarea-wrap">
                <textarea
                  className={`main-textarea ${rawText.trim().length > 0 && rawText.trim().length < 200 ? 'main-textarea--warn' : ''}`}
                  value={rawText}
                  onChange={e => setRawText(e.target.value)}
                  placeholder="粘贴或输入内容……（至少 200 字符）"
                  rows={8}
                />
                <span className={`char-count ${rawText.trim().length < 200 ? '' : 'char-count--ok'}`}>
                  {rawText.trim().length} / 200
                </span>
              </div>

              <label className="consent-label">
                <input type="checkbox" className="consent-checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} />
                允许将此内容用于生成画像
              </label>

              {kbMsg && <p className={kbMsg.ok ? 'msg-ok' : 'msg-err'}>{kbMsg.text}</p>}

              <button type="submit" className="btn-primary" disabled={kbSubmitting || rawText.trim().length < 200}>
                {kbSubmitting ? '处理中…' : '提交入库'}
              </button>
            </form>
          </section>

          {/* ── KB List ── */}
          <section className="section">
            <h2 className="section-title">知识库 <span className="section-count">({kbEntries.length})</span></h2>
            {kbEntries.length === 0
              ? <p className="empty-text">暂无内容</p>
              : (
                <div className="kb-list">
                  {kbEntries.map(entry => (
                    <div key={entry.id} className="kb-entry">
                      <div className="kb-entry-meta">
                        <span className="kb-date">{new Date(entry.created_at).toLocaleDateString('zh-CN')}</span>
                        <span className="kb-tag">{SOURCE_TYPES.find(st => st.value === entry.source_type)?.label ?? entry.source_type}</span>
                        <span className={`kb-consent ${entry.consent ? 'kb-consent--ok' : ''}`}>{entry.consent ? '✓ 可用' : '× 仅存档'}</span>
                      </div>
                      <p className="kb-preview">{entry.raw_text}</p>
                    </div>
                  ))}
                </div>
              )
            }
          </section>

          {/* ── Persona ── */}
          <section className="section">
            <div className="persona-header">
              <h2 className="section-title" style={{ margin: 0 }}>
                我的画像 {currentVersion !== null && <span className="section-count">(当前 v{currentVersion})</span>}
              </h2>
              <button className="btn-ghost" onClick={handleRegenerate} disabled={generating}>
                {generating ? '生成中…' : '重新生成'}
              </button>
            </div>

            {genMsg && <p className={genMsg.ok ? 'msg-ok' : 'msg-err'} style={{ marginBottom: 16 }}>{genMsg.text}</p>}

            {advisory && (
              <div className="advisory-box">
                <h3 className="advisory-title">社媒视频创作建议</h3>
                <p className="advisory-body">{advisory}</p>
              </div>
            )}

            {activePersona ? (
              <div className="persona-card">
                <MarkdownView md={buildPersonaMarkdown(activePersona.profile_data)} />
              </div>
            ) : (
              <p className="empty-text">尚未生成画像。提交至少 1 条允许使用的知识库内容（≥ 200 字符）后，点击「重新生成」。</p>
            )}

            {versions.length > 0 && (
              <div className="version-history">
                <p className="version-history-label">版本历史</p>
                {versions.map(v => (
                  <div key={v.id} className="version-row">
                    <div className="version-info">
                      <span className="version-num">v{v.version}</span>
                      <span className="version-date">
                        {new Date(v.created_at).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                      </span>
                      {v.note && <span className="version-note">{v.note}</span>}
                    </div>
                    {v.version !== currentVersion ? (
                      <button className="btn-ghost" onClick={() => handleRollback(v.version)} disabled={rollingBack === v.version} style={{ padding: '4px 12px', fontSize: 12 }}>
                        {rollingBack === v.version ? '…' : '回滚'}
                      </button>
                    ) : (
                      <span className="version-current">当前</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>

        </main>
      </div>
    </>
  )
}

const css = `
  @import url('https://fonts.googleapis.com/css2?family=Noto+Serif+SC:wght@400;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap');
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  :root {
    --bg: #0c0c0c; --surface: #141414; --surface2: #1c1c1c;
    --border: #242424; --border2: #2e2e2e;
    --text: #e8e4dc; --text-muted: #5a5650; --text-dim: #3a3834;
    --amber: #e8a020; --amber-dim: #c4861a; --amber-glow: rgba(232,160,32,0.08);
    --green: #5a8a6a; --green-dim: rgba(90,138,106,.15); --red: #c0504a;
    --mono: 'IBM Plex Mono', monospace; --serif: 'Noto Serif SC', serif;
  }
  body { background: var(--bg); color: var(--text); }

  .shell { min-height: 100vh; background: var(--bg); font-family: var(--mono); }

  .loading-state { display:flex; align-items:center; justify-content:center; min-height:100vh; gap:6px; }
  .dot { width:6px; height:6px; border-radius:50%; background:var(--amber); animation:pulse 1s ease-in-out infinite; }
  @keyframes pulse { 0%,100%{opacity:.2;transform:scale(.8);} 50%{opacity:1;transform:scale(1);} }

  .header { display:flex; align-items:center; justify-content:space-between; padding:16px 20px; border-bottom:1px solid var(--border); position:sticky; top:0; background:rgba(12,12,12,.95); backdrop-filter:blur(8px); z-index:10; }
  .header-left { display:flex; align-items:center; gap:12px; }
  .brand-mark { width:36px; height:36px; background:var(--amber); color:#000; font-family:var(--serif); font-size:18px; font-weight:700; display:flex; align-items:center; justify-content:center; flex-shrink:0; }
  .brand-title { font-family:var(--serif); font-size:18px; font-weight:700; letter-spacing:.05em; line-height:1; color:var(--text); }
  .brand-sub { font-size:10px; color:var(--text-muted); letter-spacing:.1em; margin-top:3px; }
  .header-nav { display:flex; align-items:center; gap:8px; }
  .nav-btn { display:flex; align-items:center; gap:6px; padding:7px 12px; font-family:var(--mono); font-size:12px; color:var(--text-muted); background:var(--surface); border:1px solid var(--border); cursor:pointer; transition:color .15s,border-color .15s; white-space:nowrap; }
  .nav-btn:hover { color:var(--text); border-color:var(--border2); }
  .nav-btn--ghost { background:none; border-color:transparent; }
  .nav-btn--ghost:hover { border-color:var(--border); }

  .main { max-width:800px; margin:0 auto; padding:32px 16px 80px; display:flex; flex-direction:column; gap:48px; }

  .section { display:flex; flex-direction:column; gap:0; }
  .section-title { font-family:var(--serif); font-size:18px; font-weight:600; color:var(--text-muted); margin-bottom:20px; }
  .section-count { font-family:var(--mono); font-size:13px; color:var(--text-dim); font-weight:400; }

  .form-stack { display:flex; flex-direction:column; gap:12px; }
  .form-select { width:100%; font-family:var(--mono); font-size:13px; padding:10px 12px; background:var(--surface2); color:var(--text); border:1px solid var(--border); outline:none; cursor:pointer; }
  .form-select:focus { border-color:var(--amber); }

  .audio-row { display:flex; gap:10px; align-items:center; flex-wrap:wrap; }

  .textarea-wrap { position:relative; }
  .main-textarea { width:100%; font-family:var(--mono); font-size:14px; padding:12px; padding-bottom:30px; background:var(--surface2); color:var(--text); border:1px solid var(--border); outline:none; resize:vertical; line-height:1.75; transition:border-color .15s; }
  .main-textarea:focus { border-color:var(--amber); }
  .main-textarea--warn { border-color:#5a2020; }
  .main-textarea::placeholder { color:var(--text-dim); }
  .char-count { position:absolute; bottom:7px; right:10px; font-size:11px; color:var(--text-dim); pointer-events:none; }
  .char-count--ok { color:var(--green); }

  .consent-label { display:flex; align-items:center; gap:10px; font-size:14px; cursor:pointer; color:var(--text-muted); }
  .consent-checkbox { width:16px; height:16px; cursor:pointer; accent-color:var(--amber); }

  .msg-ok { font-size:13px; color:var(--green); padding:8px 12px; border-left:2px solid var(--green); background:var(--green-dim); }
  .msg-err { font-size:13px; color:var(--red); padding:8px 12px; border-left:2px solid var(--red); background:rgba(192,80,74,.1); }

  .btn-ghost { padding:8px 16px; font-family:var(--mono); font-size:12px; font-weight:500; color:var(--text-muted); background:none; border:1px solid var(--border); cursor:pointer; transition:color .15s,border-color .15s; white-space:nowrap; }
  .btn-ghost:hover:not(:disabled) { color:var(--text); border-color:var(--border2); }
  .btn-ghost:disabled { opacity:.5; cursor:not-allowed; }
  .btn-ghost--green { color:var(--green); }
  .btn-ghost--green:hover:not(:disabled) { color:#6aaa7a; }

  .btn-primary { width:100%; padding:12px; font-family:var(--mono); font-size:14px; font-weight:600; color:#000; background:var(--amber); border:none; cursor:pointer; transition:background .15s,opacity .15s; }
  .btn-primary:hover:not(:disabled) { background:#f0ac30; }
  .btn-primary:disabled { opacity:.4; cursor:not-allowed; }

  .empty-text { font-size:14px; color:var(--text-dim); }

  .kb-list { display:flex; flex-direction:column; }
  .kb-entry { padding:14px 0; border-bottom:1px solid var(--border); }
  .kb-entry-meta { display:flex; gap:10px; align-items:center; flex-wrap:wrap; margin-bottom:6px; }
  .kb-date { font-size:12px; color:var(--text-muted); min-width:80px; }
  .kb-tag { font-size:12px; color:var(--text-muted); background:var(--surface2); padding:2px 8px; border:1px solid var(--border); }
  .kb-consent { font-size:12px; color:var(--text-dim); }
  .kb-consent--ok { color:var(--green); }
  .kb-preview { font-size:13px; color:var(--text-muted); white-space:pre-wrap; overflow:hidden; display:-webkit-box; -webkit-line-clamp:3; -webkit-box-orient:vertical; line-height:1.6; }

  .persona-header { display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; margin-bottom:20px; }

  .advisory-box { background:#0a1410; border:1px solid #1a3326; border-left:3px solid var(--green); padding:18px 20px; margin-bottom:20px; }
  .advisory-title { font-size:13px; font-weight:600; color:var(--green); margin-bottom:10px; letter-spacing:.04em; }
  .advisory-body { font-size:13px; color:#8ab09a; line-height:1.85; white-space:pre-wrap; }

  .persona-card { background:#080808; border:1px solid var(--border); padding:clamp(16px,4vw,32px); margin-bottom:24px; }

  .version-history { margin-top:8px; }
  .version-history-label { font-size:10px; font-weight:600; letter-spacing:.18em; text-transform:uppercase; color:var(--text-dim); margin-bottom:12px; }
  .version-row { display:flex; justify-content:space-between; align-items:center; padding:10px 0; border-bottom:1px solid var(--border); }
  .version-info { display:flex; gap:14px; align-items:center; }
  .version-num { font-size:14px; font-weight:600; color:var(--text-muted); min-width:32px; }
  .version-date { font-size:12px; color:var(--text-dim); }
  .version-note { font-size:12px; color:var(--text-dim); }
  .version-current { font-size:12px; color:var(--text-dim); }

  @media (max-width:480px) {
    .header { padding:12px 16px; }
    .brand-mark { width:32px; height:32px; font-size:16px; }
    .brand-title { font-size:16px; }
    .main { padding:20px 12px 80px; gap:36px; }
    .nav-btn { font-size:11px; padding:6px 10px; }
    .audio-row { flex-direction:column; align-items:stretch; }
    .audio-row .btn-ghost { text-align:center; }
  }
`
