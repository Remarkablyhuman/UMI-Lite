'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

type Script = {
  id: string
  script_text: string | null
  ref: { run_ref_id: string } | null
}

export default function GuestRecordPage() {
  const router = useRouter()
  const { scriptId } = useParams<{ scriptId: string }>()
  const supabase = createClient()

  const [script, setScript] = useState<Script | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [taskId, setTaskId] = useState<string | null>(null)
  const [baiduUrl, setBaiduUrl] = useState('')
  const [baiduCode, setBaiduCode] = useState('')
  const [fileLabel, setFileLabel] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace('/login'); return }
      setUserId(user.id)

      const { data: sc } = await supabase
        .from('scripts')
        .select('id, script_text, ref:references!reference_id(run_ref_id)')
        .eq('id', scriptId)
        .single()
      setScript((sc as Script) ?? null)

      // Find the RECORD_VIDEO task for this script assigned to this user
      const { data: task } = await supabase
        .from('tasks')
        .select('id')
        .eq('script_id', scriptId)
        .eq('type', 'RECORD_VIDEO')
        .eq('assignee_id', user.id)
        .eq('status', 'OPEN')
        .single()
      setTaskId(task?.id ?? null)

      setLoading(false)
    }
    load()
  }, [scriptId])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setSubmitting(true)

    if (!script || !userId) return

    const { error: delErr } = await supabase.from('deliverables').insert({
      script_id: scriptId,
      type: 'raw',
      baidu_share_url: baiduUrl.trim(),
      baidu_extract_code: baiduCode.trim() || null,
      file_label: fileLabel.trim() || null,
      created_by: userId,
    })

    if (delErr) { setError(delErr.message); setSubmitting(false); return }

    // Mark RECORD_VIDEO task DONE (guest can update their assigned task)
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
        <p style={{ fontSize: 18, color: '#555', marginBottom: 48 }}>请对照以下脚本录制视频，完成后提交百度网盘链接。</p>

        <div style={{ background: '#000', color: '#f0f0f0', padding: 48, marginBottom: 60, fontSize: 30, lineHeight: 2, whiteSpace: 'pre-wrap', border: '1px solid #2a2a2a' }}>
          {script.script_text ?? ''}
        </div>

        <h2 style={{ fontSize: 21, fontWeight: 600, marginBottom: 24 }}>提交原片</h2>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <input
            type="text"
            placeholder="文件名（如 EP001-原片）"
            value={fileLabel}
            onChange={e => setFileLabel(e.target.value)}
            style={{ padding: '12px 18px', fontSize: 21, border: '1px solid #2a2a2a', outline: 'none', background: '#1a1a1a', color: '#f0f0f0' }}
          />
          <input
            type="text"
            placeholder="百度网盘分享链接"
            value={baiduUrl}
            onChange={e => setBaiduUrl(e.target.value)}
            required
            style={{ padding: '12px 18px', fontSize: 21, border: '1px solid #2a2a2a', outline: 'none', background: '#1a1a1a', color: '#f0f0f0' }}
          />
          <input
            type="text"
            placeholder="提取码"
            value={baiduCode}
            onChange={e => setBaiduCode(e.target.value)}
            style={{ padding: '12px 18px', fontSize: 21, border: '1px solid #2a2a2a', outline: 'none', background: '#1a1a1a', color: '#f0f0f0' }}
          />
          {error && <p style={{ color: '#f87171', fontSize: 20 }}>{error}</p>}
          <button
            type="submit"
            disabled={submitting}
            style={{ padding: '15px', fontSize: 21, fontWeight: 600, background: '#f0f0f0', color: '#111', border: 'none', cursor: 'pointer', opacity: submitting ? 0.6 : 1 }}
          >
            {submitting ? '...' : '提交原片'}
          </button>
        </form>
      </div>
    </div>
  )
}
