'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

type Reference = {
  id: string
  run_ref_id: string
  url: string
  status: string
  parsed_json: Record<string, unknown> | null
}

type Script = {
  id: string
  reference_id: string
  guest_id: string
  status: string
  script_text: string | null
}

type Deliverable = {
  id: string
  script_id: string
  type: 'raw' | 'final'
  storage_path: string | null
  baidu_share_url: string
  baidu_extract_code: string | null
  file_label: string | null
}

type Task = {
  id: string
  type: string
  status: string
  assignee_id: string | null
  assignee_role: string | null
  reference_id: string | null
  script_id: string | null
}

type GuestProfile = {
  id: string
  email: string | null
  display_name: string | null
}

const STATUS_LABEL: Record<string, string> = {
  SUBMITTED: '已提交',
  PARSED: '已解析',
  APPROVED: '已通过',
  DONE: '已完成',
}

export default function AdminRunPage() {
  const router = useRouter()
  const { run_ref_id } = useParams<{ run_ref_id: string }>()
  const decoded_run_ref_id = decodeURIComponent(run_ref_id)
  const supabase = createClient()

  const [reference, setReference] = useState<Reference | null>(null)
  const [script, setScript] = useState<Script | null>(null)
  const [deliverables, setDeliverables] = useState<Deliverable[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [guests, setGuests] = useState<GuestProfile[]>([])
  const [editors, setEditors] = useState<GuestProfile[]>([])
  const [scriptText, setScriptText] = useState('')
  const [selectedGuestIds, setSelectedGuestIds] = useState<string[]>([])
  const [selectedEditorId, setSelectedEditorId] = useState('')
  const [userRole, setUserRole] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [actionMsg, setActionMsg] = useState('')
  const [rejectComment, setRejectComment] = useState('')
  const [generating, setGenerating] = useState(false)
  const [extraInstructions, setExtraInstructions] = useState('')
  const [genTargetChars, setGenTargetChars] = useState(600)
  const [genPlatform, setGenPlatform] = useState('wechat')
  const [genFormat, setGenFormat] = useState('voice_over')
  const [genPart1, setGenPart1] = useState('')
  const [genPart2, setGenPart2] = useState('')

  async function load() {
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { data: prof } = await supabase.from('profiles').select('role').eq('id', user.id).single()
      setUserRole(prof?.role ?? null)
    }

    const { data: ref } = await supabase
      .from('references')
      .select('id, run_ref_id, url, status, parsed_json')
      .eq('run_ref_id', decoded_run_ref_id)
      .single()
    setReference(ref ?? null)

    if (!ref) { setLoading(false); return }

    const { data: sc } = await supabase
      .from('scripts')
      .select('id, reference_id, guest_id, status, script_text')
      .eq('reference_id', ref.id)
      .single()
    setScript(sc ?? null)
    if (sc?.script_text) setScriptText(sc.script_text)
    if (sc?.guest_id) setSelectedGuestIds([sc.guest_id])

    const { data: dels } = sc
      ? await supabase
          .from('deliverables')
          .select('id, script_id, type, storage_path, baidu_share_url, baidu_extract_code, file_label')
          .eq('script_id', sc.id)
          .order('created_at', { ascending: true })
      : { data: [] }
    setDeliverables(dels ?? [])

    const { data: tks } = await supabase
      .from('tasks')
      .select('id, type, status, assignee_id, assignee_role, reference_id, script_id')
      .eq('reference_id', ref.id)
      .order('created_at', { ascending: true })
    setTasks(tks ?? [])

    const { data: guestList } = await supabase
      .from('profiles')
      .select('id, email, display_name')
      .eq('role', 'guest')
    setGuests(guestList ?? [])

    const { data: editorList } = await supabase
      .from('profiles')
      .select('id, email, display_name')
      .eq('role', 'editor')
    setEditors(editorList ?? [])

    setLoading(false)
  }

  useEffect(() => { load() }, [run_ref_id])

  async function action(fn: () => Promise<void>) {
    setActionMsg('')
    await fn()
    await load()
  }

  async function markParsed() {
    await supabase.from('references').update({ status: 'PARSED' }).eq('id', reference!.id)
    setReference(prev => prev ? { ...prev, status: 'PARSED' } : prev)
    setActionMsg('参考素材已标记为已解析。')
  }

  async function generateScript() {
    if (selectedGuestIds.length === 0) { setActionMsg('请先选择嘉宾。'); return }
    setGenerating(true)
    setActionMsg('')
    try {
      const { data: personaRow } = await supabase
        .from('guest_profiles')
        .select('profile_data, advisory')
        .eq('guest_id', selectedGuestIds[0])
        .maybeSingle()

      const res = await fetch('/api/generate-script', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          referenceTranscript: scriptText,
          extraInstructions,
          personaJson: personaRow?.profile_data ?? {},
          advisory: (personaRow as any)?.advisory ?? null,
          constraints: {
            target_chars: genTargetChars,
            platform: genPlatform,
            format: genFormat,
          },
        }),
      })
      const data = await res.json()
      if (data.error) { setActionMsg(data.error ?? 'AI 生成失败') }
      else {
        setGenPart1(data.part1 ?? '')
        setGenPart2(data.part2 ?? '')
      }
    } catch {
      setActionMsg('AI 生成失败')
    }
    setGenerating(false)
  }

  function toggleGuest(id: string) {
    setSelectedGuestIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  async function saveDraftScript() {
    if (!scriptText.trim()) { setActionMsg('请输入脚本内容。'); return }
    if (selectedGuestIds.length === 0) { setActionMsg('请先选择达人。'); return }

    if (script) {
      await supabase.from('scripts').update({ script_text: scriptText.trim(), guest_id: selectedGuestIds[0] }).eq('id', script.id)
    } else {
      await supabase.from('scripts').insert({
        reference_id: reference!.id,
        guest_id: selectedGuestIds[0],
        script_text: scriptText.trim(),
        status: 'DRAFT',
      })
    }
    setActionMsg('脚本草稿已保存。')
  }

  async function approveReference() {
    if (selectedGuestIds.length === 0) { setActionMsg('请先选择达人。'); return }

    const finalScriptText = genPart1.trim() || scriptText.trim()
    if (!finalScriptText) { setActionMsg('请先输入脚本内容。'); return }

    let scriptId = script?.id

    if (!scriptId) {
      const { data: newScript, error } = await supabase
        .from('scripts')
        .insert({
          reference_id: reference!.id,
          guest_id: selectedGuestIds[0],
          script_text: finalScriptText,
          status: 'DRAFT',
        })
        .select('id')
        .single()
      if (error || !newScript) { setActionMsg(error?.message ?? '创建脚本失败'); return }
      scriptId = newScript.id
    } else {
      await supabase.from('scripts').update({ script_text: finalScriptText, guest_id: selectedGuestIds[0] }).eq('id', scriptId)
    }

    await supabase.from('references').update({ status: 'APPROVED' }).eq('id', reference!.id)

    const reviewTask = tasks.find(t => t.type === 'REVIEW_REFERENCE' && t.status === 'OPEN')
    if (reviewTask) {
      await supabase.from('tasks').update({ status: 'DONE' }).eq('id', reviewTask.id)
    }

    await supabase.from('tasks').insert({
      type: 'REVIEW_SCRIPT',
      status: 'OPEN',
      reference_id: reference!.id,
      script_id: scriptId,
      assignee_role: 'admin',
    })

    setActionMsg('参考素材已审核通过，脚本已创建。')
  }

  async function saveScript() {
    if (!script) return
    await supabase.from('scripts').update({ script_text: scriptText }).eq('id', script.id)
    setActionMsg('脚本已保存。')
  }

  async function approveScript() {
    if (!script) return

    await supabase.from('scripts').update({ status: 'APPROVED', script_text: scriptText }).eq('id', script.id)

    const reviewTask = tasks.find(t => t.type === 'REVIEW_SCRIPT' && t.status === 'OPEN')
    if (reviewTask) {
      await supabase.from('tasks').update({ status: 'DONE' }).eq('id', reviewTask.id)
    }

    await supabase.from('tasks').insert({
      type: 'RECORD_VIDEO',
      status: 'OPEN',
      reference_id: reference!.id,
      script_id: script.id,
      assignee_id: script.guest_id,
      assignee_role: 'guest',
    })

    setActionMsg('脚本已审核通过，录制任务已发送给达人。')
  }

  async function createEditTask() {
    if (!script) return
    if (!selectedEditorId) { setActionMsg('请先选择剪辑师。'); return }

    await supabase.from('tasks').insert({
      type: 'EDIT_VIDEO',
      status: 'OPEN',
      reference_id: reference!.id,
      script_id: script.id,
      assignee_id: selectedEditorId,
      assignee_role: 'editor',
      deliverable_type: 'raw',
    })

    setActionMsg('剪辑任务已分配给剪辑师。')
  }

  async function createReviewFinalCutTask() {
    if (!script) return

    await supabase.from('tasks').insert({
      type: 'REVIEW_FINAL_CUT',
      status: 'OPEN',
      reference_id: reference!.id,
      script_id: script.id,
      assignee_role: 'admin',
    })

    setActionMsg('成片审核任务已创建。')
  }

  async function rejectFinalCut() {
    if (!rejectComment.trim()) { setActionMsg('请填写驳回说明。'); return }

    const editTask = [...tasks].reverse().find(t => t.type === 'EDIT_VIDEO' && t.status === 'DONE')
    if (!editTask?.assignee_id) { setActionMsg('找不到剪辑师信息。'); return }

    const reviewTask = tasks.find(t => t.type === 'REVIEW_FINAL_CUT' && t.status === 'OPEN')
    if (reviewTask) {
      await supabase.from('tasks').update({ status: 'DONE' }).eq('id', reviewTask.id)
    }

    await supabase.from('tasks').insert({
      type: 'EDIT_VIDEO',
      status: 'OPEN',
      reference_id: reference!.id,
      script_id: script!.id,
      assignee_id: editTask.assignee_id,
      assignee_role: 'editor',
      comment: rejectComment.trim(),
    })

    setRejectComment('')
    setActionMsg('已驳回，返工任务已发送给剪辑师。')
  }

  async function approveFinalCut() {
    const reviewTask = tasks.find(t => t.type === 'REVIEW_FINAL_CUT' && t.status === 'OPEN')
    if (reviewTask) {
      await supabase.from('tasks').update({ status: 'DONE' }).eq('id', reviewTask.id)
    }
    if (script) {
      await supabase.from('scripts').update({ status: 'DONE' }).eq('id', script.id)
    }
    setActionMsg('成片已审核通过，本次任务完成。')
  }

  if (loading) {
    return (
      <>
        <style>{css}</style>
        <div className="shell">
          <div className="loading-state">
            <span className="dot" /><span className="dot" style={{ animationDelay: '.15s' }} /><span className="dot" style={{ animationDelay: '.3s' }} />
          </div>
        </div>
      </>
    )
  }

  if (!reference) {
    return (
      <>
        <style>{css}</style>
        <div className="shell">
          <div style={{ padding: 48, color: 'var(--text-muted)' }}>任务不存在。</div>
        </div>
      </>
    )
  }

  const openTask = tasks.find(t => t.status === 'OPEN')
  const raws = deliverables.filter(d => d.type === 'raw')
  const final = deliverables.find(d => d.type === 'final')
  const recordDone = tasks.some(t => t.type === 'RECORD_VIDEO' && t.status === 'DONE')
  const editTaskExists = tasks.some(t => t.type === 'EDIT_VIDEO')
  const editDone = !tasks.some(t => t.type === 'EDIT_VIDEO' && t.status === 'OPEN')
                && tasks.some(t => t.type === 'EDIT_VIDEO' && t.status === 'DONE')
  const reviewFinalExists = tasks.some(t => t.type === 'REVIEW_FINAL_CUT' && t.status === 'OPEN')
  const reviewFinalDone = tasks.some(t => t.type === 'REVIEW_FINAL_CUT' && t.status === 'DONE')

  return (
    <>
      <style>{css}</style>
      <div className="shell">

        <header className="header">
          <div className="header-left">
            <div className="brand-mark">U</div>
            <div>
              <h1 className="brand-title">UMI</h1>
              <p className="brand-sub">管理员工作台</p>
            </div>
          </div>
          <nav className="header-nav">
            <button className="nav-btn" onClick={() => router.push('/admin/inbox')}>← 工作台</button>
            <button className="nav-btn nav-btn--ghost" onClick={async () => { await supabase.auth.signOut(); router.replace('/login') }}>退出</button>
          </nav>
        </header>

        <main className="main">
          <div className="run-ref">{decoded_run_ref_id}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 32 }}>
            <span className="status-badge">{STATUS_LABEL[reference.status] ?? reference.status}</span>
            {openTask && <span className="open-task-badge">{openTask.type}</span>}
          </div>

          {/* 参考素材 */}
          <Section title="参考素材">
            <a href={reference.url} target="_blank" rel="noopener noreferrer" className="ref-link">
              {reference.url}
            </a>
          </Section>

          {/* 选择嘉宾 */}
          <Section title="选择嘉宾">
            <div className="guest-chips">
              {guests.map(g => {
                const checked = selectedGuestIds.includes(g.id)
                return (
                  <button
                    key={g.id}
                    type="button"
                    className={`guest-chip ${checked ? 'guest-chip--active' : ''}`}
                    onClick={() => toggleGuest(g.id)}
                  >
                    {g.display_name ?? g.email ?? g.id}
                  </button>
                )
              })}
            </div>
          </Section>

          {/* 脚本 */}
          <Section title="脚本">
            {openTask?.type === 'REVIEW_REFERENCE' && (reference.status === 'SUBMITTED' || reference.status === 'PARSED') ? (
              <div className="script-editor">
                <div className="textarea-wrap">
                  <textarea
                    className="ctrl-textarea"
                    placeholder="输入脚本内容..."
                    value={scriptText}
                    onChange={e => setScriptText(e.target.value)}
                    rows={8}
                  />
                  <span className="char-count">{scriptText.trim().length} 字</span>
                </div>
                <button className="btn-ghost" onClick={() => action(saveDraftScript)}>保存草稿</button>

                {reference.status === 'PARSED' && (
                  <div className="ai-panel">
                    <p className="ai-panel-label">AI 辅助生成</p>
                    <textarea
                      className="ctrl-textarea"
                      placeholder="追加说明（可选）：例如「语气轻松一点」「强调产品差异化」"
                      value={extraInstructions}
                      onChange={e => setExtraInstructions(e.target.value)}
                      rows={3}
                    />
                    <div className="ai-controls">
                      <input
                        type="number"
                        className="ctrl-input"
                        value={genTargetChars}
                        onChange={e => setGenTargetChars(Math.min(2000, Math.max(100, Number(e.target.value))))}
                        placeholder="目标字数"
                        min={100} max={2000} step={100}
                      />
                      <select
                        className="ctrl-select"
                        value={genPlatform}
                        onChange={e => setGenPlatform(e.target.value)}
                      >
                        <option value="wechat">微信视频号</option>
                        <option value="xhs">小红书</option>
                        <option value="tiktok">抖音</option>
                        <option value="youtube">YouTube</option>
                      </select>
                      <select
                        className="ctrl-select"
                        value={genFormat}
                        onChange={e => setGenFormat(e.target.value)}
                      >
                        <option value="voice_over">自述</option>
                        <option value="on_camera">口播</option>
                      </select>
                    </div>
                    <button className="btn-ghost" onClick={generateScript} disabled={generating}>
                      {generating ? 'AI 生成中…' : 'AI 生成脚本'}
                    </button>
                    {(genPart1 || genPart2) && (
                      <>
                        <p className="gen-label">脚本正文 <span className="gen-char-count">({genPart1.trim().length} 字)</span></p>
                        <textarea
                          className="ctrl-textarea ctrl-textarea--output"
                          value={genPart1}
                          onChange={e => setGenPart1(e.target.value)}
                          rows={10}
                        />
                        <p className="gen-label">引用依据</p>
                        <textarea
                          className="ctrl-textarea ctrl-textarea--ref"
                          readOnly
                          value={genPart2}
                          rows={6}
                        />
                      </>
                    )}
                  </div>
                )}
              </div>
            ) : script ? (
              <div className="script-editor">
                <span className="script-status-badge">{script.status}</span>
                {openTask?.type === 'REVIEW_SCRIPT' ? (
                  <>
                    <div className="textarea-wrap">
                      <textarea
                        className="ctrl-textarea"
                        value={scriptText}
                        onChange={e => setScriptText(e.target.value)}
                        rows={10}
                      />
                      <span className="char-count">{scriptText.trim().length} 字</span>
                    </div>
                    <button className="btn-ghost" onClick={() => action(saveScript)}>保存脚本</button>
                  </>
                ) : (
                  <pre className="script-pre">{script.script_text}</pre>
                )}
              </div>
            ) : (
              <p className="empty-text">暂无脚本。</p>
            )}
          </Section>

          {/* 视频文件 */}
          <Section title="视频文件">
            {raws.length > 0
              ? raws.map((d, i) => <DeliverableRow key={d.id} label={raws.length > 1 ? `原片 ${i + 1}` : '原片'} d={d} />)
              : <p className="empty-text">暂无原片。</p>}
            {final
              ? <DeliverableRow label="成片" d={final} />
              : <p className="empty-text" style={{ marginTop: 8 }}>暂无成片。</p>}
          </Section>

          {/* 任务进度 */}
          {userRole === 'admin' && (
            <Section title="任务进度">
              {tasks.length === 0 ? (
                <p className="empty-text">暂无任务。</p>
              ) : (
                <div className="task-progress-list">
                  {tasks.map(t => (
                    <div key={t.id} className="task-progress-row">
                      <span className="task-progress-type">{t.type}</span>
                      <span className={`task-progress-status ${t.status === 'DONE' ? 'status--done' : t.status === 'BLOCKED' ? 'status--blocked' : 'status--open'}`}>
                        {t.status}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </Section>
          )}

          {/* 操作 */}
          {userRole === 'admin' && (
            <Section title="操作">
              <div className="actions-list">
                {reference.status === 'SUBMITTED' && (
                  <button className="action-primary" onClick={markParsed}>参考素材已解析</button>
                )}
                {reference.status === 'PARSED' && openTask?.type === 'REVIEW_REFERENCE' && (
                  <button className="action-primary" onClick={() => action(approveReference)}>审核通过参考素材（创建脚本）</button>
                )}
                {script && (script.status === 'DRAFT' || script.status === 'IN_REVIEW') && openTask?.type === 'REVIEW_SCRIPT' && (
                  <button className="action-primary" onClick={() => action(approveScript)}>审核通过脚本 → 发送给达人</button>
                )}
                {recordDone && !editTaskExists && (
                  <div className="editor-select-group">
                    <select
                      className="ctrl-select ctrl-select--full"
                      value={selectedEditorId}
                      onChange={e => setSelectedEditorId(e.target.value)}
                    >
                      <option value="">— 选择剪辑师 —</option>
                      {editors.map(ed => (
                        <option key={ed.id} value={ed.id}>{ed.display_name ?? ed.email ?? ed.id}</option>
                      ))}
                    </select>
                    <button className="action-primary" onClick={() => action(createEditTask)}>分配剪辑任务给剪辑师</button>
                  </div>
                )}
                {editDone && !reviewFinalExists && !reviewFinalDone && (
                  <button className="action-primary" onClick={() => action(createReviewFinalCutTask)}>创建成片审核任务</button>
                )}
                {openTask?.type === 'REVIEW_FINAL_CUT' && final && (
                  <>
                    <button className="action-primary" onClick={() => action(approveFinalCut)}>审核通过成片</button>
                    <textarea
                      className="ctrl-textarea"
                      placeholder="驳回说明（必填）：例如「片头太长，请剪到5秒内」"
                      value={rejectComment}
                      onChange={e => setRejectComment(e.target.value)}
                      rows={3}
                    />
                    <button className="action-danger" onClick={() => action(rejectFinalCut)}>驳回并退回剪辑</button>
                  </>
                )}
                {!openTask && tasks.length > 0 && script?.status === 'DONE' && (
                  <p className="done-msg">本次任务已完成。</p>
                )}
              </div>
              {actionMsg && <p className="action-msg">{actionMsg}</p>}
            </Section>
          )}

        </main>
      </div>
    </>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="run-section">
      <h2 className="run-section-title">{title}</h2>
      {children}
    </div>
  )
}

function DeliverableRow({ label, d }: { label: string; d: Deliverable }) {
  const supabase = createClient()
  const [loadingUrl, setLoadingUrl] = useState(false)
  const [downloadPhase, setDownloadPhase] = useState<'sign' | 'fetch' | null>(null)

  async function openSignedUrl() {
    if (!d.storage_path) return
    setLoadingUrl(true)
    const { data, error } = await supabase.storage.from('videos').createSignedUrl(d.storage_path, 3600)
    setLoadingUrl(false)
    if (error || !data?.signedUrl) { alert('无法生成访问链接：' + (error?.message ?? '')); return }
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
  }

  async function downloadFile() {
    if (!d.storage_path) return
    setDownloadPhase('sign')
    const { data, error } = await supabase.storage.from('videos').createSignedUrl(d.storage_path, 3600)
    if (error || !data?.signedUrl) { setDownloadPhase(null); alert('无法生成下载链接：' + (error?.message ?? '')); return }
    setDownloadPhase('fetch')
    const res = await fetch(data.signedUrl)
    const blob = await res.blob()
    setDownloadPhase(null)
    const blobUrl = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = blobUrl
    a.download = d.file_label ?? 'video'
    a.click()
    URL.revokeObjectURL(blobUrl)
  }

  return (
    <div className="deliverable-row">
      <div className="deliverable-meta">
        <span className="deliverable-label">{label}</span>
        <span className="deliverable-name">{d.file_label ?? '未命名文件'}</span>
      </div>
      {d.storage_path ? (
        <div className="deliverable-actions">
          <button className="file-btn file-btn--view" onClick={openSignedUrl} disabled={loadingUrl}>
            {loadingUrl ? '生成中…' : '查看'}
          </button>
          <button className="file-btn file-btn--dl" onClick={downloadFile} disabled={!!downloadPhase}>
            {downloadPhase === 'sign' ? '准备中…' : downloadPhase === 'fetch' ? '下载中…' : '下载'}
          </button>
        </div>
      ) : (
        <div className="deliverable-actions">
          <a href={d.baidu_share_url} target="_blank" rel="noopener noreferrer" className="file-btn file-btn--view">{d.baidu_share_url}</a>
          {d.baidu_extract_code && <span className="deliverable-code">码：{d.baidu_extract_code}</span>}
        </div>
      )}
    </div>
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
    --green: #5a8a6a; --red: #c0504a; --blue: #4a80c0;
    --mono: 'IBM Plex Mono', monospace; --serif: 'Noto Serif SC', serif;
  }
  body { background: var(--bg); color: var(--text); }
  .shell { min-height: 100vh; background: var(--bg); font-family: var(--mono); }

  .loading-state { display: flex; align-items: center; justify-content: center; min-height: 100vh; gap: 6px; }
  .dot { width: 6px; height: 6px; border-radius: 50%; background: var(--amber); animation: pulse 1s ease-in-out infinite; }
  @keyframes pulse { 0%,100%{opacity:.2;transform:scale(.8);} 50%{opacity:1;transform:scale(1);} }

  .header { display: flex; align-items: center; justify-content: space-between; padding: 16px 20px; border-bottom: 1px solid var(--border); position: sticky; top: 0; background: rgba(12,12,12,.95); backdrop-filter: blur(8px); z-index: 10; }
  .header-left { display: flex; align-items: center; gap: 12px; }
  .brand-mark { width: 36px; height: 36px; background: var(--amber); color: #000; font-family: var(--serif); font-size: 18px; font-weight: 700; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
  .brand-title { font-family: var(--serif); font-size: 18px; font-weight: 700; letter-spacing: .05em; line-height: 1; color: var(--text); }
  .brand-sub { font-size: 10px; color: var(--text-muted); letter-spacing: .1em; margin-top: 3px; }
  .header-nav { display: flex; align-items: center; gap: 8px; }
  .nav-btn { display: flex; align-items: center; gap: 6px; padding: 7px 12px; font-family: var(--mono); font-size: 12px; color: var(--text-muted); background: var(--surface); border: 1px solid var(--border); cursor: pointer; transition: color .15s, border-color .15s; white-space: nowrap; }
  .nav-btn:hover { color: var(--text); border-color: var(--border2); }
  .nav-btn--ghost { background: none; border-color: transparent; }
  .nav-btn--ghost:hover { border-color: var(--border); }

  .main { max-width: 800px; margin: 0 auto; padding: 32px 16px 80px; }
  .run-ref { font-family: var(--serif); font-size: clamp(20px,5vw,28px); font-weight: 700; color: var(--text); margin-bottom: 10px; }

  .status-badge { font-size: 11px; padding: 3px 10px; background: var(--surface2); color: var(--text-muted); border: 1px solid var(--border); letter-spacing: .06em; }
  .open-task-badge { font-size: 11px; padding: 3px 10px; background: var(--amber-glow); color: var(--amber); border: 1px solid rgba(232,160,32,.3); letter-spacing: .04em; }

  /* Sections */
  .run-section { margin-bottom: 44px; }
  .run-section-title { font-size: 10px; font-weight: 600; letter-spacing: .2em; text-transform: uppercase; color: var(--text-muted); margin-bottom: 16px; padding-bottom: 10px; border-bottom: 1px solid var(--border); }

  .ref-link { font-size: 13px; color: var(--blue); word-break: break-all; }
  .ref-link:hover { text-decoration: underline; }
  .empty-text { font-size: 13px; color: var(--text-dim); }

  /* Guest chips */
  .guest-chips { display: flex; flex-wrap: wrap; gap: 8px; }
  .guest-chip { padding: 7px 14px; font-family: var(--mono); font-size: 13px; cursor: pointer; background: var(--surface2); color: var(--text-muted); border: 1px solid var(--border); transition: all .15s; }
  .guest-chip:hover { color: var(--text); border-color: var(--border2); }
  .guest-chip--active { background: var(--amber); color: #000; border-color: var(--amber); font-weight: 600; }

  /* Script editor */
  .script-editor { display: flex; flex-direction: column; gap: 10px; }
  .script-status-badge { font-size: 11px; padding: 3px 10px; background: var(--surface2); color: var(--text-muted); border: 1px solid var(--border); width: fit-content; letter-spacing: .06em; }
  .textarea-wrap { position: relative; }
  .ctrl-textarea { width: 100%; font-family: var(--mono); font-size: 14px; padding: 12px 14px; padding-bottom: 28px; background: var(--surface2); color: var(--text); border: 1px solid var(--border); outline: none; resize: vertical; transition: border-color .15s; line-height: 1.6; }
  .ctrl-textarea:focus { border-color: var(--amber); }
  .ctrl-textarea::placeholder { color: var(--text-dim); }
  .ctrl-textarea--output { background: #060606; color: #dedad2; }
  .ctrl-textarea--ref { background: #060606; color: var(--text-muted); font-size: 13px; }
  .char-count { position: absolute; bottom: 8px; right: 12px; font-size: 11px; color: var(--text-dim); pointer-events: none; }
  .btn-ghost { padding: 10px 16px; font-family: var(--mono); font-size: 13px; font-weight: 500; color: var(--text-muted); background: none; border: 1px solid var(--border); cursor: pointer; transition: color .15s, border-color .15s; }
  .btn-ghost:hover:not(:disabled) { color: var(--text); border-color: var(--border2); }
  .btn-ghost:disabled { opacity: .5; cursor: not-allowed; }
  .script-pre { font-family: var(--serif); font-size: clamp(15px,2.5vw,18px); white-space: pre-wrap; background: var(--surface2); color: var(--text); padding: 20px; line-height: 1.8; border: 1px solid var(--border); }

  /* AI panel */
  .ai-panel { padding: 16px; background: var(--surface); border: 1px solid var(--border); display: flex; flex-direction: column; gap: 10px; margin-top: 4px; }
  .ai-panel-label { font-size: 10px; font-weight: 600; letter-spacing: .15em; text-transform: uppercase; color: var(--text-muted); }
  .ai-controls { display: flex; gap: 8px; flex-wrap: wrap; }
  .ctrl-input { flex: 1; min-width: 80px; padding: 9px 12px; font-family: var(--mono); font-size: 13px; background: var(--surface2); color: var(--text); border: 1px solid var(--border); outline: none; }
  .ctrl-input:focus { border-color: var(--amber); }
  .ctrl-select { flex: 1; min-width: 100px; padding: 9px 12px; font-family: var(--mono); font-size: 13px; background: var(--surface2); color: var(--text); border: 1px solid var(--border); outline: none; cursor: pointer; }
  .ctrl-select:focus { border-color: var(--amber); }
  .ctrl-select--full { width: 100%; }
  .gen-label { font-size: 11px; color: var(--text-muted); letter-spacing: .06em; margin-top: 4px; }
  .gen-char-count { color: var(--text-dim); }

  /* Deliverables */
  .deliverable-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 0; border-bottom: 1px solid var(--border); flex-wrap: wrap; }
  .deliverable-meta { display: flex; align-items: baseline; gap: 10px; min-width: 0; flex: 1; }
  .deliverable-label { font-size: 11px; color: var(--text-muted); letter-spacing: .06em; flex-shrink: 0; }
  .deliverable-name { font-size: 14px; color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .deliverable-actions { display: flex; gap: 8px; flex-shrink: 0; }
  .file-btn { padding: 6px 14px; font-family: var(--mono); font-size: 12px; font-weight: 500; cursor: pointer; border: 1px solid var(--border); background: var(--surface2); transition: color .15s, border-color .15s; text-decoration: none; }
  .file-btn:disabled { opacity: .5; cursor: wait; }
  .file-btn--view { color: var(--blue); }
  .file-btn--view:hover:not(:disabled) { border-color: var(--blue); }
  .file-btn--dl { color: var(--green); }
  .file-btn--dl:hover:not(:disabled) { border-color: var(--green); }
  .deliverable-code { font-size: 12px; color: var(--text-muted); }

  /* Task progress */
  .task-progress-list { display: flex; flex-direction: column; }
  .task-progress-row { display: flex; justify-content: space-between; align-items: center; padding: 9px 0; border-bottom: 1px solid var(--border); }
  .task-progress-type { font-size: 13px; color: var(--text-muted); letter-spacing: .04em; }
  .task-progress-status { font-size: 11px; padding: 2px 8px; letter-spacing: .06em; }
  .status--done { background: rgba(90,138,106,.12); color: var(--green); }
  .status--blocked { background: rgba(192,80,74,.12); color: var(--red); }
  .status--open { background: var(--amber-glow); color: var(--amber); }

  /* Actions */
  .actions-list { display: flex; flex-direction: column; gap: 10px; }
  .action-primary { padding: 13px 18px; font-family: var(--mono); font-size: 14px; font-weight: 600; color: #000; background: var(--amber); border: none; cursor: pointer; text-align: left; transition: background .15s; }
  .action-primary:hover { background: #f0ac30; }
  .action-danger { padding: 13px 18px; font-family: var(--mono); font-size: 14px; font-weight: 600; color: var(--red); background: none; border: 1px solid var(--red); cursor: pointer; text-align: left; transition: background .15s; }
  .action-danger:hover { background: rgba(192,80,74,.08); }
  .editor-select-group { display: flex; flex-direction: column; gap: 8px; }
  .done-msg { font-size: 14px; color: var(--green); padding: 12px 0; }
  .action-msg { font-size: 13px; color: var(--green); padding: 10px 14px; border-left: 2px solid var(--green); background: rgba(90,138,106,.1); margin-top: 14px; }

  @media (max-width: 480px) {
    .header { padding: 12px 16px; }
    .brand-mark { width: 32px; height: 32px; font-size: 16px; }
    .brand-title { font-size: 16px; }
    .main { padding: 20px 12px 80px; }
    .ai-controls { flex-direction: column; }
    .ctrl-input, .ctrl-select { width: 100%; }
    .deliverable-row { flex-direction: column; align-items: flex-start; }
    .deliverable-actions { width: 100%; }
    .file-btn { flex: 1; text-align: center; }
  }
`
