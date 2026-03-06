'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export const dynamic = 'force-dynamic'

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
  const [rawDeliverables, setRawDeliverables] = useState<{ storage_path: string; file_label: string | null }[]>([])
  const [loadingRawIdx, setLoadingRawIdx] = useState<{ idx: number; action: 'view' | 'dl' } | null>(null)
  const [finalStoragePath, setFinalStoragePath] = useState<string | null>(null)
  const [finalFileLabel, setFinalFileLabel] = useState<string | null>(null)
  const [loadingFinalUrl, setLoadingFinalUrl] = useState(false)
  const [loadingFinalDownload, setLoadingFinalDownload] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

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
        .select('script_text')
        .eq('id', scriptId)
        .single()
      setScriptText(sc?.script_text ?? null)

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
    setLoadingRawIdx({ idx, action: 'dl' })
    const { data, error } = await supabase.storage.from('videos').createSignedUrl(storagePath, 3600)
    if (error || !data?.signedUrl) { setLoadingRawIdx(null); setError('无法生成下载链接：' + (error?.message ?? '')); return }
    const res = await fetch(data.signedUrl)
    const blob = await res.blob()
    setLoadingRawIdx(null)
    const blobUrl = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = blobUrl
    a.download = fileLabel ?? storagePath.split('/').pop() ?? 'video'
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
    setLoadingFinalDownload(true)
    const { data, error } = await supabase.storage.from('videos').createSignedUrl(finalStoragePath, 3600)
    if (error || !data?.signedUrl) { setLoadingFinalDownload(false); setError('无法生成下载链接：' + (error?.message ?? '')); return }
    const res = await fetch(data.signedUrl)
    const blob = await res.blob()
    setLoadingFinalDownload(false)
    const blobUrl = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = blobUrl
    a.download = finalFileLabel ?? finalStoragePath.split('/').pop() ?? 'video'
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
    const storagePath = `final/${scriptId}/${timestamp}-${file.name}`

    const { error: uploadErr } = await supabase.storage
      .from('videos')
      .upload(storagePath, file)

    if (uploadErr) {
      setError(uploadErr.message)
      setSubmitting(false)
      return
    }

    const { error: delErr } = await supabase.from('deliverables').insert({
      script_id: scriptId,
      type: 'final',
      storage_path: storagePath,
      baidu_share_url: '',
      file_label: fileLabel.trim() || file.name,
      created_by: userId,
    })

    if (delErr) { setError(delErr.message); setSubmitting(false); return }

    if (taskId) {
      await supabase.from('tasks').update({ status: 'DONE' }).eq('id', taskId)
    }

    router.replace('/editor/inbox')
  }

  if (loading) return <div style={{ padding: 48, background: '#111', minHeight: '100vh', color: '#f0f0f0' }}>Loading...</div>

  return (
    <div style={{ minHeight: '100vh', background: '#111', color: '#f0f0f0' }}>
      <div style={{ maxWidth: 1080, margin: '0 auto', padding: 48, fontFamily: 'monospace' }}>
        <button onClick={() => router.push('/editor/inbox')} style={{ fontSize: 18, marginBottom: 36, cursor: 'pointer', background: 'none', border: 'none', textDecoration: 'underline', color: '#888' }}>
          ← 返回
        </button>

        <h1 style={{ fontSize: 27, fontWeight: 700, marginBottom: 24 }}>{taskDone ? '已完成剪辑' : '提交成片'}</h1>

        {taskComment && !taskDone && (
          <div style={{ marginBottom: 36, padding: '18px 24px', background: '#1a0000', border: '1px solid #7f1d1d' }}>
            <p style={{ fontSize: 15, color: '#f87171', textTransform: 'uppercase', letterSpacing: 2, marginBottom: 8 }}>返工说明</p>
            <p style={{ fontSize: 20, color: '#fca5a5', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{taskComment}</p>
          </div>
        )}

        {scriptText && (
          <pre style={{ fontSize: 20, whiteSpace: 'pre-wrap', background: '#000', color: '#f0f0f0', padding: 36, marginBottom: 48, lineHeight: 1.8, border: '1px solid #2a2a2a' }}>
            {scriptText}
          </pre>
        )}

        {taskDone ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div style={{ padding: '18px 24px', border: '1px solid #2a2a2a', background: '#1a1a1a' }}>
              <p style={{ fontSize: 18, color: '#888', marginBottom: 12 }}>原片</p>
              {rawDeliverables.length > 0 ? rawDeliverables.map((d, i) => {
                const isViewing = loadingRawIdx?.idx === i && loadingRawIdx.action === 'view'
                const isDling   = loadingRawIdx?.idx === i && loadingRawIdx.action === 'dl'
                return (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 18, padding: '10px 0', borderBottom: '1px solid #1e1e1e' }}>
                    <span style={{ fontSize: 20, flex: 1 }}>{d.file_label ?? d.storage_path.split('/').pop()}</span>
                    <button type="button" onClick={() => openRawUrl(d.storage_path, i)} disabled={!!loadingRawIdx}
                      style={{ fontSize: 18, padding: '6px 18px', background: '#111', color: '#60a5fa', border: '1px solid #2a2a2a', cursor: isViewing ? 'wait' : 'pointer' }}>
                      {isViewing ? '生成中…' : '查看'}
                    </button>
                    <button type="button" onClick={() => downloadRawFile(d.storage_path, d.file_label, i)} disabled={!!loadingRawIdx}
                      style={{ fontSize: 18, padding: '6px 18px', background: '#111', color: '#a3e635', border: '1px solid #2a2a2a', cursor: isDling ? 'wait' : 'pointer' }}>
                      {isDling ? '生成中…' : '下载'}
                    </button>
                  </div>
                )
              }) : <p style={{ fontSize: 20, color: '#555' }}>暂无记录。</p>}
            </div>
            <div style={{ padding: '18px 24px', border: '1px solid #2a2a2a', background: '#1a1a1a' }}>
              <p style={{ fontSize: 18, color: '#888', marginBottom: 12 }}>成片</p>
              {finalStoragePath ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
                  <span style={{ fontSize: 20, flex: 1 }}>{finalFileLabel ?? finalStoragePath}</span>
                  <button type="button" onClick={openFinalUrl} disabled={loadingFinalUrl} style={{ fontSize: 18, padding: '6px 18px', background: '#111', color: '#60a5fa', border: '1px solid #2a2a2a', cursor: loadingFinalUrl ? 'wait' : 'pointer' }}>
                    {loadingFinalUrl ? '生成中…' : '查看'}
                  </button>
                  <button type="button" onClick={downloadFinalFile} disabled={loadingFinalDownload} style={{ fontSize: 18, padding: '6px 18px', background: '#111', color: '#a3e635', border: '1px solid #2a2a2a', cursor: loadingFinalDownload ? 'wait' : 'pointer' }}>
                    {loadingFinalDownload ? '生成中…' : '下载'}
                  </button>
                </div>
              ) : (
                <p style={{ fontSize: 20, color: '#555' }}>暂无记录。</p>
              )}
            </div>
            {error && <p style={{ color: '#f87171', fontSize: 20 }}>{error}</p>}
          </div>
        ) : (
          <>
            {rawDeliverables.length > 0 && (
              <div style={{ marginBottom: 36, padding: '18px 24px', border: '1px solid #2a2a2a', background: '#1a1a1a' }}>
                <p style={{ fontSize: 18, color: '#888', marginBottom: 12 }}>原片</p>
                {rawDeliverables.map((d, i) => {
                  const isViewing = loadingRawIdx?.idx === i && loadingRawIdx.action === 'view'
                  const isDling   = loadingRawIdx?.idx === i && loadingRawIdx.action === 'dl'
                  return (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 18, padding: '10px 0', borderBottom: '1px solid #1e1e1e' }}>
                      <span style={{ fontSize: 20, flex: 1 }}>{d.file_label ?? d.storage_path.split('/').pop()}</span>
                      <button type="button" onClick={() => openRawUrl(d.storage_path, i)} disabled={!!loadingRawIdx}
                        style={{ fontSize: 18, padding: '6px 18px', background: '#111', color: '#60a5fa', border: '1px solid #2a2a2a', cursor: isViewing ? 'wait' : 'pointer' }}>
                        {isViewing ? '生成中…' : '查看'}
                      </button>
                      <button type="button" onClick={() => downloadRawFile(d.storage_path, d.file_label, i)} disabled={!!loadingRawIdx}
                        style={{ fontSize: 18, padding: '6px 18px', background: '#111', color: '#a3e635', border: '1px solid #2a2a2a', cursor: isDling ? 'wait' : 'pointer' }}>
                        {isDling ? '生成中…' : '下载'}
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              <input
                type="text"
                placeholder="文件名备注（可选，如 EP001-成片）"
                value={fileLabel}
                onChange={e => setFileLabel(e.target.value)}
                style={{ padding: '12px 18px', fontSize: 21, border: '1px solid #2a2a2a', outline: 'none', background: '#1a1a1a', color: '#f0f0f0' }}
              />
              <div
                onClick={() => fileInputRef.current?.click()}
                style={{ padding: '24px 18px', border: '2px dashed #2a2a2a', background: '#1a1a1a', cursor: 'pointer', textAlign: 'center', fontSize: 20, color: file ? '#f0f0f0' : '#555' }}
              >
                {file ? `已选择：${file.name}` : '点击选择视频文件'}
              </div>
              <input ref={fileInputRef} type="file" accept="video/*" style={{ display: 'none' }} onChange={e => setFile(e.target.files?.[0] ?? null)} />
              {error && <p style={{ color: '#f87171', fontSize: 20 }}>{error}</p>}
              <button
                type="submit"
                disabled={submitting || !file}
                style={{ padding: '15px', fontSize: 21, fontWeight: 600, background: '#f0f0f0', color: '#111', border: 'none', cursor: submitting || !file ? 'not-allowed' : 'pointer', opacity: submitting || !file ? 0.6 : 1 }}
              >
                {submitting ? '上传中…' : '提交成片'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  )
}
