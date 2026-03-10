'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

type Reference = {
  id: string
  run_ref_id: string
  status: string
}

type Profile = {
  id: string
  role: string
}

const STAGES = ['REVIEW_REFERENCE', 'REVIEW_SCRIPT', 'RECORD_VIDEO', 'EDIT_VIDEO'] as const
const STAGE_LABELS: Record<string, string> = {
  REVIEW_REFERENCE: '选题',
  REVIEW_SCRIPT:    '脚本',
  RECORD_VIDEO:     '录制',
  EDIT_VIDEO:       '剪辑',
}

type RefProgress = Record<string, 'DONE' | 'OPEN' | null>

export default function AdminInbox() {
  const router = useRouter()
  const supabase = createClient()

  const [profile, setProfile] = useState<Profile | null>(null)
  const [references, setReferences] = useState<Reference[]>([])
  const [progress, setProgress] = useState<Record<string, RefProgress>>({})
  const [refGuestMap, setRefGuestMap] = useState<Record<string, string>>({})
  const [guestNameMap, setGuestNameMap] = useState<Record<string, string>>({})
  const [runRefId, setRunRefId] = useState('')
  const [url, setUrl] = useState('')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState('')
  const [loading, setLoading] = useState(true)
  const [pendingRunRef, setPendingRunRef] = useState<string | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [collapsedGuests, setCollapsedGuests] = useState<Set<string>>(new Set())
  const [finishedCollapsed, setFinishedCollapsed] = useState(false)

  function toggleGuestGroup(gid: string) {
    setCollapsedGuests(prev => {
      const next = new Set(prev)
      next.has(gid) ? next.delete(gid) : next.add(gid)
      return next
    })
  }

  async function loadData() {
    const { data: refs } = await supabase
      .from('references')
      .select('id, run_ref_id, status')
      .order('created_at', { ascending: false })
    const refList = (refs ?? []) as Reference[]
    setReferences(refList)

    const { data: tasks } = await supabase
      .from('tasks')
      .select('type, status, reference_id, script:scripts!script_id(reference_id)')

    const map: Record<string, RefProgress> = {}
    for (const t of tasks ?? []) {
      const refId = (t.reference_id ?? (t.script as unknown as { reference_id: string } | null)?.reference_id) as string | null
      if (!refId) continue
      if (!map[refId]) map[refId] = {}
      const current = map[refId][t.type]
      if (current !== 'DONE') map[refId][t.type] = t.status === 'DONE' ? 'DONE' : 'OPEN'
    }
    for (const r of refList) {
      if (r.status === 'APPROVED') {
        if (!map[r.id]) map[r.id] = {}
        map[r.id]['REVIEW_REFERENCE'] = 'DONE'
      }
    }
    setProgress(map)

    const { data: scriptRows } = await supabase
      .from('scripts')
      .select('reference_id, guest_id')
    const rgMap: Record<string, string> = {}
    for (const s of scriptRows ?? []) {
      if (s.reference_id && s.guest_id) rgMap[s.reference_id] = s.guest_id
    }
    setRefGuestMap(rgMap)

    const { data: guestProfiles } = await supabase
      .from('profiles')
      .select('id, display_name, email')
      .eq('role', 'guest')
    const gnMap: Record<string, string> = {}
    for (const g of guestProfiles ?? []) {
      gnMap[g.id] = g.display_name ?? g.email ?? g.id
    }
    setGuestNameMap(gnMap)
  }

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace('/login'); return }

      const { data: prof } = await supabase
        .from('profiles')
        .select('id, role')
        .eq('id', user.id)
        .single()

      if (!prof) { router.replace('/login'); return }
      if (prof.role !== 'admin') { router.replace('/'); return }
      setProfile(prof)
      await loadData()
      setLoading(false)
    }
    load()
  }, [])

  async function handleCreateRun(e: React.FormEvent) {
    e.preventDefault()
    setCreateError('')
    setCreating(true)

    const ref = runRefId.trim()
    const refUrl = url.trim()
    if (!ref) { setCreateError('任务编号不能为空'); setCreating(false); return }
    if (!refUrl) { setCreateError('参考链接不能为空'); setCreating(false); return }

    const { data: existing } = await supabase
      .from('references')
      .select('id')
      .eq('run_ref_id', ref)
      .single()

    if (existing) { setCreateError('该编号已存在，请换一个'); setCreating(false); return }

    const { data: newRef, error } = await supabase
      .from('references')
      .insert({ run_ref_id: ref, url: refUrl, status: 'SUBMITTED', created_by: profile!.id })
      .select('id')
      .single()

    if (error || !newRef) { setCreateError(error?.message ?? '创建失败'); setCreating(false); return }

    await supabase.from('tasks').insert({
      type: 'REVIEW_REFERENCE',
      status: 'OPEN',
      reference_id: newRef.id,
      assignee_role: 'admin',
    })

    setRunRefId('')
    setUrl('')
    setCreating(false)
    setFormOpen(false)
    setPendingRunRef(ref)
  }

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.replace('/login')
  }

  const isFinished = (r: Reference) => STAGES.every(s => progress[r.id]?.[s] === 'DONE')
  const inProgress = references.filter(r => !isFinished(r))
  const finished = references.filter(r => isFinished(r))

  if (loading) {
    return (
      <>
        <style>{css}</style>
        <div className="shell">
          <div className="loading-state">
            <span className="dot" /><span className="dot" style={{ animationDelay: '.15s' }} /><span className="dot" style={{ animationDelay: '.3s' }} />
          </div>
        </div>
      </>
    )
  }

  const renderRow = (r: Reference) => {
    const ref_progress = progress[r.id] ?? {}
    return (
      <div key={r.id} className="task-card">
        <div className="task-card-body">
          <span className="task-run-ref">{r.run_ref_id}</span>
          <div className="stage-row">
            {STAGES.map(stage => {
              const s = ref_progress[stage]
              const cls = s === 'DONE' ? 'stage-done' : s === 'OPEN' ? 'stage-open' : 'stage-empty'
              return (
                <span key={stage} className={`stage-pill ${cls}`}>
                  {s === 'DONE' ? '✓' : s === 'OPEN' ? '●' : '○'} {STAGE_LABELS[stage]}
                </span>
              )
            })}
          </div>
        </div>
        <button
          className="action-btn action-btn--ghost"
          onClick={() => router.push(`/admin/run/${encodeURIComponent(r.run_ref_id)}`)}
        >
          查看
        </button>
      </div>
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
              <p className="brand-sub">管理员工作台</p>
            </div>
          </div>
          <nav className="header-nav">
            <button className="nav-btn nav-btn--ghost" onClick={handleSignOut}>退出</button>
          </nav>
        </header>

        <main className="main">

          {/* 新建任务 */}
          <section className="new-task-section">
            <button
              className={`new-task-toggle ${formOpen ? 'new-task-toggle--open' : ''}`}
              onClick={() => { setFormOpen(v => !v); setCreateError('') }}
            >
              <span className="new-task-icon">{formOpen ? '×' : '+'}</span>
              <span>{formOpen ? '取消' : '新建任务'}</span>
            </button>

            {formOpen && (
              <form className="new-task-form" onSubmit={handleCreateRun}>
                <div className="form-field">
                  <label className="form-label">任务编号</label>
                  <input
                    className="form-input"
                    value={runRefId}
                    onChange={e => setRunRefId(e.target.value)}
                    placeholder="如：2026-03-产品介绍"
                    required
                  />
                </div>
                <div className="form-field">
                  <label className="form-label">参考链接</label>
                  <input
                    className="form-input"
                    value={url}
                    onChange={e => setUrl(e.target.value)}
                    placeholder="https://..."
                    required
                  />
                </div>
                {createError && <p className="form-msg form-msg--err">{createError}</p>}
                <button type="submit" className="submit-btn" disabled={creating || !runRefId.trim() || !url.trim()}>
                  {creating ? '创建中…' : '创建任务 →'}
                </button>
              </form>
            )}
          </section>

          {/* 进行中 */}
          <section className="task-section">
            <div className="section-header">
              <span className="section-label">进行中</span>
              <span className={`section-badge ${inProgress.length > 0 ? 'section-badge--active' : ''}`}>{inProgress.length}</span>
            </div>
            {inProgress.length === 0 ? (
              <p className="empty-row">暂无进行中的任务。</p>
            ) : (() => {
              // Group by guest
              const groupMap: Record<string, Reference[]> = {}
              for (const r of inProgress) {
                const gid = refGuestMap[r.id] ?? '__unassigned__'
                if (!groupMap[gid]) groupMap[gid] = []
                groupMap[gid].push(r)
              }
              const groups = Object.entries(groupMap)
                .map(([gid, refs]) => ({
                  guestId: gid,
                  label: gid === '__unassigned__' ? '未分配' : (guestNameMap[gid] ?? gid),
                  refs,
                }))
                .sort((a, b) => {
                  if (a.guestId === '__unassigned__') return 1
                  if (b.guestId === '__unassigned__') return -1
                  return a.label.localeCompare(b.label)
                })
              return (
                <>
                  {groups.map(({ guestId, label, refs }) => (
                    <div key={guestId} className="guest-group">
                      <button className="guest-group-header" onClick={() => toggleGuestGroup(guestId)}>
                        <span className="guest-group-chevron">{collapsedGuests.has(guestId) ? '▶' : '▼'}</span>
                        <span className="guest-group-name">{label}</span>
                        <span className="guest-group-count">{refs.length}</span>
                      </button>
                      {!collapsedGuests.has(guestId) && (
                        <div className="task-list guest-group-body">{refs.map(renderRow)}</div>
                      )}
                    </div>
                  ))}
                </>
              )
            })()}
          </section>

          {/* 已完成 */}
          {finished.length > 0 && (
            <section className="task-section">
              <button className="guest-group-header" onClick={() => setFinishedCollapsed(v => !v)}>
                <span className="guest-group-chevron">{finishedCollapsed ? '▶' : '▼'}</span>
                <span className="section-label" style={{ flex: 1 }}>已完成</span>
                <span className="section-badge">{finished.length}</span>
              </button>
              {!finishedCollapsed && (
                <div className="task-list guest-group-body">{finished.map(renderRow)}</div>
              )}
            </section>
          )}

        </main>
      </div>

      {/* 创建成功弹窗 */}
      {pendingRunRef && (
        <div className="modal-overlay">
          <div className="modal">
            <p className="modal-text">创建成功。请跳转到 Fieldshortcut 将 URL 转成文案，再粘贴回来。</p>
            <div className="modal-actions">
              <button
                className="modal-btn modal-btn--primary"
                onClick={() => {
                  window.open('https://fieldshortcut.com/en/tools/video-summary', '_blank')
                  router.push(`/admin/run/${encodeURIComponent(pendingRunRef)}`)
                  setPendingRunRef(null)
                }}
              >
                确定
              </button>
              <button
                className="modal-btn modal-btn--ghost"
                onClick={() => { router.push(`/admin/run/${encodeURIComponent(pendingRunRef)}`); setPendingRunRef(null) }}
              >
                跳过
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

const css = `
  @import url('https://fonts.googleapis.com/css2?family=Noto+Serif+SC:wght@400;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap');
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  :root {
    --bg: #0c0c0c; --surface: #141414; --surface2: #1c1c1c;
    --border: #242424; --border2: #2e2e2e;
    --text: #e8e4dc; --text-muted: #5a5650; --text-dim: #3a3834;
    --amber: #e8a020; --amber-dim: #c4861a; --amber-glow: rgba(232,160,32,0.08);
    --green: #5a8a6a; --green-dim: rgba(90,138,106,0.15); --red: #c0504a;
    --mono: 'IBM Plex Mono', monospace; --serif: 'Noto Serif SC', serif;
  }
  body { background: var(--bg); color: var(--text); }
  .shell { min-height: 100vh; background: var(--bg); font-family: var(--mono); }

  .loading-state { display: flex; align-items: center; justify-content: center; min-height: 100vh; gap: 6px; }
  .dot { width: 6px; height: 6px; border-radius: 50%; background: var(--amber); animation: pulse 1s ease-in-out infinite; }
  @keyframes pulse { 0%,100%{opacity:.2;transform:scale(.8);} 50%{opacity:1;transform:scale(1);} }

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

  .main { max-width: 720px; margin: 0 auto; padding: 24px 16px 80px; }

  .new-task-section { margin-bottom: 32px; }
  .new-task-toggle { display: flex; align-items: center; gap: 10px; width: 100%; padding: 14px 18px; font-family: var(--mono); font-size: 14px; font-weight: 500; color: var(--amber); background: var(--amber-glow); border: 1px solid var(--amber); cursor: pointer; transition: background .15s; text-align: left; }
  .new-task-toggle:hover { background: rgba(232,160,32,.14); }
  .new-task-toggle--open { border-color: var(--amber-dim); }
  .new-task-icon { width: 20px; height: 20px; display: flex; align-items: center; justify-content: center; font-size: 18px; line-height: 1; flex-shrink: 0; }
  .new-task-form { padding: 20px; border: 1px solid var(--border); border-top: none; background: var(--surface); display: flex; flex-direction: column; gap: 16px; animation: slideDown .15s ease; }
  @keyframes slideDown { from{opacity:0;transform:translateY(-4px);} to{opacity:1;transform:translateY(0);} }
  .form-field { display: flex; flex-direction: column; gap: 6px; }
  .form-label { font-size: 10px; letter-spacing: .12em; text-transform: uppercase; color: var(--text-muted); }
  .form-input { width: 100%; padding: 10px 12px; font-family: var(--mono); font-size: 14px; color: var(--text); background: var(--surface2); border: 1px solid var(--border); outline: none; transition: border-color .15s; -webkit-appearance: none; }
  .form-input::placeholder { color: var(--text-dim); }
  .form-input:focus { border-color: var(--amber); }
  .form-msg { font-size: 13px; padding: 8px 12px; border-left: 2px solid; }
  .form-msg--ok { color: var(--green); border-color: var(--green); background: var(--green-dim); }
  .form-msg--err { color: var(--red); border-color: var(--red); background: rgba(192,80,74,.1); }
  .submit-btn { width: 100%; padding: 13px; font-family: var(--mono); font-size: 14px; font-weight: 600; color: #000; background: var(--amber); border: none; cursor: pointer; transition: background .15s, opacity .15s; letter-spacing: .02em; }
  .submit-btn:hover:not(:disabled) { background: #f0ac30; }
  .submit-btn:disabled { opacity: .4; cursor: not-allowed; }

  .task-section { margin-bottom: 32px; }
  .section-header { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; padding-bottom: 10px; border-bottom: 1px solid var(--border); }
  .section-label { font-size: 10px; font-weight: 600; letter-spacing: .18em; text-transform: uppercase; color: var(--text-muted); }
  .section-badge { font-size: 10px; font-weight: 600; padding: 2px 7px; background: var(--surface2); color: var(--text-muted); border: 1px solid var(--border); }
  .section-badge--active { background: var(--amber-glow); color: var(--amber); border-color: rgba(232,160,32,.3); }

  .task-list { display: flex; flex-direction: column; gap: 8px; }
  .task-card { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 14px 16px; border: 1px solid var(--border); background: var(--surface); }
  .task-card-body { display: flex; flex-direction: column; gap: 8px; min-width: 0; flex: 1; }
  .task-run-ref { font-family: var(--mono); font-size: 14px; font-weight: 600; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .stage-row { display: flex; flex-wrap: wrap; gap: 6px; }
  .stage-pill { font-size: 11px; padding: 2px 8px; letter-spacing: .03em; }
  .stage-done { background: rgba(90,138,106,.12); color: var(--green); }
  .stage-open { background: var(--amber-glow); color: var(--amber); }
  .stage-empty { background: var(--surface2); color: var(--text-dim); }

  .action-btn { padding: 8px 16px; font-family: var(--mono); font-size: 12px; font-weight: 500; cursor: pointer; white-space: nowrap; flex-shrink: 0; transition: background .15s, color .15s; border: 1px solid; }
  .action-btn--ghost { background: none; color: var(--text-muted); border-color: var(--border); }
  .action-btn--ghost:hover { color: var(--text); border-color: var(--border2); }

  .empty-row { font-size: 13px; color: var(--text-dim); padding: 12px 0; }

  .guest-group { margin-bottom: 12px; }
  .guest-group-header { display: flex; align-items: center; gap: 8px; width: 100%; padding: 8px 0; background: none; border: none; border-bottom: 1px solid var(--border2); cursor: pointer; text-align: left; transition: border-color .15s; margin-bottom: 0; font-family: var(--mono); }
  .guest-group-header:hover { border-color: var(--amber); }
  .guest-group-chevron { font-size: 9px; color: var(--text-dim); flex-shrink: 0; width: 12px; }
  .guest-group-name { font-size: 12px; font-weight: 600; color: var(--amber); letter-spacing: .06em; flex: 1; }
  .guest-group-count { font-size: 11px; color: var(--text-dim); }
  .guest-group-body { margin-top: 8px; }

  .modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,.8); display: flex; align-items: center; justify-content: center; z-index: 50; padding: 16px; }
  .modal { background: var(--surface); border: 1px solid var(--border2); padding: 40px 32px; max-width: 480px; width: 100%; font-family: var(--mono); }
  .modal-text { font-size: 15px; color: var(--text); line-height: 1.7; margin-bottom: 28px; }
  .modal-actions { display: flex; gap: 12px; }
  .modal-btn { flex: 1; padding: 13px; font-family: var(--mono); font-size: 14px; font-weight: 600; cursor: pointer; border: 1px solid; transition: background .15s; }
  .modal-btn--primary { background: var(--amber); color: #000; border-color: var(--amber); }
  .modal-btn--primary:hover { background: #f0ac30; }
  .modal-btn--ghost { background: none; color: var(--text-muted); border-color: var(--border); }
  .modal-btn--ghost:hover { color: var(--text); border-color: var(--border2); }

  @media (max-width: 480px) {
    .header { padding: 12px 16px; }
    .brand-mark { width: 32px; height: 32px; font-size: 16px; }
    .brand-title { font-size: 16px; }
    .main { padding: 20px 12px 80px; }
    .task-card { flex-direction: column; align-items: flex-start; gap: 10px; }
    .action-btn { width: 100%; text-align: center; padding: 10px; font-size: 13px; }
    .task-run-ref { font-size: 13px; white-space: normal; }
  }
`
