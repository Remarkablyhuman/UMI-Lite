'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

type Reference = {
  id: string
  run_ref_id: string
  url: string
  status: string
  parsed_json: Record<string, unknown> | null
}

type Script = {
  id: string
  reference_id: string
  guest_id: string
  status: string
  script_text: string | null
}

type Deliverable = {
  id: string
  script_id: string
  type: 'raw' | 'final'
  storage_path: string | null
  baidu_share_url: string
  baidu_extract_code: string | null
  file_label: string | null
}

type Task = {
  id: string
  type: string
  status: string
  assignee_id: string | null
  assignee_role: string | null
  reference_id: string | null
  script_id: string | null
}

type GuestProfile = {
  id: string
  email: string | null
  display_name: string | null
}

export default function AdminRunPage() {
  const router = useRouter()
  const { run_ref_id } = useParams<{ run_ref_id: string }>()
  const supabase = createClient()

  const [reference, setReference] = useState<Reference | null>(null)
  const [script, setScript] = useState<Script | null>(null)
  const [deliverables, setDeliverables] = useState<Deliverable[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [guests, setGuests] = useState<GuestProfile[]>([])
  const [editors, setEditors] = useState<GuestProfile[]>([])
  const [scriptText, setScriptText] = useState('')
  const [selectedGuestIds, setSelectedGuestIds] = useState<string[]>([])
  const [selectedEditorId, setSelectedEditorId] = useState('')
  const [userRole, setUserRole] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [actionMsg, setActionMsg] = useState('')
  const [generating, setGenerating] = useState(false)
  const [extraInstructions, setExtraInstructions] = useState('')
  const [genTargetChars, setGenTargetChars] = useState(600)
  const [genPlatform, setGenPlatform] = useState('wechat')
  const [genFormat, setGenFormat] = useState('voice_over')
  const [genPart1, setGenPart1] = useState('')
  const [genPart2, setGenPart2] = useState('')

  async function load() {
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { data: prof } = await supabase.from('profiles').select('role').eq('id', user.id).single()
      setUserRole(prof?.role ?? null)
    }

    const { data: ref } = await supabase
      .from('references')
      .select('id, run_ref_id, url, status, parsed_json')
      .eq('run_ref_id', run_ref_id)
      .single()
    setReference(ref ?? null)

    if (!ref) { setLoading(false); return }

    const { data: sc } = await supabase
      .from('scripts')
      .select('id, reference_id, guest_id, status, script_text')
      .eq('reference_id', ref.id)
      .single()
    setScript(sc ?? null)
    if (sc?.script_text) setScriptText(sc.script_text)
    if (sc?.guest_id) setSelectedGuestIds([sc.guest_id])

    const { data: dels } = sc
      ? await supabase
          .from('deliverables')
          .select('id, script_id, type, storage_path, baidu_share_url, baidu_extract_code, file_label')
          .eq('script_id', sc.id)
          .order('created_at', { ascending: true })
      : { data: [] }
    setDeliverables(dels ?? [])

    const { data: tks } = await supabase
      .from('tasks')
      .select('id, type, status, assignee_id, assignee_role, reference_id, script_id')
      .eq('reference_id', ref.id)
      .order('created_at', { ascending: true })
    setTasks(tks ?? [])

    const { data: guestList } = await supabase
      .from('profiles')
      .select('id, email, display_name')
      .eq('role', 'guest')
    setGuests(guestList ?? [])

    const { data: editorList } = await supabase
      .from('profiles')
      .select('id, email, display_name')
      .eq('role', 'editor')
    setEditors(editorList ?? [])

    setLoading(false)
  }

  useEffect(() => { load() }, [run_ref_id])

  async function action(fn: () => Promise<void>) {
    setActionMsg('')
    await fn()
    await load()
  }

  async function markParsed() {
    await supabase.from('references').update({ status: 'PARSED' }).eq('id', reference!.id)
    setActionMsg('参考素材已标记为已解析。')
  }

  async function generateScript() {
    if (selectedGuestIds.length === 0) { setActionMsg('请先选择嘉宾。'); return }
    setGenerating(true)
    setActionMsg('')
    try {
      const { data: personaRow } = await supabase
        .from('guest_profiles')
        .select('profile_data')
        .eq('guest_id', selectedGuestIds[0])
        .maybeSingle()

      const res = await fetch('/api/generate-script', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          referenceTranscript: scriptText,
          extraInstructions,
          personaJson: personaRow?.profile_data ?? {},
          constraints: {
            target_chars: genTargetChars,
            platform: genPlatform,
            format: genFormat,
          },
        }),
      })
      const data = await res.json()
      if (data.error) { setActionMsg(data.error ?? 'AI 生成失败') }
      else {
        setGenPart1(data.part1 ?? '')
        setGenPart2(data.part2 ?? '')
      }
    } catch {
      setActionMsg('AI 生成失败')
    }
    setGenerating(false)
  }

  function toggleGuest(id: string) {
    setSelectedGuestIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  async function saveDraftScript() {
    if (!scriptText.trim()) { setActionMsg('请输入脚本内容。'); return }
    if (selectedGuestIds.length === 0) { setActionMsg('请先选择达人。'); return }

    if (script) {
      await supabase.from('scripts').update({ script_text: scriptText.trim(), guest_id: selectedGuestIds[0] }).eq('id', script.id)
    } else {
      await supabase.from('scripts').insert({
        reference_id: reference!.id,
        guest_id: selectedGuestIds[0],
        script_text: scriptText.trim(),
        status: 'DRAFT',
      })
    }
    setActionMsg('脚本草稿已保存。')
  }

  async function approveReference() {
    if (selectedGuestIds.length === 0) { setActionMsg('请先选择达人。'); return }

    const finalScriptText = genPart1.trim() || scriptText.trim()
    if (!finalScriptText) { setActionMsg('请先输入脚本内容。'); return }

    let scriptId = script?.id

    if (!scriptId) {
      const { data: newScript, error } = await supabase
        .from('scripts')
        .insert({
          reference_id: reference!.id,
          guest_id: selectedGuestIds[0],
          script_text: finalScriptText,
          status: 'DRAFT',
        })
        .select('id')
        .single()
      if (error || !newScript) { setActionMsg(error?.message ?? 'Failed to create script'); return }
      scriptId = newScript.id
    } else {
      await supabase.from('scripts').update({ script_text: finalScriptText, guest_id: selectedGuestIds[0] }).eq('id', scriptId)
    }

    await supabase.from('references').update({ status: 'APPROVED' }).eq('id', reference!.id)

    const reviewTask = tasks.find(t => t.type === 'REVIEW_REFERENCE' && t.status === 'OPEN')
    if (reviewTask) {
      await supabase.from('tasks').update({ status: 'DONE' }).eq('id', reviewTask.id)
    }

    await supabase.from('tasks').insert({
      type: 'REVIEW_SCRIPT',
      status: 'OPEN',
      reference_id: reference!.id,
      script_id: scriptId,
      assignee_role: 'admin',
    })

    setActionMsg('参考素材已审核通过，脚本已创建。')
  }

  async function saveScript() {
    if (!script) return
    await supabase.from('scripts').update({ script_text: scriptText }).eq('id', script.id)
    setActionMsg('脚本已保存。')
  }

  async function approveScript() {
    if (!script) return
    if (selectedGuestIds.length === 0) { setActionMsg('请先选择达人。'); return }

    await supabase.from('scripts').update({ status: 'APPROVED', script_text: scriptText }).eq('id', script.id)

    const reviewTask = tasks.find(t => t.type === 'REVIEW_SCRIPT' && t.status === 'OPEN')
    if (reviewTask) {
      await supabase.from('tasks').update({ status: 'DONE' }).eq('id', reviewTask.id)
    }

    await supabase.from('tasks').insert(
      selectedGuestIds.map(guestId => ({
        type: 'RECORD_VIDEO',
        status: 'OPEN',
        reference_id: reference!.id,
        script_id: script.id,
        assignee_id: guestId,
        assignee_role: 'guest',
      }))
    )

    setActionMsg(`脚本已审核通过，录制任务已发送给 ${selectedGuestIds.length} 位达人。`)
  }

  async function createEditTask() {
    if (!script) return
    if (!selectedEditorId) { setActionMsg('请先选择剪辑师。'); return }

    await supabase.from('tasks').insert({
      type: 'EDIT_VIDEO',
      status: 'OPEN',
      reference_id: reference!.id,
      script_id: script.id,
      assignee_id: selectedEditorId,
      assignee_role: 'editor',
      deliverable_type: 'raw',
    })

    setActionMsg('剪辑任务已分配给剪辑师。')
  }

  async function createReviewFinalCutTask() {
    if (!script) return

    await supabase.from('tasks').insert({
      type: 'REVIEW_FINAL_CUT',
      status: 'OPEN',
      reference_id: reference!.id,
      script_id: script.id,
      assignee_role: 'admin',
    })

    setActionMsg('成片审核任务已创建。')
  }

  async function approveFinalCut() {
    const reviewTask = tasks.find(t => t.type === 'REVIEW_FINAL_CUT' && t.status === 'OPEN')
    if (reviewTask) {
      await supabase.from('tasks').update({ status: 'DONE' }).eq('id', reviewTask.id)
    }
    if (script) {
      await supabase.from('scripts').update({ status: 'DONE' }).eq('id', script.id)
    }
    setActionMsg('成片已审核通过，本次任务完成。')
  }

  if (loading) return <div style={{ padding: 48, background: '#111', minHeight: '100vh', color: '#f0f0f0' }}>Loading...</div>
  if (!reference) return <div style={{ padding: 48, background: '#111', minHeight: '100vh', color: '#f0f0f0' }}>Run not found.</div>

  const openTask = tasks.find(t => t.status === 'OPEN')
  const raw = deliverables.find(d => d.type === 'raw')
  const final = deliverables.find(d => d.type === 'final')
  const recordDone = tasks.some(t => t.type === 'RECORD_VIDEO' && t.status === 'DONE')
  const editTaskExists = tasks.some(t => t.type === 'EDIT_VIDEO')
  const editDone = tasks.some(t => t.type === 'EDIT_VIDEO' && t.status === 'DONE')
  const reviewFinalExists = tasks.some(t => t.type === 'REVIEW_FINAL_CUT')

  return (
    <div style={{ minHeight: '100vh', background: '#111', color: '#f0f0f0' }}>
      <div style={{ maxWidth: 1080, margin: '0 auto', padding: 48, fontFamily: 'monospace' }}>
        <button onClick={() => router.push('/admin/inbox')} style={{ fontSize: 18, marginBottom: 36, cursor: 'pointer', background: 'none', border: 'none', textDecoration: 'underline', color: '#888' }}>
          ← 工作台
        </button>

        <h1 style={{ fontSize: 30, fontWeight: 700, marginBottom: 6 }}>{run_ref_id}</h1>
        <p style={{ fontSize: 20, color: '#555', marginBottom: 48 }}>状态：{reference.status}</p>

        <Section title="参考素材">
          <p style={{ fontSize: 20, color: '#888', marginBottom: 6 }}>
            <a href={reference.url} target="_blank" rel="noopener noreferrer" style={{ color: '#60a5fa' }}>{reference.url}</a>
          </p>
        </Section>

        <Section title="选择嘉宾">
            <GuestCheckboxes guests={guests} selectedIds={selectedGuestIds} onToggle={toggleGuest} />
        </Section>

        <Section title="脚本">
          {openTask?.type === 'REVIEW_REFERENCE' && (reference.status === 'SUBMITTED' || reference.status === 'PARSED') ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ position: 'relative' }}>
                <textarea
                  placeholder="输入脚本内容..."
                  value={scriptText}
                  onChange={e => setScriptText(e.target.value)}
                  rows={8}
                  style={{ width: '100%', boxSizing: 'border-box', fontSize: 20, padding: 15, paddingBottom: 32, border: '1px solid #2a2a2a', resize: 'vertical', background: '#1a1a1a', color: '#f0f0f0', outline: 'none' }}
                />
                <span style={{ position: 'absolute', bottom: 8, right: 12, fontSize: 13, color: '#444', pointerEvents: 'none' }}>
                  {scriptText.trim().length} 字
                </span>
              </div>
              <button onClick={() => action(saveDraftScript)} style={{ padding: '9px 24px', fontSize: 18, background: '#1a1a1a', color: '#f0f0f0', border: '1px solid #2a2a2a', cursor: 'pointer', textAlign: 'left' }}>
                保存草稿
              </button>
              {reference.status === 'PARSED' && (
                <>
                  <textarea
                    placeholder="追加说明（可选）：例如「语气轻松一点」「强调产品差异化」"
                    value={extraInstructions}
                    onChange={e => setExtraInstructions(e.target.value)}
                    rows={3}
                    style={{ width: '100%', boxSizing: 'border-box', fontSize: 18, padding: 12, background: '#111', color: '#f0f0f0', border: '1px solid #2a2a2a', outline: 'none', resize: 'vertical' }}
                  />
                  <div style={{ display: 'flex', gap: 12 }}>
                    <input
                      type="number"
                      value={genTargetChars}
                      onChange={e => setGenTargetChars(Math.min(2000, Math.max(100, Number(e.target.value))))}
                      placeholder="目标字数"
                      min={100}
                      max={2000}
                      step={100}
                      style={{ flex: 1, padding: '9px 12px', fontSize: 17, background: '#1a1a1a', color: '#f0f0f0', border: '1px solid #2a2a2a', outline: 'none' }}
                    />
                    <select
                      value={genPlatform}
                      onChange={e => setGenPlatform(e.target.value)}
                      style={{ flex: 1, padding: '9px 12px', fontSize: 17, background: '#1a1a1a', color: '#f0f0f0', border: '1px solid #2a2a2a', outline: 'none' }}
                    >
                      <option value="wechat">微信视频号</option>
                      <option value="xhs">小红书</option>
                      <option value="tiktok">抖音</option>
                      <option value="youtube">YouTube</option>
                    </select>
                    <select
                      value={genFormat}
                      onChange={e => setGenFormat(e.target.value)}
                      style={{ flex: 1, padding: '9px 12px', fontSize: 17, background: '#1a1a1a', color: '#f0f0f0', border: '1px solid #2a2a2a', outline: 'none' }}
                    >
                      <option value="voice_over">自述</option>
                      <option value="on_camera">口播</option>
                    </select>
                  </div>
                  <button
                    onClick={generateScript}
                    disabled={generating}
                    style={{ padding: '9px 24px', fontSize: 18, background: '#1a1a1a', color: generating ? '#555' : '#f0f0f0', border: '1px solid #2a2a2a', cursor: 'pointer', textAlign: 'left' }}
                  >
                    {generating ? 'AI 生成中...' : 'AI 生成脚本'}
                  </button>
                  {(genPart1 || genPart2) && (
                    <>
                      <p style={{ fontSize: 15, color: '#555', margin: '8px 0 4px' }}>脚本正文 <span style={{ color: '#444' }}>({genPart1.trim().length} 字)</span></p>
                      <textarea
                        value={genPart1}
                        onChange={e => setGenPart1(e.target.value)}
                        rows={10}
                        style={{ fontSize: 18, padding: 15, border: '1px solid #2a2a2a', resize: 'vertical', background: '#0a0a0a', color: '#ccc', outline: 'none' }}
                      />
                      <p style={{ fontSize: 15, color: '#555', margin: '8px 0 4px' }}>引用依据</p>
                      <textarea
                        readOnly
                        value={genPart2}
                        rows={6}
                        style={{ fontSize: 16, padding: 15, border: '1px solid #2a2a2a', resize: 'vertical', background: '#0a0a0a', color: '#666', outline: 'none' }}
                      />
                    </>
                  )}
                </>
              )}
            </div>
          ) : script ? (
            <div>
              <p style={{ fontSize: 18, color: '#555', marginBottom: 12 }}>Status: {script.status}</p>
              {openTask?.type === 'REVIEW_SCRIPT' ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <textarea
                    value={scriptText}
                    onChange={e => setScriptText(e.target.value)}
                    rows={10}
                    style={{ fontSize: 20, padding: 15, border: '1px solid #2a2a2a', resize: 'vertical', background: '#1a1a1a', color: '#f0f0f0', outline: 'none' }}
                  />
                  <button onClick={() => action(saveScript)} style={{ padding: '9px 24px', fontSize: 18, background: '#1a1a1a', color: '#f0f0f0', border: '1px solid #2a2a2a', cursor: 'pointer', textAlign: 'left' }}>
                    保存脚本
                  </button>
                </div>
              ) : (
                <pre style={{ fontSize: 20, whiteSpace: 'pre-wrap', background: '#1a1a1a', padding: 18, color: '#f0f0f0', border: '1px solid #2a2a2a' }}>{script.script_text}</pre>
              )}
            </div>
          ) : (
            <p style={{ fontSize: 20, color: '#555' }}>暂无脚本。</p>
          )}
        </Section>

        <Section title="视频文件">
          {raw ? <DeliverableRow label="原片" d={raw} /> : <p style={{ fontSize: 20, color: '#555' }}>暂无原片。</p>}
          {final ? <DeliverableRow label="成片" d={final} /> : <p style={{ fontSize: 20, color: '#555', marginTop: 12 }}>暂无成片。</p>}
        </Section>

        {userRole === 'admin' && <Section title="任务进度">
          {tasks.length === 0
            ? <p style={{ fontSize: 20, color: '#555' }}>暂无任务。</p>
            : tasks.map(t => (
              <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 20, padding: '9px 0', borderBottom: '1px solid #1e1e1e' }}>
                <span style={{ color: '#f0f0f0' }}>{t.type}</span>
                <span style={{ color: t.status === 'DONE' ? '#4ade80' : t.status === 'BLOCKED' ? '#f87171' : '#888' }}>{t.status}</span>
              </div>
            ))
          }
        </Section>}

        {userRole === 'admin' && <Section title="操作">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {reference.status === 'SUBMITTED' && (
              <ActionBtn label="参考素材已解析" onClick={() => action(markParsed)} />
            )}
            {reference.status === 'PARSED' && openTask?.type === 'REVIEW_REFERENCE' && (
              <ActionBtn label="审核通过参考素材（创建脚本）" onClick={() => action(approveReference)} />
            )}
            {script && script.status === 'DRAFT' && openTask?.type === 'REVIEW_SCRIPT' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                <GuestCheckboxes guests={guests} selectedIds={selectedGuestIds} onToggle={toggleGuest} />
                <ActionBtn label={`审核通过脚本 → 发送给达人（${selectedGuestIds.length} 人）`} onClick={() => action(approveScript)} />
              </div>
            )}
            {recordDone && !editTaskExists && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                <select
                  value={selectedEditorId}
                  onChange={e => setSelectedEditorId(e.target.value)}
                  style={{ padding: '9px 15px', fontSize: 20, border: '1px solid #2a2a2a', background: '#1a1a1a', color: '#f0f0f0', outline: 'none' }}
                >
                  <option value="">— 选择剪辑师 —</option>
                  {editors.map(ed => (
                    <option key={ed.id} value={ed.id}>{ed.display_name ?? ed.email ?? ed.id}</option>
                  ))}
                </select>
                <ActionBtn label="分配剪辑任务给剪辑师" onClick={() => action(createEditTask)} />
              </div>
            )}
            {editDone && !reviewFinalExists && (
              <ActionBtn label="创建成片审核任务" onClick={() => action(createReviewFinalCutTask)} />
            )}
            {openTask?.type === 'REVIEW_FINAL_CUT' && final && (
              <ActionBtn label="审核通过成片" onClick={() => action(approveFinalCut)} />
            )}
            {!openTask && tasks.length > 0 && script?.status === 'DONE' && (
              <p style={{ fontSize: 20, color: '#4ade80' }}>本次任务已完成。</p>
            )}
          </div>
          {actionMsg && <p style={{ fontSize: 20, color: '#4ade80', marginTop: 18 }}>{actionMsg}</p>}
        </Section>}
      </div>
    </div>
  )
}

