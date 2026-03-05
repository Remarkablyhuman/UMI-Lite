'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

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
  const [rawStoragePath, setRawStoragePath] = useState<string | null>(null)
  const [rawFileLabel, setRawFileLabel] = useState<string | null>(null)
  const [loadingView, setLoadingView] = useState(false)
  const [loadingDownload, setLoadingDownload] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [fileLabel, setFileLabel] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [currentScriptText, setCurrentScriptText] = useState('')
  const [guestComment, setGuestComment] = useState('')
  const [generating, setGenerating] = useState(false)
  const [aiDraft, setAiDraft] = useState<string | null>(null)
  const [savingScript, setSavingScript] = useState(false)

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
      if (task?.status === 'DONE') {
        setTaskDone(true)
        const { data: rawDel } = await supabase
          .from('deliverables')
          .select('storage_path, file_label')
          .eq('script_id', scriptId)
          .eq('type', 'raw')
          .maybeSingle()
        setRawStoragePath(rawDel?.storage_path ?? null)
        setRawFileLabel(rawDel?.file_label ?? null)
      }

      setLoading(false)
    }
    load()
  }, [scriptId])

  async function generateForGuest() {
    if (!userId || !currentScriptText) return
    setGenerating(true)
    setAiDraft(null)

    const { data: personaRow } = await supabase
      .from('guest_profiles')
      .select('profile_data')
      .eq('guest_id', userId)
      .maybeSingle()

    const res = await fetch('/api/generate-script', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        referenceTranscript: currentScriptText,
        extraInstructions: guestComment,
        personaJson: personaRow?.profile_data ?? {},
        constraints: { target_chars: 600, platform: 'wechat', format: 'voice_over' },
      }),
    })
    const data = await res.json()
    setGenerating(false)
    if (data.error) { setError('AI 生成失败：' + data.error); return }
    setAiDraft(data.part1 ?? null)
  }

  async function approveAiScript() {
    if (!aiDraft) return
    setSavingScript(true)
    const { error: updateErr } = await supabase
      .from('scripts')
      .update({ script_text: aiDraft })
      .eq('id', scriptId)
    setSavingScript(false)
    if (updateErr) { setError(updateErr.message); return }
    setCurrentScriptText(aiDraft)
    setAiDraft(null)
    setGuestComment('')
  }

  async function openRawUrl() {
    if (!rawStoragePath) return
    setLoadingView(true)
    const { data, error } = await supabase.storage.from('videos').createSignedUrl(rawStoragePath, 3600)
    setLoadingView(false)
    if (error || !data?.signedUrl) { setError('无法生成链接：' + (error?.message ?? '')); return }
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
  }

  async function downloadRawFile() {
    if (!rawStoragePath) return
    setLoadingDownload(true)
    const { data, error } = await supabase.storage.from('videos').createSignedUrl(rawStoragePath, 3600)
    if (error || !data?.signedUrl) { setLoadingDownload(false); setError('无法生成下载链接：' + (error?.message ?? '')); return }
    const res = await fetch(data.signedUrl)
    const blob = await res.blob()
    setLoadingDownload(false)
    const blobUrl = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = blobUrl
    a.download = rawFileLabel ?? rawStoragePath.split('/').pop() ?? 'video'
    a.click()
    URL.revokeObjectURL(blobUrl)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (!file) { setError('请选择视频文件'); return }
    if (!script || !userId) return

    setSubmitting(true)

    const timestamp = Date.now()
    const storagePath = `raw/${scriptId}/${timestamp}-${file.name}`

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
      type: 'raw',
      storage_path: storagePath,
      baidu_share_url: '',
      file_label: fileLabel.trim() || file.name,
      created_by: userId,
    })

    if (delErr) { setError(delErr.message); setSubmitting(false); return }

    if (taskId) {
      await supabase.from('tasks').update({ status: 'DONE' }).eq('id', taskId)
    }

    router.replace('/guest/inbox')
  }

  if (loading) return <div style={{ padding: 48, background: '#111', minHeight: '100vh', color: '#f0f0f0' }}>Loading...</div>
  if (!script) return <div style={{ padding: 48, background: '#111', minHeight: '100vh', color: '#f0f0f0' }}>Script not found.</div>

  return (
    <div style={{ minHeight: '100vh', background: '#111', color: '#f0f0f0' }}>
      <div style={{ maxWidth: 1080, margin: '0 auto', padding: 48, fontFamily: 'monospace' }}>
        <button onClick={() => router.push('/guest/inbox')} style={{ fontSize: 18, marginBottom: 36, cursor: 'pointer', background: 'none', border: 'none', textDecoration: 'underline', color: '#888' }}>
          ← 返回
        </button>

        <h1 style={{ fontSize: 27, fontWeight: 700, marginBottom: 6 }}>{script.ref?.run_ref_id ?? scriptId}</h1>
        <p style={{ fontSize: 18, color: '#555', marginBottom: 48 }}>{taskDone ? '已完成录制。' : '请对照以下脚本录制视频，完成后上传视频文件。'}</p>

        <textarea
          value={currentScriptText}
          onChange={e => setCurrentScriptText(e.target.value)}
          rows={12}
          style={{ width: '100%', boxSizing: 'border-box', background: '#000', color: '#f0f0f0', padding: 48, marginBottom: 60, fontSize: 30, lineHeight: 2, border: '1px solid #2a2a2a', outline: 'none', resize: 'vertical' }}
        />

        {!taskDone && (
          <div style={{ marginBottom: 48, border: '1px solid #2a2a2a', background: '#1a1a1a', padding: '24px' }}>
            <p style={{ fontSize: 17, color: '#444', textTransform: 'uppercase', letterSpacing: 3, marginBottom: 18 }}>AI 润色脚本</p>
            <textarea
              placeholder="追加说明（可选）：例如「语气轻松一点」「加入我健身背景」"
              value={guestComment}
              onChange={e => setGuestComment(e.target.value)}
              rows={3}
              style={{ width: '100%', boxSizing: 'border-box', fontSize: 18, padding: 12, background: '#111', color: '#f0f0f0', border: '1px solid #2a2a2a', outline: 'none', resize: 'vertical', marginBottom: 12 }}
            />
            <button
              type="button"
              onClick={generateForGuest}
              disabled={generating}
              style={{ fontSize: 18, padding: '9px 24px', background: '#111', color: generating ? '#555' : '#f0f0f0', border: '1px solid #2a2a2a', cursor: generating ? 'wait' : 'pointer' }}
            >
              {generating ? 'AI 生成中…' : 'AI 生成'}
            </button>

            {aiDraft && (
              <div style={{ marginTop: 24 }}>
                <p style={{ fontSize: 16, color: '#555', marginBottom: 8 }}>生成结果 <span style={{ color: '#444' }}>({aiDraft.trim().length} 字)</span></p>
                <pre style={{ fontSize: 20, whiteSpace: 'pre-wrap', background: '#000', color: '#f0f0f0', padding: 24, lineHeight: 1.8, border: '1px solid #2a2a2a', marginBottom: 12 }}>
                  {aiDraft}
                </pre>
                <div style={{ display: 'flex', gap: 12 }}>
                  <button
                    type="button"
                    onClick={approveAiScript}
                    disabled={savingScript}
                    style={{ fontSize: 18, padding: '9px 24px', background: '#f0f0f0', color: '#111', border: 'none', cursor: savingScript ? 'wait' : 'pointer' }}
                  >
                    {savingScript ? '保存中…' : '确认保存'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setAiDraft(null)}
                    style={{ fontSize: 18, padding: '9px 24px', background: '#111', color: '#888', border: '1px solid #2a2a2a', cursor: 'pointer' }}
                  >
                    放弃
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {taskDone ? (
          <div>
            <h2 style={{ fontSize: 21, fontWeight: 600, marginBottom: 24 }}>已提交原片</h2>
            {rawStoragePath ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 18, padding: '18px 24px', border: '1px solid #2a2a2a', background: '#1a1a1a' }}>
                <span style={{ fontSize: 20, flex: 1 }}>{rawFileLabel ?? rawStoragePath}</span>
                <button type="button" onClick={openRawUrl} disabled={loadingView} style={{ fontSize: 18, padding: '6px 18px', background: '#111', color: '#60a5fa', border: '1px solid #2a2a2a', cursor: loadingView ? 'wait' : 'pointer' }}>
                  {loadingView ? '生成中…' : '查看'}
                </button>
                <button type="button" onClick={downloadRawFile} disabled={loadingDownload} style={{ fontSize: 18, padding: '6px 18px', background: '#111', color: '#a3e635', border: '1px solid #2a2a2a', cursor: loadingDownload ? 'wait' : 'pointer' }}>
                  {loadingDownload ? '生成中…' : '下载'}
                </button>
              </div>
            ) : (
              <p style={{ fontSize: 20, color: '#555' }}>暂无原片记录。</p>
            )}
            {error && <p style={{ color: '#f87171', fontSize: 20, marginTop: 12 }}>{error}</p>}
          </div>
        ) : (
          <>
            <h2 style={{ fontSize: 21, fontWeight: 600, marginBottom: 24 }}>提交原片</h2>
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <input
            type="text"
            placeholder="文件名备注（可选，如 EP001-原片）"
            value={fileLabel}
            onChange={e => setFileLabel(e.target.value)}
            style={{ padding: '12px 18px', fontSize: 21, border: '1px solid #2a2a2a', outline: 'none', background: '#1a1a1a', color: '#f0f0f0' }}
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
          <button
            type="submit"
            disabled={submitting || !file}
            style={{ padding: '15px', fontSize: 21, fontWeight: 600, background: '#f0f0f0', color: '#111', border: 'none', cursor: submitting || !file ? 'not-allowed' : 'pointer', opacity: submitting || !file ? 0.6 : 1 }}
          >
            {submitting ? '上传中…' : '提交原片'}
          </button>
        </form>
          </>
        )}
      </div>
    </div>
  )
}
