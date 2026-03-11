'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

type Guest = {
  id: string
  display_name: string | null
  email: string | null
  default_editor_id: string | null
}

type Editor = {
  id: string
  display_name: string | null
  email: string | null
}

export default function AdminGuestsPage() {
  const router = useRouter()
  const supabase = createClient()

  const [guests, setGuests] = useState<Guest[]>([])
  const [editors, setEditors] = useState<Editor[]>([])
  const [loading, setLoading] = useState(true)
  const [savedMap, setSavedMap] = useState<Record<string, boolean>>({})
  const [errorMap, setErrorMap] = useState<Record<string, string>>({})

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace('/login'); return }

      const { data: prof } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()
      if (!prof || prof.role !== 'admin') { router.replace('/'); return }

      const [{ data: guestRows }, { data: editorRows }] = await Promise.all([
        supabase.from('profiles').select('id, display_name, email, default_editor_id').eq('role', 'guest'),
        supabase.from('profiles').select('id, display_name, email').eq('role', 'editor'),
      ])

      setGuests((guestRows ?? []) as Guest[])
      setEditors((editorRows ?? []) as Editor[])
      setLoading(false)
    }
    load()
  }, [])

  async function handleEditorChange(guestId: string, editorId: string) {
    setErrorMap(prev => ({ ...prev, [guestId]: '' }))

    const { error } = await supabase
      .from('profiles')
      .update({ default_editor_id: editorId || null })
      .eq('id', guestId)

    if (error) {
      setErrorMap(prev => ({ ...prev, [guestId]: '保存失败' }))
      return
    }

    setGuests(prev => prev.map(g => g.id === guestId ? { ...g, default_editor_id: editorId || null } : g))
    setSavedMap(prev => ({ ...prev, [guestId]: true }))
    setTimeout(() => setSavedMap(prev => ({ ...prev, [guestId]: false })), 2000)
  }

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

  return (
    <>
      <style>{css}</style>
      <div className="shell">

        <header className="header">
          <div className="header-left">
            <div className="brand-mark">U</div>
            <div>
              <h1 className="brand-title">UMI</h1>
              <p className="brand-sub">嘉宾管理</p>
            </div>
          </div>
          <nav className="header-nav">
            <button className="nav-btn" onClick={() => router.push('/admin/inbox')}>← 工作台</button>
            <button className="nav-btn nav-btn--ghost" onClick={async () => { await supabase.auth.signOut(); router.replace('/login') }}>退出</button>
          </nav>
        </header>

        <main className="main">
          <div className="section-header">
            <span className="section-label">默认剪辑师分配</span>
          </div>
          <p className="page-desc">为每位嘉宾设置默认剪辑师。录制完成后将自动分配剪辑任务。</p>

          {guests.length === 0 ? (
            <p className="empty-row">暂无嘉宾账号。</p>
          ) : (
            <div className="guest-list">
              {guests.map(g => (
                <div key={g.id} className="guest-row">
                  <div className="guest-info">
                    <span className="guest-name">{g.display_name ?? g.email ?? g.id}</span>
                    {g.email && g.display_name && <span className="guest-email">{g.email}</span>}
                  </div>
                  <div className="editor-assign">
                    <select
                      className="editor-select"
                      value={g.default_editor_id ?? ''}
                      onChange={e => handleEditorChange(g.id, e.target.value)}
                    >
                      <option value="">— 未分配 —</option>
                      {editors.map(ed => (
                        <option key={ed.id} value={ed.id}>
                          {ed.display_name ?? ed.email ?? ed.id}
                        </option>
                      ))}
                    </select>
                    {savedMap[g.id] && <span className="saved-indicator">已保存</span>}
                    {errorMap[g.id] && <span className="error-indicator">{errorMap[g.id]}</span>}
                  </div>
                </div>
              ))}
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
    --bg: #0c0c0c; --surface: #141414; --surface2: #1c1c1c;
    --border: #242424; --border2: #2e2e2e;
    --text: #e8e4dc; --text-muted: #5a5650; --text-dim: #3a3834;
    --amber: #e8a020; --amber-glow: rgba(232,160,32,0.08);
    --green: #5a8a6a; --red: #c0504a;
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

  .main { max-width: 720px; margin: 0 auto; padding: 32px 16px 80px; }
  .section-header { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; padding-bottom: 10px; border-bottom: 1px solid var(--border); }
  .section-label { font-size: 10px; font-weight: 600; letter-spacing: .18em; text-transform: uppercase; color: var(--text-muted); }
  .page-desc { font-size: 13px; color: var(--text-dim); margin-bottom: 28px; }

  .guest-list { display: flex; flex-direction: column; }
  .guest-row { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 16px 0; border-bottom: 1px solid var(--border); flex-wrap: wrap; }
  .guest-info { display: flex; flex-direction: column; gap: 3px; min-width: 0; flex: 1; }
  .guest-name { font-size: 14px; font-weight: 600; color: var(--text); }
  .guest-email { font-size: 12px; color: var(--text-muted); }
  .editor-assign { display: flex; align-items: center; gap: 10px; flex-shrink: 0; }
  .editor-select { padding: 8px 12px; font-family: var(--mono); font-size: 13px; background: var(--surface2); color: var(--text); border: 1px solid var(--border); outline: none; cursor: pointer; transition: border-color .15s; min-width: 160px; }
  .editor-select:focus { border-color: var(--amber); }
  .saved-indicator { font-size: 11px; color: var(--green); letter-spacing: .06em; animation: fadeOut 2s forwards; }
  @keyframes fadeOut { 0%,70%{opacity:1;} 100%{opacity:0;} }
  .error-indicator { font-size: 11px; color: var(--red); letter-spacing: .06em; }
  .empty-row { font-size: 13px; color: var(--text-dim); padding: 12px 0; }

  @media (max-width: 480px) {
    .header { padding: 12px 16px; }
    .brand-mark { width: 32px; height: 32px; font-size: 16px; }
    .brand-title { font-size: 16px; }
    .main { padding: 20px 12px 80px; }
    .guest-row { flex-direction: column; align-items: flex-start; gap: 10px; }
    .editor-assign { width: 100%; }
    .editor-select { width: 100%; }
  }
`
