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

  const canEdit = scriptStatus === 'DRAFT' && !submitting

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace('/login'); return }

      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()

      if (!profile || profile.role !== 'guest') { router.replace('/'); return }

      const { data: sc } = await supabase
        .from('scripts')
        .select('id, reference_id, guest_id, status, script_text')
        .eq('id', scriptId)
        .single()

      if (!sc || sc.guest_id !== user.id) { router.replace('/guest/inbox'); return }

      setScript(sc)
      setScriptStatus(sc.status)
      setScriptText(sc.script_text ?? '')

      const { data: ref } = await supabase
        .from('references')
        .select('id, run_ref_id, url')
        .eq('id', sc.reference_id)
        .single()

      setReference(ref ?? null)
      setLoading(false)
    }
    load()
  }, [scriptId])

  async function saveDraft() {
    if (!script) return
    setSaving(true)
    setMsg(null)
    const { error } = await supabase
      .from('scripts')
      .update({ script_text: scriptText })
      .eq('id', script.id)
    setSaving(false)
    if (error) {
      setMsg({ ok: false, text: error.message })
    } else {
      setMsg({ ok: true, text: '草稿已保存。' })
    }
  }

  async function submitForReview() {
    if (!script) return
    setSubmitting(true)
    setMsg(null)

    const { error: scriptErr } = await supabase
      .from('scripts')
      .update({ status: 'IN_REVIEW', script_text: scriptText })
      .eq('id', script.id)

    if (scriptErr) {
      setMsg({ ok: false, text: scriptErr.message })
      setSubmitting(false)
      return
    }

    const { error: taskErr } = await supabase.from('tasks').insert({
      type: 'REVIEW_SCRIPT',
      status: 'OPEN',
      reference_id: script.reference_id,
      script_id: script.id,
      assignee_role: 'admin',
    })

    if (taskErr) {
      setMsg({ ok: false, text: taskErr.message })
      setSubmitting(false)
      return
    }

    router.push('/guest/inbox')
  }

  if (loading) return <div style={{ padding: 'clamp(16px, 5vw, 48px)', background: '#111', minHeight: '100vh', color: '#f0f0f0' }}>Loading...</div>
  if (!script || !reference) return <div style={{ padding: 'clamp(16px, 5vw, 48px)', background: '#111', minHeight: '100vh', color: '#f0f0f0' }}>Script not found.</div>

  return (
    <div style={{ minHeight: '100vh', background: '#111', color: '#f0f0f0' }}>
      <div style={{ maxWidth: 800, margin: '0 auto', padding: 'clamp(16px, 5vw, 48px)', fontFamily: 'monospace', boxSizing: 'border-box' }}>
        <button
          onClick={() => router.push('/guest/inbox')}
          style={{ fontSize: 18, marginBottom: 36, cursor: 'pointer', background: 'none', border: 'none', textDecoration: 'underline', color: '#888' }}
        >
          ← 返回
        </button>

        <h1 style={{ fontSize: 'clamp(22px, 6vw, 30px)', fontWeight: 700, marginBottom: 6 }}>{reference.run_ref_id}</h1>
        <p style={{ fontSize: 18, color: '#555', marginBottom: 6 }}>
          参考资料：<a href={reference.url} target="_blank" rel="noopener noreferrer" style={{ color: '#60a5fa' }}>{reference.url}</a>
        </p>
        <p style={{ fontSize: 16, color: '#444', marginBottom: 48 }}>状态：{scriptStatus}</p>

        {canEdit ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ position: 'relative' }}>
              <textarea
                value={scriptText}
                onChange={e => setScriptText(e.target.value)}
                placeholder="在这里写你的脚本..."
                rows={16}
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  fontSize: 'clamp(16px, 3vw, 20px)',
                  padding: 15,
                  paddingBottom: 32,
                  border: '1px solid #2a2a2a',
                  resize: 'vertical',
                  background: '#1a1a1a',
                  color: '#f0f0f0',
                  outline: 'none',
                }}
              />
              <span style={{ position: 'absolute', bottom: 8, right: 12, fontSize: 13, color: '#444', pointerEvents: 'none' }}>
                {scriptText.trim().length} 字
              </span>
            </div>
            {msg && (
              <p style={{ fontSize: 16, color: msg.ok ? '#6ee7b7' : '#f87171', margin: 0 }}>{msg.text}</p>
            )}
            <button
              onClick={saveDraft}
              disabled={saving}
              style={{ padding: '10px 24px', fontSize: 18, background: '#1a1a1a', color: '#f0f0f0', border: '1px solid #2a2a2a', cursor: saving ? 'wait' : 'pointer', opacity: saving ? 0.6 : 1, textAlign: 'left' }}
            >
              {saving ? '保存中…' : '保存草稿'}
            </button>
            <button
              onClick={submitForReview}
              disabled={!scriptText.trim()}
              style={{ padding: '12px 24px', fontSize: 20, fontWeight: 600, background: '#f0f0f0', color: '#111', border: 'none', cursor: !scriptText.trim() ? 'not-allowed' : 'pointer', opacity: !scriptText.trim() ? 0.5 : 1, textAlign: 'left' }}
            >
              提交给管理员审核
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <pre style={{ fontSize: 20, whiteSpace: 'pre-wrap', background: '#1a1a1a', padding: 18, color: '#f0f0f0', border: '1px solid #2a2a2a' }}>
              {scriptText || '（暂无内容）'}
            </pre>
            <p style={{ fontSize: 20, color: '#6ee7b7' }}>
              {scriptStatus === 'IN_REVIEW' && '已提交，等待管理员审核'}
              {scriptStatus === 'APPROVED' && '脚本已通过，请返回录制'}
            </p>
            <button
              onClick={() => router.push('/guest/inbox')}
              style={{ fontSize: 18, padding: '8px 20px', cursor: 'pointer', background: 'none', border: '1px solid #2a2a2a', color: '#888', alignSelf: 'flex-start' }}
            >
              返回
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
