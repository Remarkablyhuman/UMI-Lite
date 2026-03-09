'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

type ScriptData = {
  id: string
  reference_id: string
  guest_id: string
  status: string
  script_text: string | null
}

type ReferenceData = {
  id: string
  run_ref_id: string
  url: string
}

const STATUS_LABEL: Record<string, string> = {
  DRAFT: '草稿',
  IN_REVIEW: '审核中',
  APPROVED: '已通过',
  DONE: '已完成',
}

export default function GuestScriptPage() {
  const router = useRouter()
  const { scriptId } = useParams<{ scriptId: string }>()
  const supabase = createClient()

  const [script, setScript] = useState<ScriptData | null>(null)
  const [reference, setReference] = useState<ReferenceData | null>(null)
  const [scriptStatus, setScriptStatus] = useState<string>('')
  const [scriptText, setScriptText] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const [personaData, setPersonaData] = useState<any>(null)
  const [generating, setGenerating] = useState(false)
  const [extraInstructions, setExtraInstructions] = useState('')
  const [genTargetChars, setGenTargetChars] = useState(600)
  const [genPlatform, setGenPlatform] = useState('wechat')
  const [genFormat, setGenFormat] = useState('voice_over')
  const [genPart1, setGenPart1] = useState('')
  const [genPart2, setGenPart2] = useState('')

  const canEdit = scriptStatus === 'DRAFT' && !submitting

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace('/login'); return }

      const { data: profile } = await supabase
        .from('profiles').select('role').eq('id', user.id).single()
      if (!profile || profile.role !== 'guest') { router.replace('/'); return }

      const { data: sc } = await supabase
        .from('scripts')
        .select('id, reference_id, guest_id, status, script_text')
        .eq('id', scriptId).single()

      if (!sc || sc.guest_id !== user.id) { router.replace('/guest/inbox'); return }

      setScript(sc)
      setScriptStatus(sc.status)
      setScriptText(sc.script_text ?? '')

      const { data: ref } = await supabase
        .from('references').select('id, run_ref_id, url').eq('id', sc.reference_id).single()
      setReference(ref ?? null)

      const { data: personaRow } = await supabase
        .from('guest_profiles').select('profile_data').eq('guest_id', user.id).maybeSingle()
      setPersonaData(personaRow?.profile_data ?? {})

      setLoading(false)
    }
    load()
  }, [scriptId])

  async function saveDraft() {
    if (!script) return
    setSaving(true); setMsg(null)
    const finalText = genPart1.trim() || scriptText.trim()
    const { error } = await supabase.from('scripts').update({ script_text: finalText }).eq('id', script.id)
    setSaving(false)
    setMsg(error ? { ok: false, text: error.message } : { ok: true, text: '草稿已保存。' })
  }

  async function submitForReview() {
    if (!script) return
    setSubmitting(true); setMsg(null)
    const finalText = genPart1.trim() || scriptText.trim()
    const { error: scriptErr } = await supabase
      .from('scripts').update({ status: 'IN_REVIEW', script_text: finalText }).eq('id', script.id)
    if (scriptErr) { setMsg({ ok: false, text: scriptErr.message }); setSubmitting(false); return }

    const { error: taskErr } = await supabase.from('tasks').insert({
      type: 'REVIEW_SCRIPT', status: 'OPEN',
      reference_id: script.reference_id, script_id: script.id, assignee_role: 'admin',
    })
    if (taskErr) { setMsg({ ok: false, text: taskErr.message }); setSubmitting(false); return }
    router.push('/guest/inbox')
  }

  async function generateScript() {
    if (!scriptText.trim()) { setMsg({ ok: false, text: '请先在编辑框中输入参考内容，再生成脚本' }); return }
    setGenerating(true); setMsg(null); setGenPart1(''); setGenPart2('')
    try {
      const res = await fetch('/api/guest-generate-script', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          referenceTranscript: scriptText, extraInstructions,
          personaJson: personaData ?? {},
          constraints: { target_chars: genTargetChars, platform: genPlatform, format: genFormat },
        }),
      })
      const data = await res.json()
      if (data.error) { setMsg({ ok: false, text: data.error }); return }
      setGenPart1(data.part1 ?? ''); setGenPart2(data.part2 ?? '')
    } catch (err: any) {
      setMsg({ ok: false, text: err.message ?? '生成失败' })
    } finally {
      setGenerating(false)
    }
  }

  async function handleSignOut() {
    await supabase.auth.signOut(); router.replace('/login')
  }

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

  if (!script || !reference) return (
    <>
      <style>{css}</style>
      <div className="shell"><div style={{ padding: 48, color: 'var(--text-muted)' }}>Script not found.</div></div>
    </>
  )

  return (
    <>
      <style>{css}</style>
      <div className="shell">

        <header className="header">
          <div className="header-left">
            <div className="brand-mark">U</div>
            <div>
              <h1 className="brand-title">UMI</h1>
              <p className="brand-sub">内容创作台</p>
            </div>
          </div>
          <nav className="header-nav">
            <button className="nav-btn" onClick={() => router.push('/guest/inbox')}>← 任务</button>
            <button className="nav-btn nav-btn--ghost" onClick={handleSignOut}>退出</button>
          </nav>
        </header>

        <main className="main">
          <div className="run-ref">{reference.run_ref_id}</div>
          {reference.url && (
            <p className="run-meta">
              参考资料：<a href={reference.url} target="_blank" rel="noopener noreferrer" className="link">{reference.url}</a>
            </p>
          )}
          <div className="status-pill">{STATUS_LABEL[scriptStatus] ?? scriptStatus}</div>

          {canEdit ? (
            <div className="edit-stack">
              {/* Main textarea */}
              <div className="textarea-wrap">
                <textarea
                  className="main-textarea"
                  value={scriptText}
                  onChange={e => setScriptText(e.target.value)}
                  placeholder="在这里输入参考内容或直接写脚本..."
                  rows={16}
                />
                <span className="char-count">{scriptText.trim().length} 字</span>
              </div>

              {/* AI panel */}
              <div className="ai-panel">
                <p className="ai-panel-label">AI 辅助生成</p>
                <div className="field">
                  <label className="field-label">补充说明（可选）</label>
                  <textarea
                    className="ctrl-textarea"
                    value={extraInstructions}
                    onChange={e => setExtraInstructions(e.target.value)}
                    placeholder="如：语气轻松一点，重点突出价格优势"
                    rows={2}
                  />
                </div>
                <div className="ctrl-row">
                  <div className="ctrl-group">
                    <label className="field-label">字数目标</label>
                    <input
                      className="ctrl-input"
                      type="number" value={genTargetChars}
                      onChange={e => setGenTargetChars(Math.min(2000, Math.max(100, Number(e.target.value))))}
                      min={100} max={2000} step={100}
                    />
                  </div>
                  <div className="ctrl-group">
                    <label className="field-label">平台</label>
                    <select className="ctrl-select" value={genPlatform} onChange={e => setGenPlatform(e.target.value)}>
                      <option value="wechat">微信</option>
                      <option value="xhs">小红书</option>
                      <option value="tiktok">抖音</option>
                      <option value="youtube">YouTube</option>
                      <option value="generic">通用</option>
                    </select>
                  </div>
                  <div className="ctrl-group">
                    <label className="field-label">格式</label>
                    <select className="ctrl-select" value={genFormat} onChange={e => setGenFormat(e.target.value)}>
                      <option value="voice_over">旁白</option>
                      <option value="on_camera">出镜</option>
                      <option value="mixed">混合</option>
                    </select>
                  </div>
                </div>
                <div className="ai-btn-row">
                  <button className="btn-amber" onClick={generateScript} disabled={generating}>
                    {generating ? 'AI 生成中…' : 'AI 生成脚本'}
                  </button>
                  <span className="ai-hint">* 基于上方内容生成</span>
                </div>
              </div>

              {/* Generated output */}
              {(genPart1 || genPart2) && (
                <div className="gen-output">
                  <p className="gen-label">脚本正文 <span className="gen-count">({genPart1.trim().length} 字)</span></p>
                  <textarea
                    className="gen-textarea"
                    value={genPart1}
                    onChange={e => setGenPart1(e.target.value)}
                    rows={10}
                  />
                  <p className="gen-label" style={{ marginTop: 12 }}>引用依据</p>
                  <textarea className="gen-textarea gen-textarea--dim" readOnly value={genPart2} rows={6} />
                </div>
              )}

              {msg && <p className={msg.ok ? 'msg-ok' : 'msg-err'}>{msg.text}</p>}

              <button className="btn-ghost" onClick={saveDraft} disabled={saving}>
                {saving ? '保存中…' : '保存草稿'}
              </button>
              <button
                className="btn-primary"
                onClick={submitForReview}
                disabled={!(genPart1.trim() || scriptText.trim())}
              >
                提交给管理员审核
              </button>
            </div>
          ) : (
            <div className="readonly-view">
              <pre className="readonly-pre">{scriptText || '（暂无内容）'}</pre>
              <p className="readonly-status">
                {scriptStatus === 'IN_REVIEW' && '已提交，等待管理员审核'}
                {scriptStatus === 'APPROVED' && '脚本已通过，请返回录制'}
              </p>
              <button className="btn-ghost" onClick={() => router.push('/guest/inbox')}>← 返回任务</button>
            </div>
          )}
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
    --green: #5a8a6a; --red: #c0504a;
    --mono: 'IBM Plex Mono', monospace; --serif: 'Noto Serif SC', serif;
  }
  body { background: var(--bg); color: var(--text); }

  .shell { min-height: 100vh; background: var(--bg); font-family: var(--mono); }

  .loading-state { display: flex; align-items: center; justify-content: center; min-height: 100vh; gap: 6px; }
  .dot { width: 6px; height: 6px; border-radius: 50%; background: var(--amber); animation: pulse 1s ease-in-out infinite; }
  @keyframes pulse { 0%,100% { opacity:.2; transform:scale(.8); } 50% { opacity:1; transform:scale(1); } }

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

  .main { max-width:800px; margin:0 auto; padding:32px 16px 80px; }

  .run-ref { font-family:var(--serif); font-size:clamp(20px,5vw,28px); font-weight:700; color:var(--text); margin-bottom:6px; }
  .run-meta { font-size:13px; color:var(--text-muted); margin-bottom:8px; }
  .link { color:#7090d0; }
  .status-pill { display:inline-block; font-size:10px; letter-spacing:.12em; text-transform:uppercase; color:var(--text-muted); background:var(--surface2); border:1px solid var(--border); padding:3px 10px; margin-bottom:28px; }

  .edit-stack { display:flex; flex-direction:column; gap:12px; }

  .textarea-wrap { position:relative; }
  .main-textarea { width:100%; font-family:var(--mono); font-size:clamp(15px,2.5vw,18px); padding:14px; padding-bottom:32px; background:var(--surface2); color:var(--text); border:1px solid var(--border); outline:none; resize:vertical; line-height:1.8; transition:border-color .15s; }
  .main-textarea:focus { border-color:var(--amber); }
  .main-textarea::placeholder { color:var(--text-dim); }
  .char-count { position:absolute; bottom:8px; right:12px; font-size:12px; color:var(--text-dim); pointer-events:none; }

  .ai-panel { border:1px solid var(--border); background:var(--surface); padding:18px 20px; display:flex; flex-direction:column; gap:14px; }
  .ai-panel-label { font-size:10px; font-weight:600; letter-spacing:.18em; text-transform:uppercase; color:var(--text-muted); }
  .field { display:flex; flex-direction:column; gap:6px; }
  .field-label { font-size:11px; letter-spacing:.1em; text-transform:uppercase; color:var(--text-muted); }
  .ctrl-textarea { font-family:var(--mono); font-size:13px; padding:8px 12px; background:var(--surface2); color:var(--text); border:1px solid var(--border); outline:none; resize:vertical; width:100%; transition:border-color .15s; }
  .ctrl-textarea:focus { border-color:var(--amber); }
  .ctrl-textarea::placeholder { color:var(--text-dim); }
  .ctrl-row { display:flex; gap:10px; flex-wrap:wrap; }
  .ctrl-group { display:flex; flex-direction:column; gap:4px; flex:1 1 80px; min-width:80px; }
  .ctrl-input, .ctrl-select { font-family:var(--mono); font-size:13px; padding:7px 10px; background:var(--surface2); color:var(--text); border:1px solid var(--border); outline:none; width:100%; transition:border-color .15s; }
  .ctrl-input:focus, .ctrl-select:focus { border-color:var(--amber); }
  .ai-btn-row { display:flex; align-items:center; gap:14px; flex-wrap:wrap; }
  .ai-hint { font-size:11px; color:var(--text-dim); }

  .gen-output { display:flex; flex-direction:column; gap:6px; }
  .gen-label { font-size:13px; color:var(--text-muted); }
  .gen-count { color:var(--text-dim); }
  .gen-textarea { font-family:var(--mono); font-size:16px; padding:14px; background:#080808; color:#c8c4bc; border:1px solid var(--border); outline:none; resize:vertical; width:100%; line-height:1.8; }
  .gen-textarea--dim { font-size:13px; color:var(--text-muted); }

  .msg-ok { font-size:13px; color:var(--green); padding:8px 12px; border-left:2px solid var(--green); background:rgba(90,138,106,.1); }
  .msg-err { font-size:13px; color:var(--red); padding:8px 12px; border-left:2px solid var(--red); background:rgba(192,80,74,.1); }

  .btn-ghost { padding:10px 18px; font-family:var(--mono); font-size:13px; font-weight:500; color:var(--text-muted); background:none; border:1px solid var(--border); cursor:pointer; text-align:left; transition:color .15s,border-color .15s; }
  .btn-ghost:hover:not(:disabled) { color:var(--text); border-color:var(--border2); }
  .btn-ghost:disabled { opacity:.5; cursor:not-allowed; }
  .btn-primary { padding:13px 18px; font-family:var(--mono); font-size:14px; font-weight:600; color:#000; background:var(--amber); border:none; cursor:pointer; transition:background .15s; }
  .btn-primary:hover:not(:disabled) { background:#f0ac30; }
  .btn-primary:disabled { opacity:.4; cursor:not-allowed; }
  .btn-amber { padding:9px 18px; font-family:var(--mono); font-size:13px; font-weight:600; color:#000; background:var(--amber); border:none; cursor:pointer; transition:background .15s,opacity .15s; }
  .btn-amber:hover:not(:disabled) { background:#f0ac30; }
  .btn-amber:disabled { opacity:.5; cursor:wait; }

  .readonly-view { display:flex; flex-direction:column; gap:16px; }
  .readonly-pre { font-family:var(--mono); font-size:clamp(15px,2.5vw,18px); white-space:pre-wrap; background:var(--surface); padding:20px; color:var(--text); border:1px solid var(--border); line-height:1.8; }
  .readonly-status { font-size:14px; color:var(--green); }

  @media (max-width:480px) {
    .header { padding:12px 16px; }
    .brand-title { font-size:16px; }
    .brand-mark { width:32px; height:32px; font-size:16px; }
    .main { padding:20px 12px 80px; }
    .nav-btn { font-size:11px; padding:6px 10px; }
  }
`
