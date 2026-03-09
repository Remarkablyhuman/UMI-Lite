'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

type Task = {
  id: string
  type: string
  status: string
  script_id: string | null
  reference_id: string | null
}

type PendingScript = {
  id: string
  reference_id: string
  status: string
}

export default function GuestInbox() {
  const router = useRouter()
  const supabase = createClient()

  const [tasks, setTasks] = useState<Task[]>([])
  const [pendingScripts, setPendingScripts] = useState<PendingScript[]>([])
  const [runRefMap, setRunRefMap] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState<string | null>(null)

  const [newRef, setNewRef] = useState('')
  const [newUrl, setNewUrl] = useState('')
  const [creating, setCreating] = useState(false)
  const [createMsg, setCreateMsg] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace('/login'); return }

      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()

      if (!profile) { router.replace('/login'); return }
      if (profile.role !== 'guest') { router.replace('/'); return }
      setUserId(user.id)

      const { data } = await supabase
        .from('tasks')
        .select('id, type, status, script_id, reference_id')
        .eq('assignee_id', user.id)
        .in('status', ['OPEN', 'DONE'])
        .order('created_at', { ascending: false })

      const taskList = (data ?? []) as Task[]
      setTasks(taskList)

      // Fetch DRAFT and IN_REVIEW scripts owned by guest
      const { data: drafts } = await supabase
        .from('scripts')
        .select('id, reference_id, status')
        .eq('guest_id', user.id)
        .in('status', ['DRAFT', 'IN_REVIEW'])

      const draftList = (drafts ?? []) as PendingScript[]
      setPendingScripts(draftList)
      const draftRefIds = draftList.map(s => s.reference_id).filter(Boolean) as string[]

      const refIds = [...new Set([
        ...taskList.map(t => t.reference_id).filter(Boolean),
        ...draftRefIds
      ])] as string[]
      if (refIds.length > 0) {
        const { data: refs } = await supabase
          .from('references')
          .select('id, run_ref_id')
          .in('id', refIds)
        const map: Record<string, string> = {}
        for (const r of refs ?? []) map[r.id] = r.run_ref_id
        setRunRefMap(map)
      }

      setLoading(false)
    }
    load()
  }, [])

  async function handleCreateReference(e: React.FormEvent) {
    e.preventDefault()
    setCreating(true)
    setCreateMsg(null)

    // 1. Insert reference (auto-approved)
    const { data: inserted, error: refErr } = await supabase
      .from('references')
      .insert({ run_ref_id: newRef.trim(), url: newUrl.trim(), status: 'APPROVED', created_by: userId! })
      .select('id')
      .single()

    if (refErr) {
      setCreateMsg({ ok: false, text: refErr.code === '23505' ? '该编号已存在，请换一个' : refErr.message })
      setCreating(false)
      return
    }

    // 2. Insert REVIEW_REFERENCE task as DONE (reference is auto-approved for guests)
    await supabase.from('tasks').insert({
      type: 'REVIEW_REFERENCE',
      status: 'DONE',
      reference_id: inserted.id,
      assignee_role: 'admin',
    })

    // 3. Insert blank draft script
    const { data: newScript, error: scriptErr } = await supabase
      .from('scripts')
      .insert({ reference_id: inserted.id, guest_id: userId!, status: 'DRAFT', script_text: '' })
      .select('id')
      .single()

    if (scriptErr) {
      setCreateMsg({ ok: false, text: scriptErr.message })
      setCreating(false)
      return
    }

    router.push(`/guest/script/${newScript.id}`)
  }

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.replace('/login')
  }

  if (loading) return <div style={{ padding: 'clamp(16px, 5vw, 48px)', background: '#111', minHeight: '100vh', color: '#f0f0f0' }}>Loading...</div>

  return (
    <div style={{ minHeight: '100vh', background: '#111', color: '#f0f0f0' }}>
      <div style={{ maxWidth: 1080, margin: '0 auto', padding: 'clamp(16px, 5vw, 48px)', fontFamily: 'monospace', boxSizing: 'border-box' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', rowGap: 12, marginBottom: 'clamp(24px, 5vw, 48px)' }}>
          <h1 style={{ fontSize: 'clamp(22px, 6vw, 30px)', fontWeight: 700 }}>UMI — 我的任务</h1>
          <div style={{ display: 'flex', gap: 12, flexShrink: 0 }}>
            <button onClick={() => router.push('/guest/persona')} style={{ fontSize: 20, cursor: 'pointer', background: 'none', border: '1px solid #2a2a2a', padding: '6px 15px', color: '#888' }}>
              我的画像
            </button>
            <button onClick={handleSignOut} style={{ fontSize: 20, cursor: 'pointer', background: 'none', border: '1px solid #2a2a2a', padding: '6px 15px', color: '#888' }}>
              退出登录
            </button>
          </div>
        </div>

        {/* ── Create Reference ── */}
        <section style={{ marginBottom: 48 }}>
          <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 18, color: '#aaa' }}>
            发起新任务
          </h2>
          <form onSubmit={handleCreateReference} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <input
              value={newRef}
              onChange={e => setNewRef(e.target.value)}
              placeholder="工作流编号（如：2026-03-05-产品介绍）"
              required
              style={{ padding: '10px 14px', fontSize: 17, background: '#1a1a1a', color: '#f0f0f0', border: '1px solid #2a2a2a', outline: 'none', width: '100%', boxSizing: 'border-box' }}
            />
            <input
              value={newUrl}
              onChange={e => setNewUrl(e.target.value)}
              placeholder="参考资料链接（URL）"
              type="url"
              required
              style={{ padding: '10px 14px', fontSize: 17, background: '#1a1a1a', color: '#f0f0f0', border: '1px solid #2a2a2a', outline: 'none', width: '100%', boxSizing: 'border-box' }}
            />
            {createMsg && (
              <p style={{ fontSize: 16, color: createMsg.ok ? '#6ee7b7' : '#f87171', margin: 0 }}>
                {createMsg.text}
              </p>
            )}
            <button
              type="submit"
              disabled={creating || !newRef.trim() || !newUrl.trim()}
              style={{ padding: '10px', fontSize: 18, fontWeight: 600, background: '#f0f0f0', color: '#111', border: 'none', cursor: 'pointer', opacity: creating || !newRef.trim() || !newUrl.trim() ? 0.5 : 1 }}
            >
              {creating ? '提交中…' : '提交'}
            </button>
          </form>
        </section>

        {tasks.filter(t => t.status === 'OPEN').length === 0 &&
         tasks.filter(t => t.status === 'DONE').length === 0 &&
         pendingScripts.length === 0 && (
          <p style={{ fontSize: 20, color: '#555' }}>暂无分配给你的任务。</p>
        )}

        {(tasks.filter(t => t.status === 'OPEN').length > 0 || pendingScripts.length > 0) && (
          <>
            <p style={{ fontSize: 15, fontWeight: 700, letterSpacing: 3, textTransform: 'uppercase', color: '#444', marginBottom: 12 }}>待办</p>
            {tasks.filter(t => t.status === 'OPEN').map(t => (
              <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, padding: '18px 0', borderBottom: '1px solid #1e1e1e' }}>
                <div>
                  <span style={{ fontSize: 20, fontWeight: 600 }}>{t.reference_id ? (runRefMap[t.reference_id] ?? t.reference_id) : '—'}</span>
                  <span style={{ fontSize: 18, color: '#555', marginLeft: 18 }}>{t.type}</span>
                </div>
                {t.type === 'RECORD_VIDEO' && t.script_id && (
                  <button
                    onClick={() => router.push(`/guest/record/${t.script_id}`)}
                    style={{ fontSize: 18, padding: '6px 15px', cursor: 'pointer', background: '#f0f0f0', color: '#111', border: 'none' }}
                  >
                    去录制
                  </button>
                )}
              </div>
            ))}
            {pendingScripts.map(s => (
              <div key={`draft-${s.id}`} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, padding: '18px 0', borderBottom: '1px solid #1e1e1e' }}>
                <div>
                  <span style={{ fontSize: 20, fontWeight: 600 }}>{runRefMap[s.reference_id] ?? s.reference_id}</span>
                  <span style={{ fontSize: 18, color: '#555', marginLeft: 18 }}>
                    {s.status === 'DRAFT' ? '去写脚本' : '等待管理员审核脚本'}
                  </span>
                </div>
                {s.status === 'DRAFT' && (
                  <button
                    onClick={() => router.push(`/guest/script/${s.id}`)}
                    style={{ fontSize: 18, padding: '6px 15px', cursor: 'pointer', background: '#f0f0f0', color: '#111', border: 'none' }}
                  >
                    去写脚本
                  </button>
                )}
              </div>
            ))}
          </>
        )}

        {tasks.filter(t => t.status === 'DONE').length > 0 && (
          <>
            <p style={{ fontSize: 15, fontWeight: 700, letterSpacing: 3, textTransform: 'uppercase', color: '#444', marginBottom: 12, marginTop: 48 }}>已完成</p>
            {tasks.filter(t => t.status === 'DONE').map(t => (
              <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, padding: '18px 0', borderBottom: '1px solid #1e1e1e' }}>
                <div>
                  <span style={{ fontSize: 20, fontWeight: 600, color: '#555' }}>{t.reference_id ? (runRefMap[t.reference_id] ?? t.reference_id) : '—'}</span>
                  <span style={{ fontSize: 18, color: '#444', marginLeft: 18 }}>{t.type}</span>
                </div>
                {t.reference_id && runRefMap[t.reference_id] && (
                  <button
                    onClick={() => router.push(`/admin/run/${runRefMap[t.reference_id!]}`)}
                    style={{ fontSize: 16, padding: '4px 14px', cursor: 'pointer', background: 'none', border: '1px solid #2a2a2a', color: '#888' }}
                  >
                    查看
                  </button>
                )}
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  )
}
