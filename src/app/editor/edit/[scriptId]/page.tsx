'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

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
  const [scriptText, setScriptText] = useState<string | null>(null)
  const [rawStoragePath, setRawStoragePath] = useState<string | null>(null)
  const [rawFileLabel, setRawFileLabel] = useState<string | null>(null)
  const [loadingRawUrl, setLoadingRawUrl] = useState(false)
  const [loadingRawDownload, setLoadingRawDownload] = useState(false)
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

      const { data: task } = await supabase
        .from('tasks')
        .select('id, status')
        .eq('script_id', scriptId)
        .eq('type', 'EDIT_VIDEO')
        .eq('assignee_id', user.id)
        .maybeSingle()

      if (task?.status === 'OPEN') setTaskId(task.id)
      if (task?.status === 'DONE') setTaskDone(true)

      const { data: sc } = await supabase
        .from('scripts')
        .select('script_text')
        .eq('id', scriptId)
        .single()
      setScriptText(sc?.script_text ?? null)

      const { data: rawDel } = await supabase
        .from('deliverables')
        .select('storage_path, file_label')
        .eq('script_id', scriptId)
        .eq('type', 'raw')
        .maybeSingle()
      setRawStoragePath(rawDel?.storage_path ?? null)
      setRawFileLabel(rawDel?.file_label ?? null)

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

  async function openRawUrl() {
    if (!rawStoragePath) return
    setLoadingRawUrl(true)
    const { data, error } = await supabase.storage
      .from('videos')
      .createSignedUrl(rawStoragePath, 3600)
    setLoadingRawUrl(false)
    if (error || !data?.signedUrl) { setError('无法生成链接：' + (error?.message ?? '')); return }
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
  }

  async function downloadRawFile() {
    if (!rawStoragePath) return
    setLoadingRawDownload(true)
    const { data, error } = await supabase.storage
      .from('videos')
      .createSignedUrl(rawStoragePath, 3600)
    if (error || !data?.signedUrl) { setLoadingRawDownload(false); setError('无法生成下载链接：' + (error?.message ?? '')); return }
    const res = await fetch(data.signedUrl)
    const blob = await res.blob()
    setLoadingRawDownload(false)
    const blobUrl = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = blobUrl
    a.download = rawFileLabel ?? rawStoragePath.split('/').pop() ?? 'video'
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

        {scriptText && (
          <pre style={{ fontSize: 20, whiteSpace: 'pre-wrap', background: '#000', color: '#f0f0f0', padding: 36, marginBottom: 48, lineHeight: 1.8, border: '1px solid #2a2a2a' }}>
            {scriptText}
          </pre>
        )}

        {taskDone ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {[
              { label: '原片', path: rawStoragePath, fileLabel: rawFileLabel, loadingView: loadingRawUrl, loadingDl: loadingRawDownload, onView: openRawUrl, onDownload: downloadRawFile },
              { label: '成片', path: finalStoragePath, fileLabel: finalFileLabel, loadingView: loadingFinalUrl, loadingDl: loadingFinalDownload, onView: openFinalUrl, onDownload: downloadFinalFile },
            ].map(({ label, path, fileLabel: fl, loadingView: lv, loadingDl: ld, onView, onDownload }) => (
              <div key={label} style={{ padding: '18px 24px', border: '1px solid #2a2a2a', background: '#1a1a1a' }}>
                <p style={{ fontSize: 18, color: '#888', marginBottom: 12 }}>{label}</p>
                {path ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
                    <span style={{ fontSize: 20, flex: 1 }}>{fl ?? path}</span>
                    <button type="button" onClick={onView} disabled={lv} style={{ fontSize: 18, padding: '6px 18px', background: '#111', color: '#60a5fa', border: '1px solid #2a2a2a', cursor: lv ? 'wait' : 'pointer' }}>
                      {lv ? '生成中…' : '查看'}
                    </button>
                    <button type="button" onClick={onDownload} disabled={ld} style={{ fontSize: 18, padding: '6px 18px', background: '#111', color: '#a3e635', border: '1px solid #2a2a2a', cursor: ld ? 'wait' : 'pointer' }}>
                      {ld ? '生成中…' : '下载'}
                    </button>
                  </div>
                ) : (
                  <p style={{ fontSize: 20, color: '#555' }}>暂无记录。</p>
                )}
              </div>
            ))}
            {error && <p style={{ color: '#f87171', fontSize: 20 }}>{error}</p>}
          </div>
        ) : (
          <>
            {rawStoragePath && (
              <div style={{ marginBottom: 36, padding: '18px 24px', border: '1px solid #2a2a2a', background: '#1a1a1a' }}>
                <p style={{ fontSize: 18, color: '#888', marginBottom: 12 }}>原片</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
                  <span style={{ fontSize: 20 }}>{rawFileLabel ?? rawStoragePath}</span>
                  <button type="button" onClick={openRawUrl} disabled={loadingRawUrl} style={{ fontSize: 18, padding: '6px 18px', background: '#111', color: '#60a5fa', border: '1px solid #2a2a2a', cursor: loadingRawUrl ? 'wait' : 'pointer' }}>
                    {loadingRawUrl ? '生成中…' : '查看'}
                  </button>
                  <button type="button" onClick={downloadRawFile} disabled={loadingRawDownload} style={{ fontSize: 18, padding: '6px 18px', background: '#111', color: '#a3e635', border: '1px solid #2a2a2a', cursor: loadingRawDownload ? 'wait' : 'pointer' }}>
                    {loadingRawDownload ? '生成中…' : '下载'}
                  </button>
                </div>
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
