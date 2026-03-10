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

  const openTasks = tasks.filter(t => t.status === 'OPEN')
  const doneTasks = tasks.filter(t => t.status === 'DONE')
  const hasAnyContent = openTasks.length > 0 || doneTasks.length > 0

  if (loading) {
    return (
      <>
        <style>{css}</style>
        <div className="shell">
          <div className="loading-state">
            <span className="dot" />
            <span className="dot" style={{ animationDelay: '.15s' }} />
            <span className="dot" style={{ animationDelay: '.3s' }} />
          </div>
        </div>
      </>
    )
  }

  return (
    <>
      <style>{css}</style>
      <div className="shell">

        <header className="header">
          <div className="header-left">
            <div className="brand-mark">U</div>
            <div>
              <h1 className="brand-title">UMI</h1>
              <p className="brand-sub">剪辑工作台</p>
            </div>
          </div>
          <nav className="header-nav">
            <button className="nav-btn nav-btn--ghost" onClick={handleSignOut}>退出</button>
          </nav>
        </header>

        <main className="main">

          {/* 待剪辑 */}
          {openTasks.length > 0 && (
            <section className="task-section">
              <div className="section-header">
                <span className="section-label">待剪辑</span>
                <span className="section-badge section-badge--active">{openTasks.length}</span>
              </div>
              <div className="task-list">
                {openTasks.map(t => (
                  <div key={t.id} className="task-card task-card--active">
                    <div className="task-card-body">
                      <span className="task-run-ref">
                        {t.reference_id ? (runRefMap[t.reference_id] ?? t.reference_id) : '—'}
                      </span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span className="task-type-badge task-type-badge--edit">视频剪辑</span>
                        {t.comment && <span className="task-type-badge task-type-badge--rework">返工</span>}
                      </div>
                    </div>
                    {t.type === 'EDIT_VIDEO' && t.script_id && (
                      <button
                        className="action-btn action-btn--primary"
                        onClick={() => router.push(`/editor/edit/${t.script_id}`)}
                      >
                        去剪辑
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* 已完成 */}
          {doneTasks.length > 0 && (
            <section className="task-section">
              <div className="section-header">
                <span className="section-label">已完成</span>
                <span className="section-badge">{doneTasks.length}</span>
              </div>
              <div className="task-list">
                {doneTasks.map(t => (
                  <div key={t.id} className="task-card task-card--final">
                    <div className="task-card-body">
                      <span className="task-run-ref task-run-ref--dim">
                        {t.reference_id ? (runRefMap[t.reference_id] ?? t.reference_id) : '—'}
                      </span>
                      <span className="task-type-badge task-type-badge--done">已完成</span>
                    </div>
                    {t.reference_id && runRefMap[t.reference_id] && (
                      <button
                        className="action-btn action-btn--ghost"
                        onClick={() => router.push(`/admin/run/${runRefMap[t.reference_id!]}`)}
                      >
                        查看
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {!hasAnyContent && (
            <div className="empty-state">
              <div className="empty-icon">◎</div>
              <p className="empty-text">暂无任务</p>
              <p className="empty-sub">等待管理员分配剪辑任务</p>
            </div>
          )}

        </main>
      </div>
    </>
  )
}

const css = `
  @import url('https://fonts.googleapis.com/css2?family=Noto+Serif+SC:wght@400;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap');

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --bg: #0c0c0c;
    --surface: #141414;
    --surface2: #1c1c1c;
    --border: #242424;
    --border2: #2e2e2e;
    --text: #e8e4dc;
    --text-muted: #5a5650;
    --text-dim: #3a3834;
    --amber: #e8a020;
    --amber-dim: #c4861a;
    --amber-glow: rgba(232, 160, 32, 0.08);
    --green: #5a8a6a;
    --green-dim: rgba(90, 138, 106, 0.15);
    --red: #c0504a;
    --blue: #4a80c0;
    --mono: 'IBM Plex Mono', monospace;
    --serif: 'Noto Serif SC', serif;
  }

  body { background: var(--bg); color: var(--text); }

  .shell { min-height: 100vh; background: var(--bg); font-family: var(--mono); }

  .loading-state { display: flex; align-items: center; justify-content: center; min-height: 100vh; gap: 6px; }
  .dot { width: 6px; height: 6px; border-radius: 50%; background: var(--amber); animation: pulse 1s ease-in-out infinite; }
  @keyframes pulse { 0%, 100% { opacity: .2; transform: scale(.8); } 50% { opacity: 1; transform: scale(1); } }

  .header { display: flex; align-items: center; justify-content: space-between; padding: 16px 20px; border-bottom: 1px solid var(--border); position: sticky; top: 0; background: rgba(12,12,12,.95); backdrop-filter: blur(8px); z-index: 10; }
  .header-left { display: flex; align-items: center; gap: 12px; }
  .brand-mark { width: 36px; height: 36px; background: var(--amber); color: #000; font-family: var(--serif); font-size: 18px; font-weight: 700; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
  .brand-title { font-family: var(--serif); font-size: 18px; font-weight: 700; letter-spacing: .05em; line-height: 1; color: var(--text); }
  .brand-sub { font-size: 10px; color: var(--text-muted); letter-spacing: .1em; margin-top: 3px; }
  .header-nav { display: flex; align-items: center; gap: 8px; }
  .nav-btn { display: flex; align-items: center; gap: 6px; padding: 7px 12px; font-family: var(--mono); font-size: 12px; color: var(--text-muted); background: var(--surface); border: 1px solid var(--border); cursor: pointer; transition: color .15s, border-color .15s; white-space: nowrap; }
  .nav-btn:hover { color: var(--text); border-color: var(--border2); }
  .nav-btn--ghost { background: none; border-color: transparent; }
  .nav-btn--ghost:hover { border-color: var(--border); }

  .main { max-width: 680px; margin: 0 auto; padding: 24px 16px 80px; }

  .task-section { margin-bottom: 32px; }
  .section-header { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; padding-bottom: 10px; border-bottom: 1px solid var(--border); }
  .section-label { font-size: 10px; font-weight: 600; letter-spacing: .18em; text-transform: uppercase; color: var(--text-muted); }
  .section-badge { font-size: 10px; font-weight: 600; padding: 2px 7px; background: var(--surface2); color: var(--text-muted); border: 1px solid var(--border); }
  .section-badge--active { background: var(--amber-glow); color: var(--amber); border-color: rgba(232,160,32,.3); }

  .task-list { display: flex; flex-direction: column; gap: 8px; }
  .task-card { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 14px 16px; border: 1px solid var(--border); background: var(--surface); transition: border-color .15s; }
  .task-card--active { border-left: 3px solid var(--amber); }
  .task-card--final { border-left: 3px solid var(--green); opacity: .85; }
  .task-card-body { display: flex; flex-direction: column; gap: 6px; min-width: 0; flex: 1; }
  .task-run-ref { font-family: var(--mono); font-size: 14px; font-weight: 600; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .task-run-ref--dim { color: var(--text-muted); }

  .task-type-badge { font-size: 11px; padding: 3px 8px; display: inline-block; letter-spacing: .04em; width: fit-content; }
  .task-type-badge--edit { background: rgba(74,128,192,.12); color: var(--blue); }
  .task-type-badge--rework { background: rgba(192,80,74,.12); color: var(--red); }
  .task-type-badge--done { background: var(--surface2); color: var(--text-muted); }

  .action-btn { padding: 8px 16px; font-family: var(--mono); font-size: 12px; font-weight: 500; cursor: pointer; white-space: nowrap; flex-shrink: 0; transition: background .15s, color .15s; border: 1px solid; }
  .action-btn--primary { background: var(--amber); color: #000; border-color: var(--amber); }
  .action-btn--primary:hover { background: #f0ac30; border-color: #f0ac30; }
  .action-btn--ghost { background: none; color: var(--text-muted); border-color: var(--border); }
  .action-btn--ghost:hover { color: var(--text); border-color: var(--border2); }

  .empty-state { text-align: center; padding: 60px 20px; }
  .empty-icon { font-size: 36px; color: var(--border2); margin-bottom: 16px; font-family: var(--serif); }
  .empty-text { font-family: var(--serif); font-size: 18px; color: var(--text-muted); margin-bottom: 8px; }
  .empty-sub { font-size: 12px; color: var(--text-dim); letter-spacing: .04em; }

  @media (max-width: 480px) {
    .header { padding: 12px 16px; }
    .brand-title { font-size: 16px; }
    .brand-mark { width: 32px; height: 32px; font-size: 16px; }
    .main { padding: 20px 12px 80px; }
    .task-card { flex-direction: column; align-items: flex-start; gap: 10px; }
    .action-btn { width: 100%; text-align: center; padding: 10px 16px; font-size: 13px; }
    .task-run-ref { font-size: 13px; white-space: normal; overflow: visible; }
    .nav-btn { padding: 7px 10px; }
  }
`