function GuestCheckboxes({ guests, selectedIds, onToggle }: { guests: GuestProfile[]; selectedIds: string[]; onToggle: (id: string) => void }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
      {guests.map(g => {
        const checked = selectedIds.includes(g.id)
        return (
          <button
            key={g.id}
            type="button"
            onClick={() => onToggle(g.id)}
            style={{
              padding: '6px 15px', fontSize: 18, cursor: 'pointer',
              background: checked ? '#f0f0f0' : '#1a1a1a',
              color: checked ? '#111' : '#888',
              border: '1px solid #2a2a2a',
              fontWeight: checked ? 600 : 400,
            }}
          >
            {g.display_name ?? g.email ?? g.id}
          </button>
        )
      })}
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 48 }}>
      <h2 style={{ fontSize: 17, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 3, marginBottom: 18, color: '#444' }}>{title}</h2>
      {children}
    </div>
  )
}

function ActionBtn({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{ padding: '12px 24px', fontSize: 20, fontWeight: 600, background: '#f0f0f0', color: '#111', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
      {label}
    </button>
  )
}

function DeliverableRow({ label, d }: { label: string; d: Deliverable }) {
  const supabase = createClient()
  const [loadingUrl, setLoadingUrl] = useState(false)
  const [loadingDownload, setLoadingDownload] = useState(false)

  async function openSignedUrl() {
    if (!d.storage_path) return
    setLoadingUrl(true)
    const { data, error } = await supabase.storage
      .from('videos')
      .createSignedUrl(d.storage_path, 3600)
    setLoadingUrl(false)
    if (error || !data?.signedUrl) { alert('无法生成访问链接：' + (error?.message ?? '')); return }
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
  }

  async function downloadFile() {
    if (!d.storage_path) return
    setLoadingDownload(true)
    const { data, error } = await supabase.storage
      .from('videos')
      .createSignedUrl(d.storage_path, 3600)
    if (error || !data?.signedUrl) { setLoadingDownload(false); alert('无法生成下载链接：' + (error?.message ?? '')); return }
    const res = await fetch(data.signedUrl)
    const blob = await res.blob()
    setLoadingDownload(false)
    const blobUrl = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = blobUrl
    a.download = d.file_label ?? d.storage_path.split('/').pop() ?? 'video'
    a.click()
    URL.revokeObjectURL(blobUrl)
  }

  return (
    <div style={{ padding: '12px 0', borderBottom: '1px solid #1e1e1e', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
      <span style={{ fontSize: 18, fontWeight: 600, color: '#888' }}>{label}</span>
      <span style={{ fontSize: 20 }}>{d.file_label}</span>
      {d.storage_path ? (
        <>
          <button
            onClick={openSignedUrl}
            disabled={loadingUrl}
            style={{ fontSize: 18, padding: '4px 14px', background: '#1a1a1a', color: '#60a5fa', border: '1px solid #2a2a2a', cursor: loadingUrl ? 'wait' : 'pointer' }}
          >
            {loadingUrl ? '生成中…' : '查看'}
          </button>
          <button
            onClick={downloadFile}
            disabled={loadingDownload}
            style={{ fontSize: 18, padding: '4px 14px', background: '#1a1a1a', color: '#a3e635', border: '1px solid #2a2a2a', cursor: loadingDownload ? 'wait' : 'pointer' }}
          >
            {loadingDownload ? '生成中…' : '下载'}
          </button>
        </>
      ) : (
        <>
          <a href={d.baidu_share_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 20, color: '#60a5fa' }}>{d.baidu_share_url}</a>
          {d.baidu_extract_code && <span style={{ fontSize: 18, color: '#555' }}>Code: {d.baidu_extract_code}</span>}
        </>
      )}
    </div>
  )
}
