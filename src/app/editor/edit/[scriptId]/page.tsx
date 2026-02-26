'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function EditorEditPage() {
  const router = useRouter()
  const { scriptId } = useParams<{ scriptId: string }>()
  const supabase = createClient()

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

      const { data: task } = await supabase
        .from('tasks')
        .select('id')
        .eq('script_id', scriptId)
        .eq('type', 'EDIT_VIDEO')
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

    if (!userId) return

    const { error: delErr } = await supabase.from('deliverables').insert({
      script_id: scriptId,
      type: 'final',
      baidu_share_url: baiduUrl.trim(),
      baidu_extract_code: baiduCode.trim() || null,
      file_label: fileLabel.trim() || null,
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

        <h1 style={{ fontSize: 27, fontWeight: 700, marginBottom: 48 }}>提交成片</h1>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <input
            type="text"
            placeholder="文件名（如 EP001-成片）"
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
            {submitting ? '...' : '提交成片'}
          </button>
        </form>
      </div>
    </div>
  )
}
