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

export default function EditorEditPage() {
  const router = useRouter()
  const { scriptId } = useParams<{ scriptId: string }>()
  const supabase = createClient()

  const [userId, setUserId] = useState<string | null>(null)
  const [taskId, setTaskId] = useState<string | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [fileLabel, setFileLabel] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [taskDone, setTaskDone] = useState(false)
  const [taskComment, setTaskComment] = useState<string | null>(null)
  const [scriptText, setScriptText] = useState<string | null>(null)
  const [runRefId, setRunRefId] = useState<string | null>(null)
  const [rawDeliverables, setRawDeliverables] = useState<{ storage_path: string; file_label: string | null }[]>([])
  const [loadingRawIdx, setLoadingRawIdx] = useState<{ idx: number; action: 'view' | 'dl-sign' | 'dl-fetch' } | null>(null)
  const [finalStoragePath, setFinalStoragePath] = useState<string | null>(null)
  const [finalFileLabel, setFinalFileLabel] = useState<string | null>(null)
  const [loadingFinalUrl, setLoadingFinalUrl] = useState(false)
  const [loadingFinalDownloadPhase, setLoadingFinalDownloadPhase] = useState<'sign' | 'fetch' | null>(null)
  const [rejectComment, setRejectComment] = useState('')
  const [rejecting, setRejecting] = useState(false)
  const [referenceId, setReferenceId] = useState<string | null>(null)
  const [guestId, setGuestId] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
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

      const { data: taskRows } = await supabase
        .from('tasks')
        .select('id, status, comment')
        .eq('script_id', scriptId)
        .eq('type', 'EDIT_VIDEO')
        .eq('assignee_id', user.id)
        .order('created_at', { ascending: false })

      const task = taskRows?.[0] ?? null
      if (task?.status === 'OPEN') { setTaskId(task.id); setTaskComment(task.comment ?? null) }
      if (task?.status === 'DONE') setTaskDone(true)

      const { data: sc } = await supabase
        .from('scripts')
        .select('script_text, reference_id, guest_id, ref:references!reference_id(run_ref_id)')
        .eq('id', scriptId)
        .single()
      setScriptText((sc as any)?.script_text ?? null)
      setRunRefId((sc as any)?.ref?.run_ref_id ?? null)
      setReferenceId((sc as any)?.reference_id ?? null)
      setGuestId((sc as any)?.guest_id ?? null)

      const { data: rawDels } = await supabase
        .from('deliverables')
        .select('storage_path, file_label')
        .eq('script_id', scriptId)
        .eq('type', 'raw')
        .order('created_at', { ascending: true })
      setRawDeliverables(rawDels ?? [])

      if (task?.status === 'DONE') {
        const { data: finalDel } = await supabase
          .from('deliverables')
          .select('storage_path, file_label')
          .eq('script_id', scriptId)
          .eq('type', 'final')
          .maybeSingle()
        setFinalStoragePath(finalDel?.storage_path ?? null)
        setFinalFileLabel(finalDel?.file_label ?? null)
      }

      setLoading(false)
    }
    load()
  }, [scriptId])

  async function openRawUrl(storagePath: string, idx: number) {
    setLoadingRawIdx({ idx, action: 'view' })
    const { data, error } = await supabase.storage.from('videos').createSignedUrl(storagePath, 3600)
    setLoadingRawIdx(null)
    if (error || !data?.signedUrl) { setError('无法生成链接：' + (error?.message ?? '')); return }
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
  }

  async function downloadRawFile(storagePath: string, fileLabel: string | null, idx: number) {
    setLoadingRawIdx({ idx, action: 'dl-sign' })
    const { data, error } = await supabase.storage.from('videos').createSignedUrl(storagePath, 3600)
    if (error || !data?.signedUrl) { setLoadingRawIdx(null); setError('无法生成下载链接：' + (error?.message ?? '')); return }
    setLoadingRawIdx({ idx, action: 'dl-fetch' })
    const res = await fetch(data.signedUrl)
    const blob = await res.blob()
    setLoadingRawIdx(null)
    const blobUrl = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = blobUrl
    a.download = fileLabel ?? 'video'
    a.click()
    URL.revokeObjectURL(blobUrl)
  }

  async function openFinalUrl() {
    if (!finalStoragePath) return
    setLoadingFinalUrl(true)
    const { data, error } = await supabase.storage.from('videos').createSignedUrl(finalStoragePath, 3600)
    setLoadingFinalUrl(false)
    if (error || !data?.signedUrl) { setError('无法生成链接：' + (error?.message ?? '')); return }
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
  }

  async function downloadFinalFile() {
    if (!finalStoragePath) return
    setLoadingFinalDownloadPhase('sign')
    const { data, error } = await supabase.storage.from('videos').createSignedUrl(finalStoragePath, 3600)
    if (error || !data?.signedUrl) { setLoadingFinalDownloadPhase(null); setError('无法生成下载链接：' + (error?.message ?? '')); return }
    setLoadingFinalDownloadPhase('fetch')
    const res = await fetch(data.signedUrl)
    const blob = await res.blob()
    setLoadingFinalDownloadPhase(null)
    const blobUrl = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = blobUrl
    a.download = finalFileLabel ?? 'video'
    a.click()
    URL.revokeObjectURL(blobUrl)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!file) { setError('请选择视频文件'); return }
    if (!userId) return

    setSubmitting(true)
    const timestamp = Date.now()
    const ext = file.name.includes('.') ? '.' + file.name.split('.').pop()!.replace(/[^a-zA-Z0-9]/g, '') : ''
    const storagePath = `final/${scriptId}/${timestamp}${ext}`

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
      setUploadProgress(null)
      setUploadPhase(null)
      setUploadStalled(false)
      setSubmitting(false)
      return
    }
    setUploadProgress(null)
    setUploadPhase('saving')

    const { error: delErr } = await supabase.from('deliverables').insert({
      script_id: scriptId,
      type: 'final',
      storage_path: storagePath,
      baidu_share_url: '',
      file_label: fileLabel.trim() || file.name,
      created_by: userId,
    })

    if (delErr) { setError(delErr.message); setUploadPhase(null); setSubmitting(false); return }

    if (taskId) {
      await supabase.from('tasks').update({ status: 'DONE' }).eq('id', taskId)
    }

    router.replace('/editor/inbox')
  }

  async function rejectRawFootage() {
    if (!rejectComment.trim()) { setError('请填写驳回说明。'); return }
    if (!taskId || !guestId || !referenceId) return
    setRejecting(true)

    await supabase.from('tasks').update({ status: 'DONE' }).eq('id', taskId)

    const { error: insErr } = await supabase.from('tasks').insert({
      type: 'RECORD_VIDEO',
      status: 'OPEN',
      reference_id: referenceId,
      script_id: scriptId,
      assignee_id: guestId,
      assignee_role: 'guest',
      comment: rejectComment.trim(),
    })

    if (insErr) { setError('驳回失败：' + insErr.message); setRejecting(false); return }
    router.replace('/editor/inbox')
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

  return (
    <>
      <style>{css}</style>
      <div className="shell">

        <header className="header">
          <div className="header-left">
            <div className="brand-mark">U</div>
            <div>
              <h1 className="brand-title">UMI</h1>
              <p className="brand-sub">剪辑工作台</p>
            </div>
          </div>
          <nav className="header-nav">
            <button className="nav-btn" onClick={() => router.push('/editor/inbox')}>← 任务</button>
            <button className="nav-btn nav-btn--ghost" onClick={async () => { await supabase.auth.signOut(); router.replace('/login') }}>退出</button>
          </nav>
        </header>

        <main className="main">
          {runRefId && <div className="run-ref">{runRefId}</div>}
          <p className="run-meta">{taskDone ? '已完成剪辑。' : '下载原片后完成剪辑，上传成片文件。'}</p>

          {/* 返工说明 */}
          {taskComment && !taskDone && (
            <div className="rework-banner">
              <p className="rework-label">返工说明</p>
              <p className="rework-text">{taskComment}</p>
            </div>
          )}

          {/* 原片 */}
          <div className="deliverables-section">
            <p className="section-label">原片 ({rawDeliverables.length})</p>
            {rawDeliverables.length > 0 ? rawDeliverables.map((d, i) => {
              const isViewing = loadingRawIdx?.idx === i && loadingRawIdx.action === 'view'
              const isDling   = loadingRawIdx?.idx === i && (loadingRawIdx.action === 'dl-sign' || loadingRawIdx.action === 'dl-fetch')
              const dlLabel =
                loadingRawIdx?.idx === i && loadingRawIdx.action === 'dl-sign' ? '准备中…' :
                loadingRawIdx?.idx === i && loadingRawIdx.action === 'dl-fetch' ? '下载中…' : '下载'
              return (
                <div key={i} className="deliverable-row">
                  <span className="deliverable-name">{d.file_label ?? '未命名文件'}</span>
                  <div className="deliverable-actions">
                    <button className="file-btn file-btn--view" onClick={() => openRawUrl(d.storage_path, i)} disabled={!!loadingRawIdx}>
                      {isViewing ? '生成中…' : '查看'}
                    </button>
                    <button className="file-btn file-btn--dl" onClick={() => downloadRawFile(d.storage_path, d.file_label, i)} disabled={!!loadingRawIdx}>
                      {dlLabel}
                    </button>
                  </div>
                </div>
              )
            }) : <p className="empty-row">暂无原片。</p>}
          </div>

          {/* 成片（已完成状态） */}
          {taskDone && (
            <div className="deliverables-section">
              <p className="section-label">成片</p>
              {finalStoragePath ? (
                <div className="deliverable-row">
                  <span className="deliverable-name">{finalFileLabel ?? '未命名文件'}</span>
                  <div className="deliverable-actions">
                    <button className="file-btn file-btn--view" onClick={openFinalUrl} disabled={loadingFinalUrl}>
                      {loadingFinalUrl ? '生成中…' : '查看'}
                    </button>
                    <button className="file-btn file-btn--dl" onClick={downloadFinalFile} disabled={!!loadingFinalDownloadPhase}>
                      {loadingFinalDownloadPhase === 'sign' ? '准备中…' : loadingFinalDownloadPhase === 'fetch' ? '下载中…' : '下载'}
                    </button>
                  </div>
                </div>
              ) : (
                <p className="empty-row">暂无记录。</p>
              )}
            </div>
          )}

          {/* 驳回原片 */}
          {taskId && rawDeliverables.length > 0 && (
            <div className="reject-section">
              <p className="section-label">驳回原片</p>
              <textarea
                className="form-input"
                placeholder="驳回说明（必填）：例如「背景有噪音，请重新录制」"
                value={rejectComment}
                onChange={e => setRejectComment(e.target.value)}
                rows={3}
              />
              <button
                type="button"
                className="btn-danger"
                onClick={rejectRawFootage}
                disabled={rejecting || !rejectComment.trim()}
              >
                {rejecting ? '处理中…' : '驳回原片，退回嘉宾重录'}
              </button>
            </div>
          )}

          {/* 提交成片表单 */}
          {!taskDone && (
            <div className="upload-section">
              <p className="section-label">提交成片</p>
              <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <input
                  className="form-input"
                  type="text"
                  placeholder="文件名备注（可选，如 EP001-成片）"
                  value={fileLabel}
                  onChange={e => setFileLabel(e.target.value)}
                />
                <div
                  className={`dropzone ${file ? 'dropzone--selected' : ''}`}
                  onClick={() => fileInputRef.current?.click()}
                >
                  {file ? `已选择：${file.name}` : '点击选择视频文件'}
                </div>
                <input ref={fileInputRef} type="file" accept="video/*" style={{ display: 'none' }} onChange={e => setFile(e.target.files?.[0] ?? null)} />

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

                <button
                  type="submit"
                  className={`btn-finish ${submitting || !file ? 'btn-finish--disabled' : ''}`}
                  disabled={submitting || !file}
                >
                  {submitting ? '上传中…' : '提交成片'}
                </button>
              </form>
            </div>
          )}

          {/* 脚本 */}
          {scriptText && (
            <div className="script-section">
              <p className="section-label">脚本内容</p>
              <pre className="script-pre">{scriptText}</pre>
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
    --green: #5a8a6a; --red: #c0504a; --blue: #4a80c0;
    --mono: 'IBM Plex Mono', monospace; --serif: 'Noto Serif SC', serif;
  }
  body { background: var(--bg); color: var(--text); }

  .shell { min-height: 100vh; background: var(--bg); font-family: var(--mono); }

  .loading-state { display: flex; align-items: center; justify-content: center; min-height: 100vh; gap: 6px; }
  .dot { width: 6px; height: 6px; border-radius: 50%; background: var(--amber); animation: pulse 1s ease-in-out infinite; }
  @keyframes pulse { 0%, 100% { opacity: .2; transform: scale(.8); } 50% { opacity: 1; transform: scale(1); } }

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
  .run-ref { font-family: var(--serif); font-size: clamp(20px,5vw,28px); font-weight: 700; color: var(--text); margin-bottom: 6px; }
  .run-meta { font-size: 13px; color: var(--text-muted); margin-bottom: 28px; }

  .rework-banner { padding: 16px 20px; background: rgba(192,80,74,.08); border: 1px solid rgba(192,80,74,.3); border-left: 3px solid var(--red); margin-bottom: 28px; }
  .rework-label { font-size: 10px; font-weight: 600; letter-spacing: .18em; text-transform: uppercase; color: var(--red); margin-bottom: 8px; }
  .rework-text { font-size: 15px; color: #e8a0a0; line-height: 1.7; white-space: pre-wrap; }

  .section-label { font-size: 10px; font-weight: 600; letter-spacing: .18em; text-transform: uppercase; color: var(--text-muted); margin-bottom: 12px; }

  .deliverables-section { margin-bottom: 28px; }
  .deliverable-row { display: flex; justify-content: space-between; align-items: center; padding: 10px 0; border-bottom: 1px solid var(--border); gap: 12px; }
  .deliverable-name { font-size: 14px; color: var(--text-muted); flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .deliverable-actions { display: flex; gap: 8px; flex-shrink: 0; }
  .file-btn { padding: 6px 14px; font-family: var(--mono); font-size: 12px; font-weight: 500; cursor: pointer; border: 1px solid var(--border); background: var(--surface2); transition: color .15s, border-color .15s; }
  .file-btn:disabled { opacity: .5; cursor: wait; }
  .file-btn--view { color: var(--blue); }
  .file-btn--view:hover:not(:disabled) { border-color: var(--blue); }
  .file-btn--dl { color: var(--green); }
  .file-btn--dl:hover:not(:disabled) { border-color: var(--green); }
  .empty-row { font-size: 13px; color: var(--text-dim); padding: 10px 0; }

  .upload-section { margin-bottom: 36px; }
  .upload-section .section-label { margin-bottom: 16px; }

  .form-input { width: 100%; font-family: var(--mono); font-size: 14px; padding: 10px 14px; background: var(--surface2); color: var(--text); border: 1px solid var(--border); outline: none; transition: border-color .15s; }
  .form-input:focus { border-color: var(--amber); }
  .form-input::placeholder { color: var(--text-dim); }

  .dropzone { padding: 28px 18px; border: 1px dashed var(--border2); background: var(--surface); cursor: pointer; text-align: center; font-size: 14px; color: var(--text-muted); transition: border-color .15s, color .15s; }
  .dropzone:hover { border-color: var(--amber); color: var(--text); }
  .dropzone--selected { color: var(--text); border-color: var(--border2); border-style: solid; }

  .upload-status { display:flex; flex-direction:column; gap:6px; padding:12px 14px; background:var(--surface); border:1px solid var(--border); }
  .upload-status-row { display:flex; justify-content:space-between; align-items:center; }
  .upload-phase-label { font-size:12px; font-weight:600; color:var(--amber); letter-spacing:.06em; }
  .upload-pct { font-size:12px; color:var(--text-muted); font-variant-numeric:tabular-nums; }
  .upload-meta { display:flex; justify-content:space-between; align-items:center; }
  .upload-size { font-size:11px; color:var(--text-dim); }
  .upload-stall { font-size:11px; color:#b08040; }
  .progress-bar { height: 4px; background: var(--border); border-radius: 2px; }
  .progress-fill { height: 4px; background: var(--amber); border-radius: 2px; transition: width .3s; }
  .progress-fill--pulse { animation: progressPulse 1.5s ease-in-out infinite; }
  @keyframes progressPulse { 0%,100%{opacity:.6;} 50%{opacity:1;} }

  .msg-err { font-size: 13px; color: var(--red); padding: 8px 12px; border-left: 2px solid var(--red); background: rgba(192,80,74,.1); }

  .btn-finish { width: 100%; padding: 13px; font-family: var(--mono); font-size: 14px; font-weight: 600; color: #000; background: var(--amber); border: none; cursor: pointer; transition: background .15s; }
  .btn-finish:hover:not(.btn-finish--disabled) { background: #f0ac30; }
  .btn-finish--disabled { background: var(--surface2); color: var(--text-dim); cursor: not-allowed; }

  .reject-section { margin-bottom: 28px; display: flex; flex-direction: column; gap: 10px; }
  .btn-danger { width: 100%; padding: 11px; font-family: var(--mono); font-size: 13px; font-weight: 600; color: var(--red); background: none; border: 1px solid var(--red); cursor: pointer; transition: background .15s; }
  .btn-danger:hover:not(:disabled) { background: rgba(192,80,74,.08); }
  .btn-danger:disabled { opacity: .5; cursor: not-allowed; }

  .script-section { margin-top: 48px; padding-top: 28px; border-top: 1px solid var(--border); }
  .script-section .section-label { margin-bottom: 16px; }
  .script-pre { font-family: var(--serif); font-size: clamp(16px,3vw,20px); white-space: pre-wrap; background: #060606; color: #dedad2; padding: clamp(16px,4vw,36px); line-height: 1.9; border: 1px solid var(--border); }

  @media (max-width: 480px) {
    .header { padding: 12px 16px; }
    .brand-mark { width: 32px; height: 32px; font-size: 16px; }
    .brand-title { font-size: 16px; }
    .main { padding: 20px 12px 80px; }
    .deliverable-row { flex-direction: column; align-items: flex-start; }
    .deliverable-actions { width: 100%; }
    .file-btn { flex: 1; text-align: center; }
  }
`
