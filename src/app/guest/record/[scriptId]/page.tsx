'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { resumableUpload } from '@/lib/storage/resumableUpload'

type Script = {
  id: string
  script_text: string | null
  reference_id: string | null
  ref: { run_ref_id: string }[] | null
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
  const [uploadProgress, setUploadProgress] = useState<number | null>(null)

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace('/login'); return }
      setUserId(user.id)

      const { data: sc } = await supabase
        .from('scripts')
        .select('id, script_text, reference_id, ref:references!reference_id(run_ref_id)')
        .eq('id', scriptId)
        .single()
      setScript((sc as Script) ?? null)
      setCurrentScriptText(sc?.script_text ?? '')

      const { data: task } = await supabase
        .from('tasks')
        .select('id, status')
        .eq('script_id', scriptId)
        .eq('type', 'RECORD_VIDEO')
        .eq('assignee_id', user.id)
        .maybeSingle()

      if (task?.status === 'OPEN') setTaskId(task.id)
      if (task?.status === 'DONE') setTaskDone(true)

      const { data: dels } = await supabase
        .from('deliverables')
        .select('storage_path, file_label')
        .eq('script_id', scriptId)
        .eq('type', 'raw')
        .order('created_at', { ascending: true })
      setRawDeliverables(dels ?? [])

      setLoading(false)
    }
    load()
  }, [scriptId])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setUploadMsg('')
    if (!file) { setError('请选择视频文件'); return }
    if (!script || !userId) return
    setSubmitting(true)

    const timestamp = Date.now()
    const storagePath = `raw/${scriptId}/${timestamp}-${file.name}`

    setUploadProgress(0)
    try {
      await resumableUpload(supabase, 'videos', storagePath, file, setUploadProgress)
    } catch (err: any) {
      const httpStatus = (err as any)?.originalResponse?.getStatus?.()
      const isTooBig = httpStatus === 413 || /too large|exceed/i.test(err.message ?? '')
      setError(isTooBig ? '文件过大，请减小文件后重试' : (err.message ?? '上传失败'))
      setUploadProgress(null)
      setSubmitting(false)
      return
    }
    setUploadProgress(null)

    const { error: delErr } = await supabase.from('deliverables').insert({
      script_id: scriptId,
      type: 'raw',
      storage_path: storagePath,
      baidu_share_url: '',
      file_label: fileLabel.trim() || file.name,
      created_by: userId,
    })
    if (delErr) { setError(delErr.message); setSubmitting(false); return }

    const { data: dels } = await supabase
      .from('deliverables')
      .select('storage_path, file_label')
      .eq('script_id', scriptId)
      .eq('type', 'raw')
      .order('created_at', { ascending: true })
    setRawDeliverables(dels ?? [])

    setFile(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
    setFileLabel('')
    setUploadMsg('原片已上传，可继续上传或点击「完成录制」。')
    setSubmitting(false)
  }

  async function handleFinishRecording() {
    if (!taskId) return
    await supabase.from('tasks').update({ status: 'DONE' }).eq('id', taskId)
    router.replace('/guest/inbox')
  }

  if (loading) return <div style={{ padding: 'clamp(16px, 5vw, 48px)', background: '#111', minHeight: '100vh', color: '#f0f0f0' }}>Loading...</div>
  if (!script) return <div style={{ padding: 'clamp(16px, 5vw, 48px)', background: '#111', minHeight: '100vh', color: '#f0f0f0' }}>Script not found.</div>

  return (
    <div style={{ minHeight: '100vh', background: '#111', color: '#f0f0f0' }}>
      <div style={{ maxWidth: 1080, margin: '0 auto', padding: 'clamp(16px, 5vw, 48px)', fontFamily: 'monospace', boxSizing: 'border-box' }}>
        <button onClick={() => router.push('/guest/inbox')} style={{ fontSize: 18, marginBottom: 36, cursor: 'pointer', background: 'none', border: 'none', textDecoration: 'underline', color: '#888' }}>
          ← 返回
        </button>

        <h1 style={{ fontSize: 'clamp(18px, 4vw, 27px)', fontWeight: 700, marginBottom: 6 }}>{script.ref?.[0]?.run_ref_id ?? scriptId}</h1>
        <p style={{ fontSize: 18, color: '#555', marginBottom: 48 }}>{taskDone ? '已完成录制。' : '请对照以下脚本录制视频，完成后上传视频文件。'}</p>

        <textarea
          value={currentScriptText}
          readOnly
          rows={12}
          style={{ width: '100%', boxSizing: 'border-box', background: '#000', color: '#f0f0f0', padding: 'clamp(16px, 4vw, 48px)', marginBottom: 'clamp(24px, 5vw, 60px)', fontSize: 'clamp(18px, 4vw, 30px)', lineHeight: 2, border: '1px solid #2a2a2a', outline: 'none', resize: 'vertical', cursor: 'default' }}
        />

        {rawDeliverables.length > 0 && (
          <div style={{ marginBottom: 36 }}>
            <p style={{ fontSize: 15, color: '#444', textTransform: 'uppercase', letterSpacing: 3, marginBottom: 12 }}>已上传原片 ({rawDeliverables.length})</p>
            {rawDeliverables.map((d, i) => (
              <div key={i} style={{ padding: '10px 0', borderBottom: '1px solid #1e1e1e', fontSize: 20, color: '#888' }}>
                {d.file_label ?? d.storage_path.split('/').pop()}
              </div>
            ))}
          </div>
        )}

        {!taskDone && (
          <>
            <h2 style={{ fontSize: 21, fontWeight: 600, marginBottom: 24 }}>提交原片</h2>
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              <input
                type="text"
                placeholder="文件名备注（可选，如 EP001-原片）"
                value={fileLabel}
                onChange={e => setFileLabel(e.target.value)}
                style={{ padding: '12px 18px', fontSize: 'clamp(17px, 3vw, 21px)', border: '1px solid #2a2a2a', outline: 'none', background: '#1a1a1a', color: '#f0f0f0', width: '100%', boxSizing: 'border-box' }}
              />
              <div
                onClick={() => fileInputRef.current?.click()}
                style={{
                  padding: '24px 18px',
                  border: '2px dashed #2a2a2a',
                  background: '#1a1a1a',
                  cursor: 'pointer',
                  textAlign: 'center',
                  fontSize: 20,
                  color: file ? '#f0f0f0' : '#555',
                }}
              >
                {file ? `已选择：${file.name}` : '点击选择视频文件'}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="video/*"
                style={{ display: 'none' }}
                onChange={e => setFile(e.target.files?.[0] ?? null)}
              />
              {error && <p style={{ color: '#f87171', fontSize: 20 }}>{error}</p>}
              {uploadProgress !== null && (
                <div>
                  <div style={{ height: 4, background: '#2a2a2a', borderRadius: 2 }}>
                    <div style={{ height: 4, background: '#6ee7b7', borderRadius: 2, width: `${uploadProgress}%`, transition: 'width 0.2s' }} />
                  </div>
                  <p style={{ fontSize: 14, color: '#888', marginTop: 4 }}>{uploadProgress}%</p>
                </div>
              )}
              <button
                type="submit"
                disabled={submitting || !file}
                style={{ padding: '15px', fontSize: 'clamp(17px, 3vw, 21px)', fontWeight: 600, background: '#f0f0f0', color: '#111', border: 'none', cursor: submitting || !file ? 'not-allowed' : 'pointer', opacity: submitting || !file ? 0.6 : 1 }}
              >
                {submitting ? '上传中…' : '提交原片'}
              </button>
              {uploadMsg && <p style={{ fontSize: 16, color: '#6ee7b7' }}>{uploadMsg}</p>}
              <button
                type="button"
                onClick={handleFinishRecording}
                disabled={rawDeliverables.length === 0}
                style={{ padding: '15px', fontSize: 'clamp(17px, 3vw, 21px)', fontWeight: 600, background: rawDeliverables.length === 0 ? '#1a1a1a' : '#4ade80', color: rawDeliverables.length === 0 ? '#555' : '#111', border: 'none', cursor: rawDeliverables.length === 0 ? 'not-allowed' : 'pointer' }}
              >
                完成录制
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  )
}
