'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { resumableUpload } from '@/lib/storage/resumableUpload'

function formatFileSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`
}

type Script = {
  id: string
  script_text: string | null
  reference_id: string | null
  ref: { run_ref_id: string } | null
}

export default function GuestRecordPage() {
  const router = useRouter()
  const { scriptId } = useParams<{ scriptId: string }>()
  const supabase = createClient()

  const [script, setScript] = useState<Script | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [taskId, setTaskId] = useState<string | null>(null)
  const [taskDone, setTaskDone] = useState(false)
  const [rawDeliverables, setRawDeliverables] = useState<{ storage_path: string; file_label: string | null }[]>([])
  const [uploadMsg, setUploadMsg] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [fileLabel, setFileLabel] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [currentScriptText, setCurrentScriptText] = useState('')
  const [taskComment, setTaskComment] = useState<string | null>(null)
  const [uploadProgress, setUploadProgress] = useState<number | null>(null)
  const [uploadPhase, setUploadPhase] = useState<'uploading' | 'saving' | null>(null)
  const [uploadStalled, setUploadStalled] = useState(false)
  const lastProgressTime = useRef<number>(Date.now())
  const stallTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (uploadPhase !== 'uploading') return
    lastProgressTime.current = Date.now()
    setUploadStalled(false)
    if (stallTimerRef.current) clearTimeout(stallTimerRef.current)
    stallTimerRef.current = setTimeout(() => {
      if (Date.now() - lastProgressTime.current >= 15000) setUploadStalled(true)
    }, 15000)
    return () => { if (stallTimerRef.current) clearTimeout(stallTimerRef.current) }
  }, [uploadProgress, uploadPhase])

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace('/login'); return }
      setUserId(user.id)

      const { data: sc } = await supabase
        .from('scripts')
        .select('id, script_text, reference_id, ref:references!reference_id(run_ref_id)')
        .eq('id', scriptId).single()
      setScript((sc as unknown as Script) ?? null)
      setCurrentScriptText(sc?.script_text ?? '')

      const { data: task } = await supabase
        .from('tasks').select('id, status, comment')
        .eq('script_id', scriptId).eq('type', 'RECORD_VIDEO').eq('assignee_id', user.id)
        .order('created_at', { ascending: false }).limit(1).maybeSingle()

      if (task?.status === 'OPEN') { setTaskId(task.id); setTaskComment(task.comment ?? null) }
      if (task?.status === 'DONE') setTaskDone(true)

      const { data: dels } = await supabase
        .from('deliverables').select('storage_path, file_label')
        .eq('script_id', scriptId).eq('type', 'raw').order('created_at', { ascending: true })
      setRawDeliverables(dels ?? [])

      setLoading(false)
    }
    load()
  }, [scriptId])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(''); setUploadMsg('')
    if (!file) { setError('请选择视频文件'); return }
    if (!script || !userId) return
    setSubmitting(true)

    const timestamp = Date.now()
    const ext = file.name.includes('.') ? '.' + file.name.split('.').pop()!.replace(/[^a-zA-Z0-9]/g, '') : ''
    const storagePath = `raw/${scriptId}/${timestamp}${ext}`
    setUploadProgress(0)
    setUploadPhase('uploading')
    setUploadStalled(false)
    try {
      await resumableUpload(supabase, 'videos', storagePath, file, (pct) => {
        setUploadProgress(pct)
        lastProgressTime.current = Date.now()
      })
    } catch (err: any) {
      const httpStatus = (err as any)?.originalResponse?.getStatus?.()
      const isTooBig = httpStatus === 413 || /too large|exceed/i.test(err.message ?? '')
      const isNetwork = /network|fetch|timeout|abort/i.test(err.message ?? '')
      setError(
        isTooBig ? '文件过大，请压缩后重试' :
        isNetwork ? '网络中断，请检查连接后重试' :
        '上传失败，请刷新页面重试'
      )
      setUploadProgress(null); setUploadPhase(null); setUploadStalled(false); setSubmitting(false); return
    }
    setUploadProgress(null)
    setUploadPhase('saving')

    const { error: delErr } = await supabase.from('deliverables').insert({
      script_id: scriptId, type: 'raw', storage_path: storagePath,
      baidu_share_url: '', file_label: fileLabel.trim() || file.name, created_by: userId,
    })
    if (delErr) { setError(delErr.message); setUploadPhase(null); setSubmitting(false); return }

    const { data: dels } = await supabase
      .from('deliverables').select('storage_path, file_label')
      .eq('script_id', scriptId).eq('type', 'raw').order('created_at', { ascending: true })
    setRawDeliverables(dels ?? [])

    setFile(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
    setFileLabel('')
    setUploadPhase(null)
    setUploadStalled(false)
    setUploadMsg('原片已上传，可继续上传或点击「完成录制」。')
    setSubmitting(false)
  }

  async function handleFinishRecording() {
    if (!taskId) return

    const { data: guestProfile } = await supabase
      .from('profiles')
      .select('default_editor_id')
      .eq('id', userId)
      .single()

    await supabase.from('tasks').update({ status: 'DONE' }).eq('id', taskId)

    if (guestProfile?.default_editor_id && script?.reference_id) {
      await supabase.from('tasks').insert({
        type: 'EDIT_VIDEO',
        status: 'OPEN',
        reference_id: script.reference_id,
        script_id: script.id,
        assignee_id: guestProfile.default_editor_id,
        assignee_role: 'editor',
      })
      fetch('/api/notify-task', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskType: 'EDIT_VIDEO', assigneeId: guestProfile.default_editor_id, referenceId: script.reference_id }),
      }).catch(console.error)
    }

    router.replace('/guest/inbox')
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

  if (!script) return (
    <>
      <style>{css}</style>
      <div className="shell"><div style={{ padding: 48, color: 'var(--text-muted)' }}>Script not found.</div></div>
    </>
  )

  const runRefId = script.ref?.run_ref_id ?? script.reference_id

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
          <div className="run-ref">{runRefId}</div>
          <p className="run-meta">{taskDone ? '已完成录制。' : '请对照以下脚本录制视频，完成后上传视频文件。'}</p>

          {taskComment && !taskDone && (
            <div className="rework-banner">
              <p className="rework-label">返工说明</p>
              <p className="rework-text">{taskComment}</p>
            </div>
          )}

          {/* Teleprompter */}
          <textarea
            value={currentScriptText}
            readOnly
            rows={12}
            className="teleprompter"
          />

          {/* Uploaded files */}
          {rawDeliverables.length > 0 && (
            <div className="deliverables">
              <p className="section-label">已上传原片 ({rawDeliverables.length})</p>
              {rawDeliverables.map((d, i) => (
                <div key={i} className="deliverable-row">
                  <span className="deliverable-name">{d.file_label ?? '未命名文件'}</span>
                  <span className="deliverable-check">✓</span>
                </div>
              ))}
            </div>
          )}

          {!taskDone && (
            <div className="upload-section">
              <p className="section-label">提交原片</p>
              <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <input
                  className="form-input"
                  type="text"
                  placeholder="文件名备注（可选，如 EP001-原片）"
                  value={fileLabel}
                  onChange={e => setFileLabel(e.target.value)}
                />
                <div
                  className={`dropzone ${file ? 'dropzone--selected' : ''}`}
                  onClick={() => fileInputRef.current?.click()}
                >
                  {file ? `已选择：${file.name}` : '点击选择视频文件'}
                </div>
                <input ref={fileInputRef} type="file" accept="video/*" style={{ display: 'none' }}
                  onChange={e => setFile(e.target.files?.[0] ?? null)} />

                {error && <p className="msg-err">{error}</p>}

                {uploadPhase && (
                  <div className="upload-status">
                    <div className="upload-status-row">
                      <span className="upload-phase-label">
                        {uploadPhase === 'uploading' ? '上传中' : '写入中'}
                      </span>
                      <span className="upload-pct">
                        {uploadPhase === 'uploading' ? `${uploadProgress}%` : '请稍候…'}
                      </span>
                    </div>
                    <div className="progress-bar">
                      <div className={`progress-fill${uploadPhase === 'saving' ? ' progress-fill--pulse' : ''}`}
                           style={{ width: uploadPhase === 'saving' ? '100%' : `${uploadProgress}%` }} />
                    </div>
                    <div className="upload-meta">
                      {file && <span className="upload-size">{formatFileSize(file.size)}</span>}
                      {uploadStalled && <span className="upload-stall">网络较慢，请保持连接</span>}
                    </div>
                  </div>
                )}

                <button type="submit" className="btn-ghost btn-ghost--full" disabled={submitting || !file}>
                  {submitting ? '上传中…' : '提交原片'}
                </button>

                {uploadMsg && <p className="msg-ok">{uploadMsg}</p>}

                <button
                  type="button"
                  className={`btn-finish ${rawDeliverables.length === 0 ? 'btn-finish--disabled' : ''}`}
                  onClick={handleFinishRecording}
                  disabled={rawDeliverables.length === 0}
                >
                  完成录制
                </button>
              </form>
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

  .main { max-width:800px; margin:0 auto; padding:32px 16px 80px; }
  .run-ref { font-family:var(--serif); font-size:clamp(20px,5vw,28px); font-weight:700; color:var(--text); margin-bottom:6px; }
  .run-meta { font-size:13px; color:var(--text-muted); margin-bottom:24px; }

  .rework-banner { padding:16px 20px; background:rgba(192,80,74,.08); border:1px solid rgba(192,80,74,.3); border-left:3px solid var(--red); margin-bottom:28px; }
  .rework-label { font-size:10px; font-weight:600; letter-spacing:.18em; text-transform:uppercase; color:var(--red); margin-bottom:8px; }
  .rework-text { font-size:15px; color:#e8a0a0; line-height:1.7; white-space:pre-wrap; }

  .teleprompter { width:100%; font-family:var(--serif); font-size:clamp(20px,4vw,32px); line-height:2; padding:clamp(20px,4vw,48px); background:#060606; color:#dedad2; border:1px solid var(--border); outline:none; resize:vertical; cursor:default; margin-bottom:32px; }

  .section-label { font-size:10px; font-weight:600; letter-spacing:.18em; text-transform:uppercase; color:var(--text-muted); margin-bottom:12px; }

  .deliverables { margin-bottom:28px; }
  .deliverable-row { display:flex; justify-content:space-between; align-items:center; padding:10px 0; border-bottom:1px solid var(--border); }
  .deliverable-name { font-size:14px; color:var(--text-muted); }
  .deliverable-check { font-size:14px; color:var(--green); }

  .upload-section { display:flex; flex-direction:column; gap:0; }
  .upload-section .section-label { margin-bottom:16px; }

  .form-input { width:100%; font-family:var(--mono); font-size:14px; padding:10px 14px; background:var(--surface2); color:var(--text); border:1px solid var(--border); outline:none; transition:border-color .15s; }
  .form-input:focus { border-color:var(--amber); }
  .form-input::placeholder { color:var(--text-dim); }

  .dropzone { padding:28px 18px; border:1px dashed var(--border2); background:var(--surface); cursor:pointer; text-align:center; font-size:14px; color:var(--text-muted); transition:border-color .15s,color .15s; margin-bottom:0; }
  .dropzone:hover { border-color:var(--amber); color:var(--text); }
  .dropzone--selected { color:var(--text); border-color:var(--border2); border-style:solid; }

  .upload-status { display:flex; flex-direction:column; gap:6px; padding:12px 14px; background:var(--surface); border:1px solid var(--border); }
  .upload-status-row { display:flex; justify-content:space-between; align-items:center; }
  .upload-phase-label { font-size:12px; font-weight:600; color:var(--amber); letter-spacing:.06em; }
  .upload-pct { font-size:12px; color:var(--text-muted); font-variant-numeric:tabular-nums; }
  .upload-meta { display:flex; justify-content:space-between; align-items:center; }
  .upload-size { font-size:11px; color:var(--text-dim); }
  .upload-stall { font-size:11px; color:#b08040; }
  .progress-bar { height:4px; background:var(--border); border-radius:2px; }
  .progress-fill { height:4px; background:var(--amber); border-radius:2px; transition:width .3s; }
  .progress-fill--pulse { animation:progressPulse 1.5s ease-in-out infinite; }
  @keyframes progressPulse { 0%,100%{opacity:.6;} 50%{opacity:1;} }

  .msg-ok { font-size:13px; color:var(--green); padding:8px 12px; border-left:2px solid var(--green); background:rgba(90,138,106,.1); }
  .msg-err { font-size:13px; color:var(--red); padding:8px 12px; border-left:2px solid var(--red); background:rgba(192,80,74,.1); }

  .btn-ghost { padding:11px 18px; font-family:var(--mono); font-size:13px; font-weight:500; color:var(--text-muted); background:none; border:1px solid var(--border); cursor:pointer; transition:color .15s,border-color .15s; }
  .btn-ghost:hover:not(:disabled) { color:var(--text); border-color:var(--border2); }
  .btn-ghost:disabled { opacity:.5; cursor:not-allowed; }
  .btn-ghost--full { width:100%; text-align:center; }

  .btn-finish { width:100%; padding:13px; font-family:var(--mono); font-size:14px; font-weight:600; color:#000; background:var(--amber); border:none; cursor:pointer; transition:background .15s; }
  .btn-finish:hover:not(:disabled) { background:#f0ac30; }
  .btn-finish--disabled { background:var(--surface2); color:var(--text-dim); cursor:not-allowed; }

  @media (max-width:480px) {
    .header { padding:12px 16px; }
    .brand-mark { width:32px; height:32px; font-size:16px; }
    .brand-title { font-size:16px; }
    .main { padding:20px 12px 80px; }
    .teleprompter { font-size:clamp(18px,5vw,24px); padding:20px 16px; }
  }
`
