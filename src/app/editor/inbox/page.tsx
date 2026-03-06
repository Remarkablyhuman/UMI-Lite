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
  comment: string | null
}

export default function EditorInbox() {
  const router = useRouter()
  const supabase = createClient()

  const [tasks, setTasks] = useState<Task[]>([])
  const [runRefMap, setRunRefMap] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)

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
      if (profile.role !== 'editor') { router.replace('/'); return }

      const { data } = await supabase
        .from('tasks')
        .select('id, type, status, script_id, reference_id, comment')
        .eq('assignee_id', user.id)
        .in('status', ['OPEN', 'DONE'])
        .order('created_at', { ascending: false })

      const taskList = (data ?? []) as Task[]
      setTasks(taskList)

      const refIds = [...new Set(taskList.map(t => t.reference_id).filter(Boolean))] as string[]
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

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.replace('/login')
  }

  if (loading) return <div style={{ padding: 48, background: '#111', minHeight: '100vh', color: '#f0f0f0' }}>Loading...</div>

  return (
    <div style={{ minHeight: '100vh', background: '#111', color: '#f0f0f0' }}>
      <div></div>
      <div style={{ maxWidth: 1080, margin: '0 auto', padding: 48, fontFamily: 'monospace' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 48 }}>
          <h1 style={{ fontSize: 30, fontWeight: 700 }}>UMI — 剪辑任务</h1>
          <button onClick={handleSignOut} style={{ fontSize: 20, cursor: 'pointer', background: 'none', border: '1px solid #2a2a2a', padding: '6px 15px', color: '#888' }}>
            退出登录
          </button>
        </div>

        {tasks.filter(t => t.status === 'OPEN').length === 0 && tasks.filter(t => t.status === 'DONE').length === 0 && (
          <p style={{ fontSize: 20, color: '#555' }}>暂无分配给你的任务。</p>
        )}

        {tasks.filter(t => t.status === 'OPEN').length > 0 && (
          <>
            <p style={{ fontSize: 15, fontWeight: 700, letterSpacing: 3, textTransform: 'uppercase', color: '#444', marginBottom: 12 }}>待办</p>
            {tasks.filter(t => t.status === 'OPEN').map(t => (
              <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '18px 0', borderBottom: '1px solid #1e1e1e' }}>
                <div>
                  <span style={{ fontSize: 20, fontWeight: 600 }}>{t.reference_id ? (runRefMap[t.reference_id] ?? t.reference_id) : '—'}</span>
                  {t.comment && <span style={{ fontSize: 15, color: '#f87171', marginLeft: 8 }}>(返工)</span>}
                  <span style={{ fontSize: 18, color: '#555', marginLeft: 18 }}>{t.type}</span>
                </div>
                {t.type === 'EDIT_VIDEO' && t.script_id && (
                  <button
                    onClick={() => router.push(`/editor/edit/${t.script_id}`)}
                    style={{ fontSize: 18, padding: '6px 15px', cursor: 'pointer', background: '#f0f0f0', color: '#111', border: 'none' }}
                  >
                    去剪辑
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
              <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '18px 0', borderBottom: '1px solid #1e1e1e' }}>
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
