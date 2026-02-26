'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

type Task = {
  id: string
  type: string
  status: string
  script_id: string | null
  ref: { run_ref_id: string } | null
}

export default function GuestInbox() {
  const router = useRouter()
  const supabase = createClient()

  const [tasks, setTasks] = useState<Task[]>([])
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
      if (profile.role !== 'guest') { router.replace('/'); return }

      const { data } = await supabase
        .from('tasks')
        .select('id, type, status, script_id, ref:references(run_ref_id)')
        .eq('assignee_id', user.id)
        .eq('status', 'OPEN')
        .order('created_at', { ascending: false })

      setTasks((data ?? []) as Task[])
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
      <div style={{ maxWidth: 1080, margin: '0 auto', padding: 48, fontFamily: 'monospace' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 48 }}>
          <h1 style={{ fontSize: 30, fontWeight: 700 }}>UMI — 我的任务</h1>
          <button onClick={handleSignOut} style={{ fontSize: 20, cursor: 'pointer', background: 'none', border: '1px solid #2a2a2a', padding: '6px 15px', color: '#888' }}>
            退出登录
          </button>
        </div>

        {tasks.length === 0
          ? <p style={{ fontSize: 20, color: '#555' }}>暂无分配给你的任务。</p>
          : tasks.map(t => (
            <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '18px 0', borderBottom: '1px solid #1e1e1e' }}>
              <div>
                <span style={{ fontSize: 20, fontWeight: 600 }}>{t.ref?.run_ref_id ?? '—'}</span>
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
          ))
        }
      </div>
    </div>
  )
}
