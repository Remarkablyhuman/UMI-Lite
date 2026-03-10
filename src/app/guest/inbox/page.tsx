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

const TASK_TYPE_LABEL: Record<string, string> = {
  REVIEW_REFERENCE: '资料审核',
  REVIEW_SCRIPT: '脚本审核',
  RECORD_VIDEO: '录制视频',
  EDIT_VIDEO: '视频剪辑',
  REVIEW_FINAL_CUT: '终审',
}

export default function GuestInbox() {
  const router = useRouter()
  const supabase = createClient()

  const [tasks, setTasks] = useState<Task[]>([])
  const [pendingScripts, setPendingScripts] = useState<PendingScript[]>([])
  const [runRefMap, setRunRefMap] = useState<Record<string, string>>({})
  const [finalDoneRefs, setFinalDoneRefs] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState<string | null>(null)

  const [newRef, setNewRef] = useState('')
  const [creating, setCreating] = useState(false)
  const [createMsg, setCreateMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [formOpen, setFormOpen] = useState(false)

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

      // Find which DONE RECORD_VIDEO runs have had their final cut approved.
      // We check scripts.status = 'DONE' (set by admin on approveFinalCut),
      // since guests cannot read REVIEW_FINAL_CUT tasks (RLS: assignee_id only).
      const doneRecordRefIds = taskList
        .filter(t => t.type === 'RECORD_VIDEO' && t.status === 'DONE')
        .map(t => t.reference_id).filter(Boolean) as string[]
      if (doneRecordRefIds.length > 0) {
        const { data: doneScripts } = await supabase
          .from('scripts')
          .select('reference_id')
          .eq('guest_id', user.id)
          .eq('status', 'DONE')
          .in('reference_id', doneRecordRefIds)
        const finalSet = new Set<string>()
        for (const s of doneScripts ?? []) {
          if (s.reference_id) finalSet.add(s.reference_id)
        }
        setFinalDoneRefs(finalSet)
      }

      setLoading(false)
    }
    load()
  }, [])

  async function handleCreateReference(e: React.FormEvent) {
    e.preventDefault()
    setCreating(true)
    setCreateMsg(null)

    const { data: inserted, error: refErr } = await supabase
      .from('references')
      .insert({ run_ref_id: newRef.trim(), url: '', status: 'APPROVED', created_by: userId! })
      .select('id')
      .single()

    if (refErr) {
      setCreateMsg({ ok: false, text: refErr.code === '23505' ? '该编号已存在，请换一个' : refErr.message })
      setCreating(false)
      return
    }

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

  const recordOpenTasks = tasks.filter(t => t.type === 'RECORD_VIDEO' && t.status === 'OPEN')
  const waitingEditTasks = tasks.filter(t => t.type === 'RECORD_VIDEO' && t.status === 'DONE' && !finalDoneRefs.has(t.reference_id!))
  const finalDoneTasks = tasks.filter(t => t.type === 'RECORD_VIDEO' && t.status === 'DONE' && finalDoneRefs.has(t.reference_id!))
  const hasAnyContent = recordOpenTasks.length > 0 || pendingScripts.length > 0 || waitingEditTasks.length > 0 || finalDoneTasks.length > 0

  if (loading) {
    return (
      <>
        <style>{globalStyles}</style>
        <div className="shell">
          <div className="loading-state">
            <span className="loading-dot" />
            <span className="loading-dot" style={{ animationDelay: '0.15s' }} />
            <span className="loading-dot" style={{ animationDelay: '0.3s' }} />
          </div>
        </div>
      </>
    )
  }

  return (
    <>
      <style>{globalStyles}</style>
      <div className="shell">

        {/* ── Header ── */}
        <header className="header">
          <div className="header-left">
            <div className="brand-mark">U</div>
            <div>
              <h1 className="brand-title">UMI</h1>
              <p className="brand-sub">内容创作台</p>
            </div>
          </div>
          <nav className="header-nav">
            <button className="nav-btn" onClick={() => router.push('/guest/persona')}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
              </svg>
              <span>画像</span>
            </button>
            <button className="nav-btn nav-btn--ghost" onClick={handleSignOut}>退出</button>
          </nav>
        </header>

        <main className="main">

          {/* ── New Task CTA ── */}
          <section className="new-task-section">
            <button
              className={`new-task-toggle ${formOpen ? 'new-task-toggle--open' : ''}`}
              onClick={() => { setFormOpen(v => !v); setCreateMsg(null) }}
            >
              <span className="new-task-icon">{formOpen ? '×' : '+'}</span>
              <span>{formOpen ? '取消' : '发起新任务'}</span>
            </button>

            {formOpen && (
              <form className="new-task-form" onSubmit={handleCreateReference}>
                <div className="form-field">
                  <label className="form-label">工作流编号</label>
                  <input
                    className="form-input"
                    value={newRef}
                    onChange={e => setNewRef(e.target.value)}
                    placeholder="如：2026-03-产品介绍"
                    required
                  />
                </div>
                {createMsg && (
                  <p className={`form-msg ${createMsg.ok ? 'form-msg--ok' : 'form-msg--err'}`}>
                    {createMsg.text}
                  </p>
                )}
                <button
                  type="submit"
                  className="submit-btn"
                  disabled={creating || !newRef.trim()}
                >
                  {creating ? '提交中…' : '提交并编写脚本 →'}
                </button>
              </form>
            )}
          </section>

          {/* ── Section 1: 待录制视频 ── */}
          {recordOpenTasks.length > 0 && (
            <section className="task-section">
              <div className="section-header">
                <span className="section-label">待录制视频</span>
                <span className="section-badge section-badge--active">{recordOpenTasks.length}</span>
              </div>
              <div className="task-list">
                {recordOpenTasks.map(t => (
                  <div key={t.id} className="task-card task-card--active">
                    <div className="task-card-body">
                      <span className="task-run-ref">
                        {t.reference_id ? (runRefMap[t.reference_id] ?? t.reference_id) : '—'}
                      </span>
                      <span className="task-type-badge task-type-badge--record">录制视频</span>
                    </div>
                    {t.script_id && (
                      <button
                        className="action-btn action-btn--primary"
                        onClick={() => router.push(`/guest/record/${t.script_id}`)}
                      >
                        去录制
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* ── Section 2: 待写脚本 ── */}
          {pendingScripts.length > 0 && (
            <section className="task-section">
              <div className="section-header">
                <span className="section-label">待写脚本</span>
                <span className="section-badge section-badge--active">{pendingScripts.length}</span>
              </div>
              <div className="task-list">
                {pendingScripts.map(s => (
                  <div key={`draft-${s.id}`} className="task-card task-card--active">
                    <div className="task-card-body">
                      <span className="task-run-ref">
                        {runRefMap[s.reference_id] ?? s.reference_id}
                      </span>
                      <span className={`task-type-badge ${s.status === 'DRAFT' ? 'task-type-badge--draft' : 'task-type-badge--review'}`}>
                        {s.status === 'DRAFT' ? '脚本草稿' : '等待审核'}
                      </span>
                    </div>
                    {s.status === 'DRAFT' && (
                      <button
                        className="action-btn action-btn--primary"
                        onClick={() => router.push(`/guest/script/${s.id}`)}
                      >
                        去写脚本
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* ── Section 3: 已完成·等待剪辑 ── */}
          {waitingEditTasks.length > 0 && (
            <section className="task-section">
              <div className="section-header">
                <span className="section-label">已完成·等待剪辑</span>
                <span className="section-badge">{waitingEditTasks.length}</span>
              </div>
              <div className="task-list">
                {waitingEditTasks.map(t => (
                  <div key={t.id} className="task-card task-card--waiting">
                    <div className="task-card-body">
                      <span className="task-run-ref task-run-ref--dim">
                        {t.reference_id ? (runRefMap[t.reference_id] ?? t.reference_id) : '—'}
                      </span>
                      <span className="task-type-badge task-type-badge--waiting">等待剪辑</span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* ── Section 4: 成片已完成 ── */}
          {finalDoneTasks.length > 0 && (
            <section className="task-section">
              <div className="section-header">
                <span className="section-label">成片已完成</span>
                <span className="section-badge">{finalDoneTasks.length}</span>
              </div>
              <div className="task-list">
                {finalDoneTasks.map(t => (
                  <div key={t.id} className="task-card task-card--final">
                    <div className="task-card-body">
                      <span className="task-run-ref task-run-ref--dim">
                        {t.reference_id ? (runRefMap[t.reference_id] ?? t.reference_id) : '—'}
                      </span>
                      <span className="task-type-badge task-type-badge--final">成片完成</span>
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

          {!hasAnyContent && !formOpen && (
            <div className="empty-state">
              <div className="empty-icon">◎</div>
              <p className="empty-text">暂无任务</p>
              <p className="empty-sub">点击上方"发起新任务"开始工作流</p>
            </div>
          )}

        </main>
      </div>
    </>
  )
}

const globalStyles = `
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
    --mono: 'IBM Plex Mono', monospace;
    --serif: 'Noto Serif SC', serif;
  }

  body { background: var(--bg); color: var(--text); }

  .shell {
    min-height: 100vh;
    background: var(--bg);
    font-family: var(--mono);
  }

  /* ── Loading ── */
  .loading-state {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
    gap: 6px;
  }
  .loading-dot {
    width: 6px; height: 6px;
    border-radius: 50%;
    background: var(--amber);
    animation: pulse 1s ease-in-out infinite;
  }
  @keyframes pulse {
    0%, 100% { opacity: 0.2; transform: scale(0.8); }
    50% { opacity: 1; transform: scale(1); }
  }

  /* ── Header ── */
  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 20px;
    border-bottom: 1px solid var(--border);
    position: sticky;
    top: 0;
    background: rgba(12, 12, 12, 0.95);
    backdrop-filter: blur(8px);
    z-index: 10;
  }
  .header-left {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .brand-mark {
    width: 36px; height: 36px;
    background: var(--amber);
    color: #000;
    font-family: var(--serif);
    font-size: 18px;
    font-weight: 700;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }
  .brand-title {
    font-family: var(--serif);
    font-size: 18px;
    font-weight: 700;
    letter-spacing: 0.05em;
    line-height: 1;
    color: var(--text);
  }
  .brand-sub {
    font-size: 10px;
    color: var(--text-muted);
    letter-spacing: 0.1em;
    margin-top: 3px;
  }
  .header-nav {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .nav-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 7px 12px;
    font-family: var(--mono);
    font-size: 12px;
    color: var(--text-muted);
    background: var(--surface);
    border: 1px solid var(--border);
    cursor: pointer;
    transition: color 0.15s, border-color 0.15s;
    white-space: nowrap;
  }
  .nav-btn:hover { color: var(--text); border-color: var(--border2); }
  .nav-btn--ghost { background: none; border-color: transparent; }
  .nav-btn--ghost:hover { border-color: var(--border); }

  /* ── Main ── */
  .main {
    max-width: 680px;
    margin: 0 auto;
    padding: 24px 16px 80px;
  }

  /* ── New Task ── */
  .new-task-section {
    margin-bottom: 32px;
  }
  .new-task-toggle {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    padding: 14px 18px;
    font-family: var(--mono);
    font-size: 14px;
    font-weight: 500;
    color: var(--amber);
    background: var(--amber-glow);
    border: 1px solid var(--amber);
    cursor: pointer;
    transition: background 0.15s;
    text-align: left;
  }
  .new-task-toggle:hover { background: rgba(232, 160, 32, 0.14); }
  .new-task-toggle--open { border-color: var(--amber-dim); }
  .new-task-icon {
    width: 20px; height: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 18px;
    line-height: 1;
    flex-shrink: 0;
  }
  .new-task-form {
    padding: 20px;
    border: 1px solid var(--border);
    border-top: none;
    background: var(--surface);
    display: flex;
    flex-direction: column;
    gap: 16px;
    animation: slideDown 0.15s ease;
  }
  @keyframes slideDown {
    from { opacity: 0; transform: translateY(-4px); }
    to { opacity: 1; transform: translateY(0); }
  }
  .form-field {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .form-label {
    font-size: 10px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--text-muted);
  }
  .form-input {
    width: 100%;
    padding: 10px 12px;
    font-family: var(--mono);
    font-size: 14px;
    color: var(--text);
    background: var(--surface2);
    border: 1px solid var(--border);
    outline: none;
    transition: border-color 0.15s;
    -webkit-appearance: none;
  }
  .form-input::placeholder { color: var(--text-dim); }
  .form-input:focus { border-color: var(--amber); }
  .form-msg {
    font-size: 13px;
    padding: 8px 12px;
    border-left: 2px solid;
  }
  .form-msg--ok { color: var(--green); border-color: var(--green); background: var(--green-dim); }
  .form-msg--err { color: var(--red); border-color: var(--red); background: rgba(192, 80, 74, 0.1); }
  .submit-btn {
    width: 100%;
    padding: 13px;
    font-family: var(--mono);
    font-size: 14px;
    font-weight: 600;
    color: #000;
    background: var(--amber);
    border: none;
    cursor: pointer;
    transition: background 0.15s, opacity 0.15s;
    letter-spacing: 0.02em;
  }
  .submit-btn:hover:not(:disabled) { background: #f0ac30; }
  .submit-btn:disabled { opacity: 0.4; cursor: not-allowed; }

  /* ── Sections ── */
  .task-section { margin-bottom: 32px; }
  .section-header {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 12px;
    padding-bottom: 10px;
    border-bottom: 1px solid var(--border);
  }
  .section-label {
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--text-muted);
  }
  .section-badge {
    font-size: 10px;
    font-weight: 600;
    padding: 2px 7px;
    background: var(--surface2);
    color: var(--text-muted);
    border: 1px solid var(--border);
  }
  .section-badge--active {
    background: var(--amber-glow);
    color: var(--amber);
    border-color: rgba(232, 160, 32, 0.3);
  }

  /* ── Task Cards ── */
  .task-list { display: flex; flex-direction: column; gap: 8px; }
  .task-card {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 14px 16px;
    border: 1px solid var(--border);
    background: var(--surface);
    transition: border-color 0.15s;
  }
  .task-card--active { border-left: 3px solid var(--amber); }
  .task-card--waiting { border-left: 3px solid #7060a0; opacity: 0.85; }
  .task-card--final { border-left: 3px solid var(--green); opacity: 0.85; }
  .task-card-body {
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: 0;
    flex: 1;
  }
  .task-run-ref {
    font-family: var(--mono);
    font-size: 14px;
    font-weight: 600;
    color: var(--text);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .task-run-ref--done { color: var(--text-muted); }
  .task-run-ref--dim { color: var(--text-muted); }
  .task-type-badge {
    font-size: 11px;
    padding: 3px 8px;
    display: inline-block;
    letter-spacing: 0.04em;
    width: fit-content;
  }
  .task-type-badge--record { background: rgba(232, 160, 32, 0.12); color: var(--amber); }
  .task-type-badge--draft { background: rgba(90, 120, 180, 0.12); color: #7090d0; }
  .task-type-badge--review { background: rgba(160, 120, 60, 0.12); color: #b08040; }
  .task-type-badge--waiting { background: rgba(112, 96, 160, 0.12); color: #9080c0; }
  .task-type-badge--final { background: rgba(90, 138, 106, 0.12); color: var(--green); }
  .task-type-badge--done { background: var(--surface2); color: var(--text-muted); }

  /* ── Action Buttons ── */
  .action-btn {
    padding: 8px 16px;
    font-family: var(--mono);
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    white-space: nowrap;
    flex-shrink: 0;
    transition: background 0.15s, color 0.15s;
    border: 1px solid;
  }
  .action-btn--primary {
    background: var(--amber);
    color: #000;
    border-color: var(--amber);
  }
  .action-btn--primary:hover { background: #f0ac30; border-color: #f0ac30; }
  .action-btn--ghost {
    background: none;
    color: var(--text-muted);
    border-color: var(--border);
  }
  .action-btn--ghost:hover { color: var(--text); border-color: var(--border2); }

  /* ── Empty State ── */
  .empty-state {
    text-align: center;
    padding: 60px 20px;
  }
  .empty-icon {
    font-size: 36px;
    color: var(--border2);
    margin-bottom: 16px;
    font-family: var(--serif);
  }
  .empty-text {
    font-family: var(--serif);
    font-size: 18px;
    color: var(--text-muted);
    margin-bottom: 8px;
  }
  .empty-sub {
    font-size: 12px;
    color: var(--text-dim);
    letter-spacing: 0.04em;
  }

  /* ── Mobile ── */
  @media (max-width: 480px) {
    .header { padding: 12px 16px; }
    .brand-title { font-size: 16px; }
    .brand-mark { width: 32px; height: 32px; font-size: 16px; }
    .main { padding: 20px 12px 80px; }
    .task-card { flex-direction: column; align-items: flex-start; gap: 10px; }
    .action-btn { width: 100%; text-align: center; padding: 10px 16px; font-size: 13px; }
    .new-task-toggle { font-size: 13px; }
    .submit-btn { font-size: 13px; }
    .task-run-ref { font-size: 13px; white-space: normal; overflow: visible; }
    .nav-btn span { display: none; }
    .nav-btn { padding: 7px 10px; }
  }
`
