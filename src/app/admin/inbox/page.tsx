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
  REVIEW_REFERENCE: '审核',
  REVIEW_SCRIPT:    '脚本',
  RECORD_VIDEO:     '录制',
  EDIT_VIDEO:       '剪辑',
}

// per-reference: which task types exist and at what status
type RefProgress = Record<string, 'DONE' | 'OPEN' | null>

export default function AdminInbox() {
  const router = useRouter()
  const supabase = createClient()

  const [profile, setProfile] = useState<Profile | null>(null)
  const [references, setReferences] = useState<Reference[]>([])
  const [progress, setProgress] = useState<Record<string, RefProgress>>({})
  const [runRefId, setRunRefId] = useState('')
  const [url, setUrl] = useState('')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState('')
  const [loading, setLoading] = useState(true)
  const [pendingRunRef, setPendingRunRef] = useState<string | null>(null)

  async function loadData() {
    const { data: refs } = await supabase
      .from('references')
      .select('id, run_ref_id, status')
      .order('created_at', { ascending: false })
    const refList = (refs ?? []) as Reference[]
    setReferences(refList)

    // Fetch all tasks with their reference connection (direct or via script)
    const { data: tasks } = await supabase
      .from('tasks')
      .select('type, status, reference_id, script:scripts!script_id(reference_id)')

    // Build progress map: refId → { taskType → 'DONE' | 'OPEN' }
    const map: Record<string, RefProgress> = {}
    for (const t of tasks ?? []) {
      const refId = (t.reference_id ?? (t.script as { reference_id: string } | null)?.reference_id) as string | null
      if (!refId) continue
      if (!map[refId]) map[refId] = {}
      const current = map[refId][t.type]
      // DONE wins over OPEN
      if (current !== 'DONE') map[refId][t.type] = t.status === 'DONE' ? 'DONE' : 'OPEN'
    }
    setProgress(map)
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
    if (!ref) { setCreateError('run_ref_id is required'); setCreating(false); return }
    if (!refUrl) { setCreateError('URL is required'); setCreating(false); return }

    const { data: existing } = await supabase
      .from('references')
      .select('id')
      .eq('run_ref_id', ref)
      .single()

    if (existing) { setCreateError('run_ref_id already exists'); setCreating(false); return }

    const { data: newRef, error } = await supabase
      .from('references')
      .insert({ run_ref_id: ref, url: refUrl, status: 'SUBMITTED', created_by: profile!.id })
      .select('id')
      .single()

    if (error || !newRef) { setCreateError(error?.message ?? 'Failed to create run'); setCreating(false); return }

    await supabase.from('tasks').insert({
      type: 'REVIEW_REFERENCE',
      status: 'OPEN',
      reference_id: newRef.id,
      assignee_role: 'admin',
    })

    setRunRefId('')
    setUrl('')
    setCreating(false)
    setPendingRunRef(ref)
  }

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.replace('/login')
  }

  if (loading) return <div style={{ padding: 48, background: '#111', minHeight: '100vh', color: '#f0f0f0' }}>Loading...</div>

  return (
    <>
    <div style={{ minHeight: '100vh', background: '#111', color: '#f0f0f0' }}>
      <div style={{ maxWidth: 1080, margin: '0 auto', padding: 48, fontFamily: 'monospace' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 48 }}>
          <h1 style={{ fontSize: 30, fontWeight: 700 }}>UMI — 管理员工作台</h1>
          <button onClick={handleSignOut} style={{ fontSize: 20, cursor: 'pointer', background: 'none', border: '1px solid #2a2a2a', padding: '6px 15px', color: '#888' }}>
            退出登录
          </button>
        </div>

        <section style={{ marginBottom: 60, padding: 30, border: '1px solid #2a2a2a', background: '#1a1a1a' }}>
          <h2 style={{ fontSize: 21, fontWeight: 600, marginBottom: 18 }}>新建任务</h2>
          <form onSubmit={handleCreateRun} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <input
              type="text"
              placeholder="任务编号（如 YYYY-MM-DD-标题）"
              value={runRefId}
              onChange={e => setRunRefId(e.target.value)}
              style={{ padding: '9px 15px', fontSize: 21, border: '1px solid #2a2a2a', outline: 'none', background: '#222', color: '#f0f0f0' }}
            />
            <input
              type="text"
              placeholder="参考链接 URL"
              value={url}
              onChange={e => setUrl(e.target.value)}
              style={{ padding: '9px 15px', fontSize: 21, border: '1px solid #2a2a2a', outline: 'none', background: '#222', color: '#f0f0f0' }}
            />
            <button
              type="submit"
              disabled={creating}
              style={{ padding: '9px 24px', fontSize: 21, fontWeight: 600, background: '#f0f0f0', color: '#111', border: 'none', cursor: 'pointer' }}
            >
              {creating ? '...' : '创建'}
            </button>
          </form>
          {createError && <p style={{ color: '#f87171', fontSize: 20, marginTop: 12 }}>{createError}</p>}
        </section>

        {(() => {
          const isFinished = (r: Reference) => STAGES.every(s => progress[r.id]?.[s] === 'DONE')
          const inProgress = references.filter(r => !isFinished(r))
          const finished = references.filter(r => isFinished(r))

          const renderRow = (r: Reference) => {
            const ref_progress = progress[r.id] ?? {}
            return (
              <div key={r.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid #1e1e1e' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 24, fontSize: 18 }}>
                  <span style={{ fontWeight: 600, minWidth: 80 }}>{r.run_ref_id}</span>
                  <div style={{ display: 'flex', gap: 16 }}>
                    {STAGES.map(stage => {
                      const s = ref_progress[stage]
                      const color = s === 'DONE' ? '#4ade80' : s === 'OPEN' ? '#f0f0f0' : '#333'
                      return (
                        <span key={stage} style={{ color, fontSize: 16 }}>
                          {s === 'DONE' ? '✓' : s === 'OPEN' ? '●' : '○'} {STAGE_LABELS[stage]}
                        </span>
                      )
                    })}
                  </div>
                </div>
                <button
                  onClick={() => router.push(`/admin/run/${r.run_ref_id}`)}
                  style={{ fontSize: 16, padding: '4px 12px', cursor: 'pointer', border: 'none', background: '#f0f0f0', color: '#111' }}
                >
                  查看
                </button>
              </div>
            )
          }

          return (
            <>
              <section style={{ marginBottom: 48 }}>
                <h2 style={{ fontSize: 17, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 3, color: '#444', marginBottom: 18 }}>进行中 ({inProgress.length})</h2>
                {inProgress.length === 0
                  ? <p style={{ fontSize: 20, color: '#555' }}>暂无进行中的任务。</p>
                  : inProgress.map(renderRow)
                }
              </section>

              <section>
                <h2 style={{ fontSize: 17, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 3, color: '#444', marginBottom: 18 }}>已完成 ({finished.length})</h2>
                {finished.length === 0
                  ? <p style={{ fontSize: 20, color: '#555' }}>暂无已完成的任务。</p>
                  : finished.map(renderRow)
                }
              </section>
            </>
          )
        })()}
      </div>
    </div>

    {pendingRunRef && (
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
        <div style={{ background: '#1a1a1a', border: '1px solid #2a2a2a', padding: 48, maxWidth: 480, width: '100%', fontFamily: 'monospace' }}>
          <p style={{ fontSize: 20, color: '#f0f0f0', marginBottom: 32, lineHeight: 1.6 }}>
            创建成功，请跳转到 Fieldshortcut 将 URL 转成文案，再粘贴回来
          </p>
          <div style={{ display: 'flex', gap: 12 }}>
            <button
              onClick={() => {
                window.open('https://fieldshortcut.com/en/tools/video-summary', '_blank')
                router.push(`/admin/run/${pendingRunRef}`)
                setPendingRunRef(null)
              }}
              style={{ flex: 1, padding: '12px', fontSize: 20, fontWeight: 600, background: '#f0f0f0', color: '#111', border: 'none', cursor: 'pointer' }}
            >
              确定
            </button>
            <button
              onClick={() => { router.push(`/admin/run/${pendingRunRef}`); setPendingRunRef(null) }}
              style={{ flex: 1, padding: '12px', fontSize: 20, background: '#1a1a1a', color: '#888', border: '1px solid #2a2a2a', cursor: 'pointer' }}
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
