'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

// ─── Constants ───────────────────────────────────────────────────────────────

const SOURCE_TYPES = [
  { value: 'self_intro', label: '自我介绍' },
  { value: 'interview', label: '访谈记录' },
  { value: 'qa', label: '问答' },
  { value: 'case_study', label: '案例研究' },
  { value: 'update_patch', label: '更新补充' },
]

const SOURCE_CHIP_VARIANT: Record<string, string> = {
  self_intro: 'amber',
  interview: 'green',
  qa: 'blue',
  case_study: 'purple',
  update_patch: 'muted',
}

type Tab = 'overview' | 'kb' | 'persona' | 'studio'

// ─── Types ───────────────────────────────────────────────────────────────────

type KbEntry = { id: string; raw_text: string; source_type: string; consent: boolean; created_at: string }
type VersionRow = { id: string; version: number; note: string | null; created_at: string }
type ActivePersona = { profile_data: Record<string, unknown>; updated_at: string }

// ─── Helpers ─────────────────────────────────────────────────────────────────

function s(v: unknown): string { return v != null ? String(v) : '' }
function arr(v: unknown): string[] {
  if (!Array.isArray(v)) return []
  return v.filter(x => x != null).map(x => typeof x === 'string' ? x : JSON.stringify(x))
}
function formatDuration(secs: number): string {
  const m = Math.floor(secs / 60).toString().padStart(2, '0')
  const s = (secs % 60).toString().padStart(2, '0')
  return `${m}:${s}`
}

// ─── Chip ────────────────────────────────────────────────────────────────────

function Chip({ label, variant = 'default' }: { label: string; variant?: string }) {
  return <span className={`chip chip--${variant}`}>{label}</span>
}

// ─── SectionCard ─────────────────────────────────────────────────────────────

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="pcard">
      <div className="pcard-title">{title}</div>
      <div className="pcard-body">{children}</div>
    </div>
  )
}

// ─── StepperDot ──────────────────────────────────────────────────────────────

function StepperDot({ step, current }: { step: 1 | 2 | 3; current: 1 | 2 | 3 }) {
  const variant = step < current ? 'done' : step === current ? 'active' : 'idle'
  return (
    <span className={`stepper-dot stepper-dot--${variant}`}>
      {step < current ? '✓' : step}
    </span>
  )
}

// ─── SourceBadge ─────────────────────────────────────────────────────────────

function SourceBadge({ sourceType }: { sourceType: string }) {
  const label = SOURCE_TYPES.find(t => t.value === sourceType)?.label ?? sourceType
  const variant = SOURCE_CHIP_VARIANT[sourceType] ?? 'muted'
  return <Chip label={label} variant={variant} />
}

// ─── Icons ───────────────────────────────────────────────────────────────────

const OverviewIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
    <rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" />
  </svg>
)
const KBIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />
  </svg>
)
const PersonaIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="8" r="4" /><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
  </svg>
)
const StudioIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
  </svg>
)

// ─── MobileTabBar ─────────────────────────────────────────────────────────────

const TABS = [
  { id: 'overview' as Tab, label: '总览', Icon: OverviewIcon },
  { id: 'kb' as Tab, label: '知识库', Icon: KBIcon },
  { id: 'persona' as Tab, label: '画像', Icon: PersonaIcon },
  { id: 'studio' as Tab, label: '数据', Icon: StudioIcon },
]

function MobileTabBar({ activeTab, onTabChange }: { activeTab: Tab; onTabChange: (t: Tab) => void }) {
  return (
    <div className="mobile-tabbar">
      {TABS.map(({ id, label, Icon }) => (
        <button key={id} className={`mobile-tab${activeTab === id ? ' mobile-tab--active' : ''}`} onClick={() => onTabChange(id)}>
          <Icon />
          <span>{label}</span>
        </button>
      ))}
    </div>
  )
}

// ─── DeleteConfirmModal ───────────────────────────────────────────────────────

function DeleteConfirmModal({ open, onConfirm, onCancel, deleting }: {
  open: boolean
  onConfirm: () => void
  onCancel: () => void
  deleting: boolean
}) {
  if (!open) return null
  return (
    <>
      <div className="modal-backdrop" onClick={onCancel} />
      <div className="modal">
        <div className="modal-title">确认删除</div>
        <p className="modal-body">删除后无法恢复。该条目将从知识库中永久移除。</p>
        <div className="modal-actions">
          <button className="btn-ghost" onClick={onCancel} disabled={deleting}>取消</button>
          <button className="btn-danger" onClick={onConfirm} disabled={deleting}>
            {deleting ? '删除中…' : '确认删除'}
          </button>
        </div>
      </div>
    </>
  )
}

// ─── VersionDrawer ────────────────────────────────────────────────────────────

function VersionDrawer({
  open, versions, currentVersion, rollingBack, genMsg, onClose, onRollback,
}: {
  open: boolean
  versions: VersionRow[]
  currentVersion: number | null
  rollingBack: number | null
  genMsg: { ok: boolean; text: string } | null
  onClose: () => void
  onRollback: (v: number) => void
}) {
  useEffect(() => {
    if (open) { document.body.style.overflow = 'hidden' }
    else { document.body.style.overflow = '' }
    return () => { document.body.style.overflow = '' }
  }, [open])

  return (
    <>
      <div className={`drawer-backdrop${open ? ' drawer-backdrop--open' : ''}`} onClick={onClose} />
      <div className={`drawer${open ? ' drawer--open' : ''}`}>
        <div className="drawer-header">
          <span className="drawer-title">版本历史</span>
          <button className="btn-ghost drawer-close" onClick={onClose}>×</button>
        </div>
        <div className="drawer-body">
          {genMsg && (
            <p className={genMsg.ok ? 'msg-ok' : 'msg-err'} style={{ marginBottom: 16 }}>{genMsg.text}</p>
          )}
          {versions.length === 0 && <p className="empty-text">暂无版本记录</p>}
          {versions.map(v => (
            <div key={v.id} className={`version-item${v.version === currentVersion ? ' version-item--current' : ''}`}>
              <div className="version-info">
                <span className="version-num">v{v.version}</span>
                <span className="version-date">
                  {new Date(v.created_at).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                </span>
                {v.note && <span className="version-note">{v.note}</span>}
              </div>
              {v.version === currentVersion
                ? <span className="version-current-badge">当前</span>
                : (
                  <button className="btn-ghost" style={{ padding: '4px 12px', fontSize: 12 }}
                    onClick={() => onRollback(v.version)} disabled={rollingBack === v.version}>
                    {rollingBack === v.version ? '…' : '回滚'}
                  </button>
                )
              }
            </div>
          ))}
        </div>
      </div>
    </>
  )
}

// ─── OverviewTab ──────────────────────────────────────────────────────────────

function OverviewTab({
  persona, kbEntries, versions, advisory, generating, genMsg, onRegenerate, onOpenVersionDrawer, onGoToKB,
}: {
  persona: ActivePersona | null
  kbEntries: KbEntry[]
  versions: VersionRow[]
  advisory: string | null
  generating: boolean
  genMsg: { ok: boolean; text: string } | null
  onRegenerate: () => void
  onOpenVersionDrawer: () => void
  onGoToKB: () => void
}) {
  const currentVersion = versions[0]?.version ?? null
  const lastUpdated = persona?.updated_at
    ? new Date(persona.updated_at).toLocaleDateString('zh-CN')
    : '—'

  return (
    <div>
      <button className="btn-primary" style={{ marginBottom: 16, padding: '14px 20px', textAlign: 'left', fontSize: 14, display: 'flex', alignItems: 'center', gap: 10 }} onClick={onGoToKB}>
        <span style={{ fontSize: 18, lineHeight: 1 }}>+</span>
        <span>添加知识库内容</span>
      </button>

      {/* Stats */}
      <div className="stats-row">
        <div className="stat-tile">
          <div className="stat-tile-value">{kbEntries.length}</div>
          <div className="stat-tile-label">知识库条目</div>
        </div>
        <div className="stat-tile">
          <div className="stat-tile-value">{currentVersion !== null ? `v${currentVersion}` : '—'}</div>
          <div className="stat-tile-label">当前版本</div>
        </div>
        <div className="stat-tile">
          <div className="stat-tile-value" style={{ fontSize: 14, marginTop: 4 }}>{lastUpdated}</div>
          <div className="stat-tile-label">最近更新</div>
        </div>
      </div>

      {/* Advisory */}
      {advisory && (
        <div className="advisory-card">
          <h3 className="advisory-title">社媒视频创作建议</h3>
          <p className="advisory-body">{advisory}</p>
        </div>
      )}

      {/* CTA */}
      {genMsg && <p className={genMsg.ok ? 'msg-ok' : 'msg-err'} style={{ marginBottom: 12 }}>{genMsg.text}</p>}

      {!persona ? (
        <div className="cta-card">
          <p style={{ fontSize: 14, color: 'var(--text-muted)', marginBottom: 16 }}>
            先提交至少 1 条内容（≥ 200 字符）到知识库，再生成你的画像。
          </p>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn-primary" style={{ flex: 1 }} onClick={onGoToKB}>前往知识库</button>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn-primary" style={{ flex: 1 }} onClick={onRegenerate} disabled={generating}>
            {generating ? '生成中…' : '更新画像'}
          </button>
          <button className="btn-ghost" onClick={onOpenVersionDrawer}>版本历史</button>
        </div>
      )}
    </div>
  )
}

// ─── KBTab ────────────────────────────────────────────────────────────────────

function KBTab({
  kbEntries, kbFlowOpen, kbStep, sourceType, rawText, audioFile, transcribing, audioError,
  consent, kbSubmitting, kbMsg, expandedKbId, audioInputRef,
  recording, recordedBlob, recordDuration,
  onOpenFlow, onCloseFlow, onSetStep, onSetSourceType, onSetRawText,
  onSetConsent, onFileChange, onTranscribe, onSubmit, onToggleExpand,
  onStartRecording, onStopRecording, onClearRecording, onDeleteEntry,
}: {
  kbEntries: KbEntry[]
  kbFlowOpen: boolean
  kbStep: 1 | 2 | 3
  sourceType: string
  rawText: string
  audioFile: File | null
  transcribing: boolean
  audioError: string | null
  consent: boolean
  kbSubmitting: boolean
  kbMsg: { ok: boolean; text: string } | null
  expandedKbId: string | null
  audioInputRef: React.RefObject<HTMLInputElement | null>
  recording: boolean
  recordedBlob: Blob | null
  recordDuration: number
  onOpenFlow: () => void
  onCloseFlow: () => void
  onSetStep: (s: 1 | 2 | 3) => void
  onSetSourceType: (v: string) => void
  onSetRawText: (v: string) => void
  onSetConsent: (v: boolean) => void
  onFileChange: (f: File | null) => void
  onTranscribe: () => void
  onSubmit: (e: React.FormEvent) => void
  onToggleExpand: (id: string) => void
  onStartRecording: () => void
  onStopRecording: () => void
  onClearRecording: () => void
  onDeleteEntry: (id: string) => void
}) {
  return (
    <div>
      <div className="kb-tab-header">
        <h2 className="section-title" style={{ margin: 0 }}>
          知识库 <span className="section-count">({kbEntries.length})</span>
        </h2>
        {!kbFlowOpen && (
          <button className="btn-primary" style={{ padding: '8px 20px', width: 'auto' }} onClick={onOpenFlow}>
            + 添加内容
          </button>
        )}
      </div>

      {/* 3-step flow */}
      {kbFlowOpen && (
        <div className="kb-flow">
          {/* Stepper header */}
          <div className="kb-flow-header">
            <div className="stepper">
              <StepperDot step={1} current={kbStep} />
              <div className="stepper-line" />
              <StepperDot step={2} current={kbStep} />
              <div className="stepper-line" />
              <StepperDot step={3} current={kbStep} />
            </div>
            <span style={{ fontSize: 12, color: 'var(--text)', marginLeft: 12, fontWeight: 500 }}>
              {kbStep === 1 ? '选择类型' : kbStep === 2 ? '输入内容' : '确认提交'}
            </span>
          </div>

          {/* Step 1: Source type */}
          {kbStep === 1 && (
            <div className="kb-flow-body">
              <p style={{ fontSize: 13, color: 'var(--text)', marginBottom: 14 }}>这条内容属于哪种类型？</p>
              <div className="source-type-grid">
                {SOURCE_TYPES.map(st => (
                  <button key={st.value}
                    className={`source-type-card${sourceType === st.value ? ' source-type-card--selected' : ''}`}
                    onClick={() => onSetSourceType(st.value)}>
                    <SourceBadge sourceType={st.value} />
                    <div className="source-type-label">{st.label}</div>
                  </button>
                ))}
              </div>
              <div className="kb-flow-footer">
                <button className="btn-ghost" onClick={onCloseFlow}>取消</button>
                <button className="btn-primary" style={{ width: 'auto', padding: '8px 24px' }} onClick={() => onSetStep(2)}>下一步 →</button>
              </div>
            </div>
          )}

          {/* Step 2: Content input */}
          {kbStep === 2 && (
            <div className="kb-flow-body">
              <div className="audio-options">
                {/* Card A: Upload */}
                <div className="audio-option-card">
                  <div className="audio-option-label">📁 上传音频文件</div>
                  <input ref={audioInputRef} type="file" accept="audio/*" style={{ display: 'none' }}
                    onChange={e => { onFileChange(e.target.files?.[0] ?? null) }} />
                  <button type="button" className="btn-ghost" style={{ width: '100%' }}
                    onClick={() => audioInputRef.current?.click()}>
                    {audioFile && !recordedBlob ? audioFile.name : '选择文件'}
                  </button>
                  {audioFile && !recordedBlob && (
                    <button type="button" className="btn-ghost btn-ghost--green"
                      style={{ width: '100%', marginTop: 8 }}
                      onClick={onTranscribe} disabled={transcribing}>
                      {transcribing ? '转录中…' : '转录为文字'}
                    </button>
                  )}
                </div>
                {/* Card B: Record */}
                <div className="audio-option-card">
                  <div className="audio-option-label">🎙 录制音频</div>
                  {!recording && !recordedBlob && (
                    <button type="button" className="btn-ghost" style={{ width: '100%' }}
                      onClick={onStartRecording}>
                      开始录制
                    </button>
                  )}
                  {recording && (
                    <>
                      <div className="record-indicator">
                        <span className="record-dot" />
                        <span className="record-timer">{formatDuration(recordDuration)}</span>
                      </div>
                      <button type="button" className="btn-ghost"
                        style={{ width: '100%', borderColor: 'var(--red)', color: 'var(--red)' }}
                        onClick={onStopRecording}>
                        停止录制
                      </button>
                    </>
                  )}
                  {!recording && recordedBlob && (
                    <>
                      <p style={{ fontSize: 12, color: 'var(--green)', marginBottom: 8 }}>
                        ✓ 已录制 {formatDuration(recordDuration)}
                      </p>
                      <button type="button" className="btn-ghost btn-ghost--green"
                        style={{ width: '100%', marginBottom: 6 }}
                        onClick={onTranscribe} disabled={transcribing}>
                        {transcribing ? '转录中…' : '转录为文字'}
                      </button>
                      <button type="button" className="btn-ghost"
                        style={{ width: '100%', fontSize: 11 }}
                        onClick={onClearRecording}>
                        重新录制
                      </button>
                    </>
                  )}
                </div>
              </div>
              {audioError && <p className="msg-err" style={{ marginBottom: 10 }}>{audioError}</p>}
              <div className="textarea-wrap">
                <textarea
                  className={`main-textarea${rawText.trim().length > 0 && rawText.trim().length < 200 ? ' main-textarea--warn' : ''}`}
                  value={rawText} onChange={e => onSetRawText(e.target.value)}
                  placeholder="粘贴或输入内容……（至少 200 字符）" rows={8} />
                <span className={`char-count${rawText.trim().length >= 200 ? ' char-count--ok' : ''}`}>
                  {rawText.trim().length} / 200
                </span>
              </div>
              <div className="kb-flow-footer">
                <button className="btn-ghost" onClick={() => onSetStep(1)}>← 上一步</button>
                <button className="btn-primary" style={{ width: 'auto', padding: '8px 24px' }}
                  disabled={rawText.trim().length < 200} onClick={() => onSetStep(3)}>
                  下一步 →
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Consent & submit */}
          {kbStep === 3 && (
            <form className="kb-flow-body" onSubmit={onSubmit}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 16 }}>
                <SourceBadge sourceType={sourceType} />
                <span className="chip chip--default">{rawText.trim().length} 字符</span>
              </div>
              <label className="consent-label">
                <input type="checkbox" className="consent-checkbox" checked={consent}
                  onChange={e => onSetConsent(e.target.checked)} />
                允许将此内容用于生成画像
              </label>
              {kbMsg && <p className={kbMsg.ok ? 'msg-ok' : 'msg-err'} style={{ margin: '12px 0' }}>{kbMsg.text}</p>}
              <div className="kb-flow-footer">
                <button type="button" className="btn-ghost" onClick={() => onSetStep(2)}>← 上一步</button>
                <button type="submit" className="btn-primary" style={{ width: 'auto', padding: '8px 24px' }}
                  disabled={kbSubmitting || !consent}>
                  {kbSubmitting ? '处理中…' : '提交入库'}
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {/* KB entries list */}
      {kbEntries.length === 0 ? (
        <p className="empty-text">暂无内容。点击「添加内容」开始构建你的知识库。</p>
      ) : (
        <div className="kb-list">
          {kbEntries.map(entry => {
            const expanded = expandedKbId === entry.id
            return (
              <div key={entry.id} className="kb-entry-row" onClick={() => onToggleExpand(entry.id)}>
                <div className="kb-entry-header">
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <SourceBadge sourceType={entry.source_type} />
                    <span className="kb-date">{new Date(entry.created_at).toLocaleDateString('zh-CN')}</span>
                    <span className={`chip${entry.consent ? ' chip--green' : ' chip--muted'}`}>
                      {entry.consent ? '✓ 可用' : '仅存档'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>{expanded ? '▲' : '▼'}</span>
                    <button className="btn-delete" onClick={e => { e.stopPropagation(); onDeleteEntry(entry.id) }}>
                      ✕
                    </button>
                  </div>
                </div>
                {expanded
                  ? <p className="kb-entry-full">{entry.raw_text}</p>
                  : <p className="kb-entry-preview">{entry.raw_text}</p>
                }
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── PersonaTab ───────────────────────────────────────────────────────────────

function PersonaTab({
  persona, versions, generating, genMsg, onRegenerate, onOpenVersionDrawer,
}: {
  persona: ActivePersona | null
  versions: VersionRow[]
  generating: boolean
  genMsg: { ok: boolean; text: string } | null
  onRegenerate: () => void
  onOpenVersionDrawer: () => void
}) {
  const currentVersion = versions[0]?.version ?? null

  if (!persona) {
    return (
      <div>
        <p className="empty-text">尚未生成画像。请先在「知识库」提交至少 1 条允许使用的内容（≥ 200 字符），然后前往「总览」点击「更新画像」。</p>
      </div>
    )
  }

  const pd = persona.profile_data as any
  const identity = pd?.identity ?? {}
  const voice = pd?.voice_style ?? {}
  const expr = pd?.expression_habits ?? {}
  const logic = pd?.reasoning_logic ?? {}
  const bestEntry = pd?.best_entry_point ?? {}
  const contentDir = pd?.content_directions ?? {}
  const audience = pd?.target_audience ?? {}
  const positioning = pd?.content_positioning ?? {}
  const taboo = pd?.taboo_expressions ?? {}
  const titleStyle = pd?.title_style ?? {}
  const openingStyle = pd?.opening_style ?? {}

  return (
    <div>
      {/* Header */}
      <div className="persona-tab-header">
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {currentVersion !== null && (
            <span className="persona-version-badge">v{currentVersion}</span>
          )}
          <button className="btn-ghost" style={{ fontSize: 12, padding: '4px 12px' }} onClick={onOpenVersionDrawer}>
            版本历史
          </button>
        </div>
        <button className="btn-ghost" onClick={onRegenerate} disabled={generating}>
          {generating ? '生成中…' : '重新生成'}
        </button>
      </div>

      {genMsg && <p className={genMsg.ok ? 'msg-ok' : 'msg-err'} style={{ marginBottom: 16 }}>{genMsg.text}</p>}

      {/* Card 1: 身份定位 */}
      <SectionCard title="身份定位">
        {s(identity.name) && (
          <div style={{ fontFamily: 'var(--serif)', fontSize: 22, color: 'var(--text)', marginBottom: 4 }}>{s(identity.name)}{s(identity.short_name) ? ` · ${s(identity.short_name)}` : ''}</div>
        )}
        {s(identity.current_role) && (
          <div style={{ fontSize: 13, color: 'var(--text-dim)', marginBottom: 12 }}>{s(identity.current_role)}{s(identity.industry) ? ` · ${s(identity.industry)}` : ''}{s(identity.region) ? ` · ${s(identity.region)}` : ''}</div>
        )}
        {s(identity.main_business) && (
          <div className="pcard-field">
            <div className="pcard-field-label">主营业务</div>
            <div className="pcard-field-value">{s(identity.main_business)}</div>
          </div>
        )}
        {s(identity.realistic_position) && (
          <div className="pcard-field">
            <div className="pcard-field-label">真实定位</div>
            <div className="pcard-field-value">{s(identity.realistic_position)}</div>
          </div>
        )}
        {arr(pd?.persona_tags).length > 0 && (
          <div className="pcard-field">
            <div className="pcard-field-label">人设标签</div>
            <div className="pcard-chips">
              {arr(pd?.persona_tags).map((t, i) => <Chip key={i} label={t} variant="amber" />)}
            </div>
          </div>
        )}
      </SectionCard>

      {/* Card 2: 关键经历 */}
      {arr(pd?.key_experiences).length > 0 && (
        <SectionCard title="关键经历">
          <ul style={{ paddingLeft: 16, margin: 0, color: 'var(--text-muted)', fontSize: 13 }}>
            {arr(pd?.key_experiences).map((e, i) => <li key={i} style={{ marginBottom: 6 }}>{e}</li>)}
          </ul>
        </SectionCard>
      )}

      {/* Card 3: 最佳切入点 */}
      <SectionCard title="最佳切入点">
        {s(bestEntry.primary_entry) && (
          <div className="pcard-field">
            <div className="pcard-field-label">主切入点</div>
            <div className="pcard-field-value" style={{ color: 'var(--amber)' }}>{s(bestEntry.primary_entry)}</div>
          </div>
        )}
        {s(bestEntry.reason) && (
          <div className="pcard-field">
            <div className="pcard-field-label">原因</div>
            <div className="pcard-field-value">{s(bestEntry.reason)}</div>
          </div>
        )}
        {s(bestEntry.target_audience) && (
          <div className="pcard-field">
            <div className="pcard-field-label">面向人群</div>
            <div className="pcard-field-value">{s(bestEntry.target_audience)}</div>
          </div>
        )}
        {arr(bestEntry.avoid_entries).length > 0 && (
          <div className="pcard-field">
            <div className="pcard-field-label">避免切入</div>
            <div className="pcard-chips">
              {arr(bestEntry.avoid_entries).map((a, i) => <Chip key={i} label={a} variant="red" />)}
            </div>
          </div>
        )}
      </SectionCard>

      {/* Card 4: 内容方向 */}
      <SectionCard title="内容方向">
        {arr(contentDir.primary).length > 0 && (
          <div className="pcard-field">
            <div className="pcard-field-label">主方向</div>
            <div className="pcard-chips">
              {arr(contentDir.primary).map((t, i) => <Chip key={i} label={t} variant="green" />)}
            </div>
          </div>
        )}
        {arr(contentDir.secondary).length > 0 && (
          <div className="pcard-field">
            <div className="pcard-field-label">辅方向</div>
            <div className="pcard-chips">
              {arr(contentDir.secondary).map((t, i) => <Chip key={i} label={t} variant="default" />)}
            </div>
          </div>
        )}
        {arr(contentDir.avoid).length > 0 && (
          <div className="pcard-field">
            <div className="pcard-field-label">不做方向</div>
            <div className="pcard-chips">
              {arr(contentDir.avoid).map((t, i) => <Chip key={i} label={t} variant="red" />)}
            </div>
          </div>
        )}
        {(arr(positioning.types).length > 0 || s(positioning.orientation)) && (
          <div className="pcard-field">
            <div className="pcard-field-label">内容定位</div>
            {arr(positioning.types).length > 0 && (
              <div className="pcard-chips" style={{ marginBottom: 6 }}>
                {arr(positioning.types).map((t, i) => <Chip key={i} label={t} variant="muted" />)}
              </div>
            )}
            {s(positioning.orientation) && <div className="pcard-field-value">{s(positioning.orientation)}</div>}
          </div>
        )}
      </SectionCard>

      {/* Card 5: 目标受众 */}
      <SectionCard title="目标受众">
        {arr(audience.core_groups).length > 0 && (
          <div className="pcard-field">
            <div className="pcard-field-label">核心人群</div>
            <div className="pcard-chips">
              {arr(audience.core_groups).map((g, i) => <Chip key={i} label={g} variant="blue" />)}
            </div>
          </div>
        )}
        {s(audience.stage) && (
          <div className="pcard-field">
            <div className="pcard-field-label">受众阶段</div>
            <div className="pcard-field-value">{s(audience.stage)}</div>
          </div>
        )}
        {s(audience.typical_state) && (
          <div className="pcard-field">
            <div className="pcard-field-label">典型状态</div>
            <div className="pcard-field-value">{s(audience.typical_state)}</div>
          </div>
        )}
        {s(audience.main_anxiety) && (
          <div className="pcard-field">
            <div className="pcard-field-label">核心焦虑</div>
            <div className="pcard-field-value" style={{ color: 'var(--amber)' }}>{s(audience.main_anxiety)}</div>
          </div>
        )}
        {s(audience.desired_outcome) && (
          <div className="pcard-field">
            <div className="pcard-field-label">期望结果</div>
            <div className="pcard-field-value">{s(audience.desired_outcome)}</div>
          </div>
        )}
        {arr(audience.trigger_questions).length > 0 && (
          <div className="pcard-field">
            <div className="pcard-field-label">触发问题</div>
            <ul style={{ paddingLeft: 16, margin: '4px 0', color: 'var(--text-muted)', fontSize: 13 }}>
              {arr(audience.trigger_questions).map((q, i) => <li key={i} style={{ marginBottom: 4 }}>{q}</li>)}
            </ul>
          </div>
        )}
        {arr(pd?.audience_pain_points).length > 0 && (
          <div className="pcard-field">
            <div className="pcard-field-label">痛点列表</div>
            <div className="pcard-chips">
              {arr(pd?.audience_pain_points).map((p, i) => <Chip key={i} label={p} variant="muted" />)}
            </div>
          </div>
        )}
      </SectionCard>

      {/* Card 6: 声音风格 */}
      <SectionCard title="声音风格">
        {s(voice.tone) && (
          <div className="pcard-field">
            <div className="pcard-field-label">语气调性</div>
            <div className="pcard-field-value">{s(voice.tone)}</div>
          </div>
        )}
        {s(voice.pace) && (
          <div className="pcard-field">
            <div className="pcard-field-label">节奏感</div>
            <div className="pcard-field-value">{s(voice.pace)}</div>
          </div>
        )}
        {s(voice.pressure_level) && (
          <div className="pcard-field">
            <div className="pcard-field-label">压迫感</div>
            <div className="pcard-field-value">{s(voice.pressure_level)}</div>
          </div>
        )}
        {s(voice.warmth_level) && (
          <div className="pcard-field">
            <div className="pcard-field-label">亲和力</div>
            <div className="pcard-field-value">{s(voice.warmth_level)}</div>
          </div>
        )}
        {s(voice.expertise_life_ratio) && (
          <div className="pcard-field">
            <div className="pcard-field-label">专业/生活比</div>
            <div className="pcard-field-value">{s(voice.expertise_life_ratio)}</div>
          </div>
        )}
      </SectionCard>

      {/* Card 7: 表达习惯 */}
      <SectionCard title="表达习惯">
        {s(expr.structure_preference) && (
          <div className="pcard-field">
            <div className="pcard-field-label">结构偏好</div>
            <div className="pcard-field-value">{s(expr.structure_preference)}</div>
          </div>
        )}
        {s(expr.sentence_style) && (
          <div className="pcard-field">
            <div className="pcard-field-label">句式风格</div>
            <div className="pcard-field-value">{s(expr.sentence_style)}</div>
          </div>
        )}
        {s(expr.use_examples) && (
          <div className="pcard-field">
            <div className="pcard-field-label">举例方式</div>
            <div className="pcard-field-value">{s(expr.use_examples)}</div>
          </div>
        )}
        {s(expr.personal_observations) && (
          <div className="pcard-field">
            <div className="pcard-field-label">个人观察</div>
            <div className="pcard-field-value">{s(expr.personal_observations)}</div>
          </div>
        )}
        {s(expr.sharp_expression) && (
          <div className="pcard-field">
            <div className="pcard-field-label">犀利表达</div>
            <div className="pcard-field-value" style={{ color: 'var(--amber)' }}>{s(expr.sharp_expression)}</div>
          </div>
        )}
        {s(expr.signature_style) && (
          <div className="pcard-field">
            <div className="pcard-field-label">标志风格</div>
            <div className="pcard-field-value">{s(expr.signature_style)}</div>
          </div>
        )}
      </SectionCard>

      {/* Card 8: 推理逻辑 */}
      {(s(logic.risk_vs_opportunity) || s(logic.audience_stage_vs_method) || s(logic.long_term_vs_immediate) || s(logic.real_life_vs_rules)) && (
        <SectionCard title="推理逻辑">
          {s(logic.risk_vs_opportunity) && (
            <div className="pcard-field">
              <div className="pcard-field-label">风险 vs 机会</div>
              <div className="pcard-field-value">{s(logic.risk_vs_opportunity)}</div>
            </div>
          )}
          {s(logic.audience_stage_vs_method) && (
            <div className="pcard-field">
              <div className="pcard-field-label">受众阶段 vs 方法</div>
              <div className="pcard-field-value">{s(logic.audience_stage_vs_method)}</div>
            </div>
          )}
          {s(logic.long_term_vs_immediate) && (
            <div className="pcard-field">
              <div className="pcard-field-label">长期 vs 短期</div>
              <div className="pcard-field-value">{s(logic.long_term_vs_immediate)}</div>
            </div>
          )}
          {s(logic.real_life_vs_rules) && (
            <div className="pcard-field">
              <div className="pcard-field-label">实操 vs 规则</div>
              <div className="pcard-field-value">{s(logic.real_life_vs_rules)}</div>
            </div>
          )}
        </SectionCard>
      )}

      {/* Card 9: 高频场景 & 案例方向 */}
      {(arr(pd?.high_freq_scenes).length > 0 || arr(pd?.case_directions).length > 0) && (
        <SectionCard title="场景与案例">
          {arr(pd?.high_freq_scenes).length > 0 && (
            <div className="pcard-field">
              <div className="pcard-field-label">高频场景</div>
              <div className="pcard-chips">
                {arr(pd?.high_freq_scenes).map((s2, i) => <Chip key={i} label={s2} variant="purple" />)}
              </div>
            </div>
          )}
          {arr(pd?.case_directions).length > 0 && (
            <div className="pcard-field">
              <div className="pcard-field-label">案例方向</div>
              <ul style={{ paddingLeft: 16, margin: '4px 0', color: 'var(--text-muted)', fontSize: 13 }}>
                {arr(pd?.case_directions).map((c, i) => <li key={i} style={{ marginBottom: 4 }}>{c}</li>)}
              </ul>
            </div>
          )}
        </SectionCard>
      )}

      {/* Card 10: 标题与开场 */}
      <SectionCard title="标题与开场">
        {arr(titleStyle.preferred).length > 0 && (
          <div className="pcard-field">
            <div className="pcard-field-label">偏好标题风格</div>
            <div className="pcard-chips">
              {arr(titleStyle.preferred).map((t, i) => <Chip key={i} label={t} variant="green" />)}
            </div>
          </div>
        )}
        {arr(titleStyle.avoid).length > 0 && (
          <div className="pcard-field">
            <div className="pcard-field-label">避免标题风格</div>
            <div className="pcard-chips">
              {arr(titleStyle.avoid).map((t, i) => <Chip key={i} label={t} variant="red" />)}
            </div>
          </div>
        )}
        {arr(titleStyle.effective_angles).length > 0 && (
          <div className="pcard-field">
            <div className="pcard-field-label">有效切角</div>
            <div className="pcard-chips">
              {arr(titleStyle.effective_angles).map((t, i) => <Chip key={i} label={t} variant="amber" />)}
            </div>
          </div>
        )}
        {s(openingStyle.preferred) && (
          <div className="pcard-field">
            <div className="pcard-field-label">开场偏好</div>
            <div className="pcard-field-value">{s(openingStyle.preferred)}</div>
          </div>
        )}
        {s(openingStyle.approach) && (
          <div className="pcard-field">
            <div className="pcard-field-label">开场方式</div>
            <div className="pcard-field-value">{s(openingStyle.approach)}</div>
          </div>
        )}
        {s(pd?.closing_style) && (
          <div className="pcard-field">
            <div className="pcard-field-label">结尾风格</div>
            <div className="pcard-field-value">{s(pd?.closing_style)}</div>
          </div>
        )}
      </SectionCard>

      {/* Card 11: 禁区与改写原则 */}
      <SectionCard title="禁区与改写原则">
        {arr(taboo.forbidden_phrases).length > 0 && (
          <div className="pcard-field">
            <div className="pcard-field-label">禁用词汇</div>
            <div className="pcard-chips">
              {arr(taboo.forbidden_phrases).map((p, i) => <Chip key={i} label={`× ${p}`} variant="red" />)}
            </div>
          </div>
        )}
        {arr(taboo.forbidden_tone).length > 0 && (
          <div className="pcard-field">
            <div className="pcard-field-label">禁用语气</div>
            <div className="pcard-chips">
              {arr(taboo.forbidden_tone).map((t, i) => <Chip key={i} label={t} variant="red" />)}
            </div>
          </div>
        )}
        {arr(taboo.forbidden_title_style).length > 0 && (
          <div className="pcard-field">
            <div className="pcard-field-label">禁用标题风格</div>
            <div className="pcard-chips">
              {arr(taboo.forbidden_title_style).map((t, i) => <Chip key={i} label={t} variant="muted" />)}
            </div>
          </div>
        )}
        {arr(taboo.persona_breaking_patterns).length > 0 && (
          <div className="pcard-field">
            <div className="pcard-field-label">破坏人设的模式</div>
            <div className="pcard-chips">
              {arr(taboo.persona_breaking_patterns).map((p, i) => <Chip key={i} label={p} variant="muted" />)}
            </div>
          </div>
        )}
        {arr(pd?.rewrite_principles).length > 0 && (
          <div className="pcard-field">
            <div className="pcard-field-label">改写原则</div>
            <ul style={{ paddingLeft: 16, margin: '4px 0', color: 'var(--text-muted)', fontSize: 13 }}>
              {arr(pd?.rewrite_principles).map((p, i) => <li key={i} style={{ marginBottom: 4 }}>{p}</li>)}
            </ul>
          </div>
        )}
      </SectionCard>
    </div>
  )
}

// ─── StudioTab ────────────────────────────────────────────────────────────────

function StudioTab() {
  const features = ['热门抓取', '选题推荐', '数据总结', '智能自我学习', '多平台发布']
  return (
    <div className="studio-placeholder">
      <div className="studio-title">数据分析</div>
      <div className="studio-sub">即将推出</div>
      <div className="studio-chips">
        {features.map(f => <Chip key={f} label={f} variant="muted" />)}
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function GuestPersonaPage() {
  const router = useRouter()
  const supabase = createClient()

  // Existing state
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState<string | null>(null)
  const [rawText, setRawText] = useState('')
  const [sourceType, setSourceType] = useState('self_intro')
  const [consent, setConsent] = useState(false)
  const [kbSubmitting, setKbSubmitting] = useState(false)
  const [kbMsg, setKbMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [audioFile, setAudioFile] = useState<File | null>(null)
  const [transcribing, setTranscribing] = useState(false)
  const [audioError, setAudioError] = useState<string | null>(null)
  const audioInputRef = useRef<HTMLInputElement>(null)
  const [recording, setRecording] = useState(false)
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null)
  const [recordDuration, setRecordDuration] = useState(0)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const recordChunksRef = useRef<Blob[]>([])
  const recordTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const [kbEntries, setKbEntries] = useState<KbEntry[]>([])
  const [activePersona, setActivePersona] = useState<ActivePersona | null>(null)
  const [versions, setVersions] = useState<VersionRow[]>([])
  const [generating, setGenerating] = useState(false)
  const [genMsg, setGenMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [advisory, setAdvisory] = useState<string | null>(null)
  const [rollingBack, setRollingBack] = useState<number | null>(null)

  // New layout state
  const [activeTab, setActiveTab] = useState<Tab>('overview')
  const [kbFlowOpen, setKbFlowOpen] = useState(false)
  const [kbStep, setKbStep] = useState<1 | 2 | 3>(1)
  const [versionDrawerOpen, setVersionDrawerOpen] = useState(false)
  const [expandedKbId, setExpandedKbId] = useState<string | null>(null)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  // ── Data loading ──────────────────────────────────────────────────────────

  const loadData = useCallback(async (uid: string) => {
    const [kbRes, personaRes, versionsRes] = await Promise.all([
      supabase.from('guest_kb_entries').select('id, raw_text, source_type, consent, created_at').eq('guest_id', uid).order('created_at', { ascending: false }).limit(50),
      supabase.from('guest_profiles').select('profile_data, advisory, updated_at').eq('guest_id', uid).maybeSingle(),
      supabase.from('guest_profile_versions').select('id, version, note, created_at').eq('guest_id', uid).order('version', { ascending: false }).limit(20),
    ])
    setKbEntries((kbRes.data ?? []) as KbEntry[])
    setActivePersona((personaRes.data as ActivePersona) ?? null)
    setAdvisory((personaRes.data as any)?.advisory ?? null)
    setVersions((versionsRes.data ?? []) as VersionRow[])
  }, [])

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace('/login'); return }
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
      if (!profile) { router.replace('/login'); return }
      if (profile.role !== 'guest') { router.replace('/'); return }
      setUserId(user.id)
      await loadData(user.id)
      setLoading(false)
    }
    init()
  }, [])

  // ── Handlers ──────────────────────────────────────────────────────────────

  function closeKbFlow() {
    setKbFlowOpen(false)
    setKbStep(1)
    setRawText('')
    setSourceType('self_intro')
    setConsent(false)
    setKbMsg(null)
    setAudioFile(null)
    setAudioError(null)
    if (audioInputRef.current) audioInputRef.current.value = ''
    setRecording(false)
    setRecordedBlob(null)
    setRecordDuration(0)
    if (recordTimerRef.current) { clearInterval(recordTimerRef.current); recordTimerRef.current = null }
    if (mediaRecorderRef.current?.state === 'recording') mediaRecorderRef.current.stop()
  }

  function openKbFlow() { setKbFlowOpen(true) }

  async function handleTranscribe() {
    if (!audioFile) return
    setTranscribing(true); setAudioError(null)
    const fd = new FormData(); fd.append('file', audioFile)
    const res = await fetch('/api/kb/transcribe', { method: 'POST', body: fd })
    let json: any = {}
    try { json = await res.json() } catch {}
    setTranscribing(false)
    if (res.status === 413) { setAudioError('音频文件过大，请上传小于 25MB 的文件'); return }
    if (!res.ok) { setAudioError(json.error ?? '转录失败'); return }
    setRawText(prev => prev ? prev + '\n\n' + json.text : json.text)
    setAudioFile(null)
    setRecordedBlob(null)
    setRecordDuration(0)
    if (audioInputRef.current) audioInputRef.current.value = ''
  }

  async function handleStartRecording() {
    setAudioError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mimeType = MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : MediaRecorder.isTypeSupported('audio/ogg')
        ? 'audio/ogg'
        : ''
      const mr = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
      mediaRecorderRef.current = mr
      recordChunksRef.current = []
      mr.ondataavailable = (e) => { if (e.data.size > 0) recordChunksRef.current.push(e.data) }
      mr.onstop = () => {
        stream.getTracks().forEach(t => t.stop())
        const blob = new Blob(recordChunksRef.current, { type: mr.mimeType || 'audio/webm' })
        const ext = (mr.mimeType || 'audio/webm').includes('ogg') ? 'ogg' : 'webm'
        const file = new File([blob], `recording.${ext}`, { type: blob.type })
        setRecordedBlob(blob)
        setAudioFile(file)
        setRecording(false)
      }
      mr.start()
      setRecording(true)
      setRecordDuration(0)
      recordTimerRef.current = setInterval(() => setRecordDuration(d => d + 1), 1000)
    } catch {
      setAudioError('无法访问麦克风，请检查浏览器权限')
    }
  }

  function handleStopRecording() {
    if (recordTimerRef.current) { clearInterval(recordTimerRef.current); recordTimerRef.current = null }
    mediaRecorderRef.current?.stop()
  }

  function handleClearRecording() {
    setRecordedBlob(null)
    setRecordDuration(0)
    setAudioFile(null)
    setAudioError(null)
    if (audioInputRef.current) audioInputRef.current.value = ''
  }

  async function handleDeleteKbEntry() {
    if (!deleteConfirmId || !userId) return
    setDeleting(true)
    const { error } = await supabase
      .from('guest_kb_entries')
      .delete()
      .eq('id', deleteConfirmId)
      .eq('guest_id', userId)
    if (error) alert('删除失败：' + error.message)
    setDeleteConfirmId(null)
    setDeleting(false)
    if (userId) await loadData(userId)
  }

  async function handleKbSubmit(e: React.FormEvent) {
    e.preventDefault(); setKbSubmitting(true); setKbMsg(null)
    const res = await fetch('/api/kb/ingest', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ raw_text: rawText, source_type: sourceType, consent }),
    })
    const json = await res.json()
    if (!res.ok) {
      setKbMsg({ ok: false, text: json.error ?? '提交失败' })
    } else {
      setKbMsg({ ok: true, text: `已拆分为 ${json.chunk_count} 个片段并入库` })
      if (userId) await loadData(userId)
      setTimeout(() => closeKbFlow(), 1500)
    }
    setKbSubmitting(false)
  }

  async function handleRegenerate() {
    setGenerating(true); setGenMsg(null)
    const res = await fetch('/api/persona/regenerate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) })
    const json = await res.json()
    if (!res.ok) {
      if (res.status === 429) { const mins = Math.ceil((json.retry_after_seconds ?? 600) / 60); setGenMsg({ ok: false, text: `生成过于频繁，请 ${mins} 分钟后再试` }) }
      else if (res.status === 409) { setGenMsg({ ok: false, text: json.error ?? '知识库条目不足' }) }
      else { setGenMsg({ ok: false, text: json.error ?? '生成失败' }) }
    } else {
      setGenMsg({ ok: true, text: `已生成 v${json.version}（使用 ${json.kb_entries_used} 条知识库）` })
      setAdvisory(json.advisory ?? null)
      if (userId) await loadData(userId)
    }
    setGenerating(false)
  }

  async function handleRollback(version: number) {
    setRollingBack(version); setGenMsg(null)
    const res = await fetch('/api/persona/rollback', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ version }) })
    const json = await res.json()
    if (!res.ok) { setGenMsg({ ok: false, text: json.error ?? '回滚失败' }) } else {
      setGenMsg({ ok: true, text: `已回滚至 v${json.rolled_back_to_version}` })
      if (userId) await loadData(userId)
    }
    setRollingBack(null)
  }

  function handleCloseVersionDrawer() {
    setVersionDrawerOpen(false)
    setGenMsg(null)
  }

  async function handleSignOut() { await supabase.auth.signOut(); router.replace('/login') }

  const currentVersion = versions[0]?.version ?? null

  // ── Loading ───────────────────────────────────────────────────────────────

  if (loading) return (
    <>
      <style>{css}</style>
      <div className="shell">
        <div className="loading-state">
          <span className="dot" /><span className="dot" style={{ animationDelay: '.15s' }} /><span className="dot" style={{ animationDelay: '.3s' }} />
        </div>
      </div>
    </>
  )

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      <style>{css}</style>
      <div className="shell">

        {/* Sticky header */}
        <header className="header">
          <div className="header-left">
            <div className="brand-mark">U</div>
            <div>
              <h1 className="brand-title">UMI</h1>
              <p className="brand-sub">创作者工作台</p>
            </div>
          </div>
          <nav className="header-nav">
            <button className="nav-btn" onClick={() => router.push('/guest/inbox')}>← 任务</button>
            <button className="nav-btn nav-btn--ghost" onClick={handleSignOut}>退出</button>
          </nav>
        </header>

        {/* Page body: sidebar + main + right panel */}
        <div className="page-body">

          {/* Left sidebar (desktop) */}
          <aside className="sidebar">
            <nav className="sidebar-nav">
              {TABS.map(({ id, label, Icon }) => (
                <button key={id}
                  className={`sidebar-nav-item${activeTab === id ? ' sidebar-nav-item--active' : ''}`}
                  onClick={() => setActiveTab(id)}>
                  <Icon />
                  <span>{label}</span>
                </button>
              ))}
            </nav>
            <div className="sidebar-stats">
              <div className="sidebar-stat">
                <strong>{kbEntries.length}</strong>
                知识库条目
              </div>
              <div className="sidebar-stat">
                <strong>{currentVersion !== null ? `v${currentVersion}` : '—'}</strong>
                当前版本
              </div>
            </div>
          </aside>

          {/* Main content */}
          <main className="content-main">
            <div className="tab-content">
              {activeTab === 'overview' && (
                <OverviewTab
                  persona={activePersona}
                  kbEntries={kbEntries}
                  versions={versions}
                  advisory={advisory}
                  generating={generating}
                  genMsg={genMsg}
                  onRegenerate={handleRegenerate}
                  onOpenVersionDrawer={() => setVersionDrawerOpen(true)}
                  onGoToKB={() => setActiveTab('kb')}
                />
              )}
              {activeTab === 'kb' && (
                <KBTab
                  kbEntries={kbEntries}
                  kbFlowOpen={kbFlowOpen}
                  kbStep={kbStep}
                  sourceType={sourceType}
                  rawText={rawText}
                  audioFile={audioFile}
                  transcribing={transcribing}
                  audioError={audioError}
                  consent={consent}
                  kbSubmitting={kbSubmitting}
                  kbMsg={kbMsg}
                  expandedKbId={expandedKbId}
                  audioInputRef={audioInputRef}
                  onOpenFlow={openKbFlow}
                  onCloseFlow={closeKbFlow}
                  onSetStep={setKbStep}
                  onSetSourceType={setSourceType}
                  onSetRawText={setRawText}
                  onSetConsent={setConsent}
                  onFileChange={(f) => { setAudioFile(f); setAudioError(null) }}
                  onTranscribe={handleTranscribe}
                  onSubmit={handleKbSubmit}
                  onToggleExpand={(id) => setExpandedKbId(prev => prev === id ? null : id)}
                  recording={recording}
                  recordedBlob={recordedBlob}
                  recordDuration={recordDuration}
                  onStartRecording={handleStartRecording}
                  onStopRecording={handleStopRecording}
                  onClearRecording={handleClearRecording}
                  onDeleteEntry={(id) => setDeleteConfirmId(id)}
                />
              )}
              {activeTab === 'persona' && (
                <PersonaTab
                  persona={activePersona}
                  versions={versions}
                  generating={generating}
                  genMsg={genMsg}
                  onRegenerate={handleRegenerate}
                  onOpenVersionDrawer={() => setVersionDrawerOpen(true)}
                />
              )}
              {activeTab === 'studio' && <StudioTab />}
            </div>
          </main>

          {/* Right panel (desktop) */}
          <aside className="right-panel">
            <div className="right-panel-section">
              <div className="right-panel-label">版本历史</div>
              {versions.slice(0, 4).map(v => (
                <div key={v.id} className={`version-item${v.version === currentVersion ? ' version-item--current' : ''}`}
                  style={{ fontSize: 12 }}>
                  <div className="version-info" style={{ gap: 8 }}>
                    <span className="version-num" style={{ fontSize: 13 }}>v{v.version}</span>
                    <span className="version-date">
                      {new Date(v.created_at).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  {v.version === currentVersion && <span className="version-current-badge">当前</span>}
                </div>
              ))}
              {versions.length > 4 && (
                <button className="btn-ghost" style={{ width: '100%', marginTop: 8, fontSize: 12 }}
                  onClick={() => setVersionDrawerOpen(true)}>
                  查看全部 ({versions.length})
                </button>
              )}
              {versions.length === 0 && <p style={{ fontSize: 12, color: 'var(--text-dim)' }}>暂无版本</p>}
            </div>
          </aside>
        </div>

        {/* Mobile tab bar */}
        <MobileTabBar activeTab={activeTab} onTabChange={setActiveTab} />

        {/* Delete confirm modal */}
        <DeleteConfirmModal
          open={deleteConfirmId !== null}
          onConfirm={handleDeleteKbEntry}
          onCancel={() => setDeleteConfirmId(null)}
          deleting={deleting}
        />

        {/* Version drawer */}
        <VersionDrawer
          open={versionDrawerOpen}
          versions={versions}
          currentVersion={currentVersion}
          rollingBack={rollingBack}
          genMsg={genMsg}
          onClose={handleCloseVersionDrawer}
          onRollback={handleRollback}
        />
      </div>
    </>
  )
}

// ─── CSS ─────────────────────────────────────────────────────────────────────

const css = `
  @import url('https://fonts.googleapis.com/css2?family=Noto+Serif+SC:wght@400;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap');
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  :root {
    --bg: #0c0c0c; --surface: #141414; --surface2: #1c1c1c;
    --border: #242424; --border2: #2e2e2e;
    --text: #e8e4dc; --text-muted: #a8a49c; --text-dim: #72706a;
    --amber: #e8a020; --amber-dim: #c4861a; --amber-glow: rgba(232,160,32,0.08);
    --green: #5a8a6a; --green-dim: rgba(90,138,106,.15); --red: #c0504a;
    --blue: #4a80c0; --purple: #9080c0;
    --mono: 'IBM Plex Mono', monospace; --serif: 'Noto Serif SC', serif;
    --header-h: 57px;
  }
  body { background: var(--bg); color: var(--text); }

  /* ── Shell & Layout ─────────────────────────────────── */
  .shell { min-height: 100vh; background: var(--bg); font-family: var(--mono); display: flex; flex-direction: column; }

  .loading-state { display:flex; align-items:center; justify-content:center; min-height:100vh; gap:6px; }
  .dot { width:6px; height:6px; border-radius:50%; background:var(--amber); animation:pulse 1s ease-in-out infinite; }
  @keyframes pulse { 0%,100%{opacity:.2;transform:scale(.8);} 50%{opacity:1;transform:scale(1);} }

  .header { display:flex; align-items:center; justify-content:space-between; padding:16px 20px; border-bottom:1px solid var(--border); position:sticky; top:0; background:rgba(12,12,12,.95); backdrop-filter:blur(8px); z-index:10; height:var(--header-h); }
  .header-left { display:flex; align-items:center; gap:12px; }
  .brand-mark { width:36px; height:36px; background:var(--amber); color:#000; font-family:var(--serif); font-size:18px; font-weight:700; display:flex; align-items:center; justify-content:center; flex-shrink:0; }
  .brand-title { font-family:var(--serif); font-size:18px; font-weight:700; letter-spacing:.05em; line-height:1; color:var(--text); }
  .brand-sub { font-size:10px; color:var(--text-muted); letter-spacing:.1em; margin-top:3px; }
  .header-nav { display:flex; align-items:center; gap:8px; }
  .nav-btn { display:flex; align-items:center; gap:6px; padding:7px 12px; font-family:var(--mono); font-size:12px; color:var(--text-muted); background:var(--surface); border:1px solid var(--border); cursor:pointer; transition:color .15s,border-color .15s; white-space:nowrap; }
  .nav-btn:hover { color:var(--text); border-color:var(--border2); }
  .nav-btn--ghost { background:none; border-color:transparent; }
  .nav-btn--ghost:hover { border-color:var(--border); }

  .page-body { display:flex; flex:1; }

  /* ── Sidebar ─────────────────────────────────────────── */
  .sidebar { width:220px; flex-shrink:0; border-right:1px solid var(--border); padding:20px 0; display:flex; flex-direction:column; position:sticky; top:var(--header-h); height:calc(100vh - var(--header-h)); overflow-y:auto; }
  .sidebar-nav { display:flex; flex-direction:column; gap:2px; padding:0 12px; }
  .sidebar-nav-item { display:flex; align-items:center; gap:10px; width:100%; padding:10px 14px; font-family:var(--mono); font-size:13px; color:var(--text-muted); background:none; border:none; border-radius:0; cursor:pointer; text-align:left; transition:color .15s,background .15s; }
  .sidebar-nav-item:hover { background:var(--surface); color:var(--text); }
  .sidebar-nav-item--active { background:var(--surface); color:var(--text); border-left:2px solid var(--amber); padding-left:12px; }
  .sidebar-stats { margin-top:auto; padding:20px 20px 0; border-top:1px solid var(--border); }
  .sidebar-stat { font-size:11px; color:var(--text-dim); margin-bottom:10px; }
  .sidebar-stat strong { display:block; font-size:15px; color:var(--text-muted); font-weight:600; margin-bottom:2px; }

  /* ── Main content ────────────────────────────────────── */
  .content-main { flex:1; min-width:0; padding:32px 28px; overflow-y:auto; }
  .tab-content { max-width:680px; margin:0 auto; }

  /* ── Right panel ─────────────────────────────────────── */
  .right-panel { width:260px; flex-shrink:0; border-left:1px solid var(--border); padding:24px 20px; position:sticky; top:var(--header-h); height:calc(100vh - var(--header-h)); overflow-y:auto; }
  .right-panel-section { margin-bottom:28px; }
  .right-panel-label { font-size:10px; font-weight:600; letter-spacing:.18em; text-transform:uppercase; color:var(--text-dim); margin-bottom:12px; }

  /* ── Overview ────────────────────────────────────────── */
  .welcome-card { padding:24px; border:1px solid var(--border); background:var(--surface); margin-bottom:16px; }
  .welcome-name { font-family:var(--serif); font-size:22px; font-weight:700; color:var(--text); margin-bottom:4px; }
  .welcome-sub { font-size:12px; color:var(--text-dim); }
  .stats-row { display:grid; grid-template-columns:repeat(3,1fr); gap:10px; margin-bottom:16px; }
  .stat-tile { padding:16px; border:1px solid var(--border); background:var(--surface2); }
  .stat-tile-value { font-size:22px; font-weight:600; color:var(--text); line-height:1; font-family:var(--mono); }
  .stat-tile-label { font-size:10px; color:var(--text-dim); margin-top:6px; letter-spacing:.06em; }
  .cta-card { padding:20px; border:1px solid var(--border2); background:var(--surface); }

  /* ── Advisory ────────────────────────────────────────── */
  .advisory-card { background:#0a1410; border:1px solid #1a3326; border-left:3px solid var(--green); padding:16px 18px; margin-bottom:16px; }
  .advisory-title { font-size:12px; font-weight:600; color:var(--green); margin-bottom:8px; letter-spacing:.04em; }
  .advisory-body { font-size:13px; color:#8ab09a; line-height:1.85; white-space:pre-wrap; }

  /* ── KB Tab ──────────────────────────────────────────── */
  .kb-tab-header { display:flex; justify-content:space-between; align-items:center; margin-bottom:20px; }
  .section-title { font-family:var(--serif); font-size:18px; font-weight:600; color:var(--text-muted); }
  .section-count { font-family:var(--mono); font-size:13px; color:var(--text-dim); font-weight:400; }

  /* ── KB Flow ─────────────────────────────────────────── */
  .kb-flow { border:1px solid var(--border); background:var(--surface); margin-bottom:24px; animation:slideDown .15s ease; }
  @keyframes slideDown { from{opacity:0;transform:translateY(-8px);} to{opacity:1;transform:translateY(0);} }
  .kb-flow-header { padding:14px 20px; border-bottom:1px solid var(--border); display:flex; align-items:center; }
  .stepper { display:flex; align-items:center; gap:6px; }
  .stepper-dot { width:24px; height:24px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:11px; font-weight:600; flex-shrink:0; }
  .stepper-dot--active { background:var(--amber); color:#000; }
  .stepper-dot--done { background:var(--green); color:#000; }
  .stepper-dot--idle { background:var(--surface2); color:var(--text-dim); border:1px solid var(--border); }
  .stepper-line { flex:1; height:1px; background:var(--border); max-width:28px; }
  .kb-flow-body { padding:20px; }
  .kb-flow-footer { padding:14px 20px; border-top:1px solid var(--border); display:flex; justify-content:space-between; align-items:center; }

  /* Step 1 source type grid */
  .source-type-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(120px,1fr)); gap:10px; margin-bottom:4px; }
  .source-type-card { padding:14px 10px; border:1px solid var(--border); background:var(--surface2); cursor:pointer; text-align:center; transition:border-color .15s,background .15s; display:flex; flex-direction:column; align-items:center; gap:8px; }
  .source-type-card:hover { border-color:var(--border2); }
  .source-type-card--selected { border-color:var(--amber); background:var(--amber-glow); }
  .source-type-label { font-size:12px; color:var(--text); }

  /* Step 2 audio options */
  .audio-options { display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:12px; }
  .audio-option-card { padding:14px; border:1px solid var(--border); background:var(--surface2); }
  .audio-option-label { font-size:10px; letter-spacing:.14em; text-transform:uppercase; color:var(--text-dim); margin-bottom:10px; }
  .record-indicator { display:flex; align-items:center; gap:8px; margin-bottom:10px; }
  .record-dot { width:8px; height:8px; border-radius:50%; background:var(--red); animation:recordPulse 1s ease infinite; flex-shrink:0; }
  @keyframes recordPulse { 0%,100%{opacity:1} 50%{opacity:.3} }
  .record-timer { font-family:var(--mono); font-size:18px; color:var(--text); font-weight:600; }

  /* Step 2 textarea */
  .audio-row { display:flex; gap:10px; align-items:center; flex-wrap:wrap; }
  .textarea-wrap { position:relative; }
  .main-textarea { width:100%; font-family:var(--mono); font-size:13px; padding:12px; padding-bottom:28px; background:var(--surface2); color:var(--text); border:1px solid var(--border); outline:none; resize:vertical; line-height:1.75; transition:border-color .15s; }
  .main-textarea:focus { border-color:var(--amber); }
  .main-textarea--warn { border-color:#5a2020; }
  .main-textarea::placeholder { color:var(--text-dim); }
  .char-count { position:absolute; bottom:7px; right:10px; font-size:11px; color:var(--text-dim); pointer-events:none; }
  .char-count--ok { color:var(--green); }

  /* Step 3 */
  .consent-label { display:flex; align-items:center; gap:10px; font-size:14px; cursor:pointer; color:var(--text); margin-bottom:4px; }
  .consent-checkbox { width:16px; height:16px; cursor:pointer; accent-color:var(--amber); }

  /* KB entries list */
  .kb-list { display:flex; flex-direction:column; }
  .kb-entry-row { padding:14px 0; border-bottom:1px solid var(--border); cursor:pointer; }
  .kb-entry-header { display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:6px; margin-bottom:8px; }
  .kb-date { font-size:12px; color:var(--text-dim); }
  .kb-entry-preview { font-size:13px; color:var(--text-muted); overflow:hidden; display:-webkit-box; -webkit-line-clamp:3; -webkit-box-orient:vertical; line-height:1.6; }
  .kb-entry-full { font-size:13px; color:var(--text-muted); white-space:pre-wrap; line-height:1.6; }

  /* ── Persona Tab ─────────────────────────────────────── */
  .persona-tab-header { display:flex; justify-content:space-between; align-items:center; margin-bottom:20px; flex-wrap:wrap; gap:10px; }
  .persona-version-badge { font-family:var(--mono); font-size:12px; padding:3px 10px; border:1px solid var(--border); color:var(--text-muted); }

  /* SectionCard */
  .pcard { border:1px solid var(--border); background:var(--surface); margin-bottom:14px; }
  .pcard-title { padding:12px 18px; border-bottom:1px solid var(--border); font-family:var(--serif); font-size:13px; font-weight:600; color:var(--text-muted); letter-spacing:.04em; }
  .pcard-body { padding:18px; }
  .pcard-field { margin-bottom:14px; }
  .pcard-field:last-child { margin-bottom:0; }
  .pcard-field-label { font-size:10px; letter-spacing:.14em; text-transform:uppercase; color:var(--text-dim); margin-bottom:6px; }
  .pcard-field-value { font-size:13px; color:var(--text-muted); line-height:1.7; }
  .pcard-chips { display:flex; flex-wrap:wrap; gap:6px; margin-top:4px; }
  .pcard-blockquote { border-left:2px solid var(--border2); padding:8px 14px; margin:6px 0; font-size:13px; color:var(--text-muted); font-style:italic; line-height:1.6; }
  .milestone-list { list-style:none; padding:0; margin-top:4px; }
  .milestone-item { display:flex; gap:12px; padding:8px 0; border-bottom:1px solid var(--border); align-items:flex-start; font-size:13px; color:var(--text-muted); line-height:1.5; }
  .milestone-item:last-child { border-bottom:none; }
  .milestone-dot { width:8px; height:8px; border-radius:50%; background:var(--border2); flex-shrink:0; margin-top:4px; }
  .case-item { padding:10px 12px; border:1px solid var(--border); background:var(--surface2); margin-bottom:8px; }
  .case-item:last-child { margin-bottom:0; }
  .case-title { font-size:13px; font-weight:600; color:var(--text-muted); margin-bottom:4px; }
  .case-context { font-size:12px; color:var(--text-dim); line-height:1.6; }

  /* ── Studio Tab ──────────────────────────────────────── */
  .studio-placeholder { padding:48px 24px; text-align:center; border:1px solid var(--border); background:var(--surface); }
  .studio-title { font-family:var(--serif); font-size:20px; color:var(--text-muted); margin-bottom:8px; }
  .studio-sub { font-size:12px; color:var(--text-dim); margin-bottom:24px; }
  .studio-chips { display:flex; flex-wrap:wrap; gap:8px; justify-content:center; }

  /* ── Chips ────────────────────────────────────────────── */
  .chip { display:inline-flex; align-items:center; font-family:var(--mono); font-size:11px; padding:3px 8px; border:1px solid; white-space:nowrap; }
  .chip--default { color:var(--text-muted); border-color:var(--border); background:var(--surface2); }
  .chip--amber { color:var(--amber); border-color:rgba(232,160,32,.3); background:var(--amber-glow); }
  .chip--green { color:var(--green); border-color:rgba(90,138,106,.3); background:var(--green-dim); }
  .chip--red { color:var(--red); border-color:rgba(192,80,74,.3); background:rgba(192,80,74,.08); }
  .chip--muted { color:var(--text-dim); border-color:var(--border); background:none; }
  .chip--blue { color:var(--blue); border-color:rgba(74,128,192,.3); background:rgba(74,128,192,.08); }
  .chip--purple { color:var(--purple); border-color:rgba(144,128,192,.3); background:rgba(144,128,192,.08); }

  /* ── Buttons ─────────────────────────────────────────── */
  .btn-ghost { padding:8px 16px; font-family:var(--mono); font-size:12px; font-weight:500; color:var(--text-muted); background:none; border:1px solid var(--border); cursor:pointer; transition:color .15s,border-color .15s; white-space:nowrap; }
  .btn-ghost:hover:not(:disabled) { color:var(--text); border-color:var(--border2); }
  .btn-ghost:disabled { opacity:.5; cursor:not-allowed; }
  .btn-ghost--green { color:var(--green); }
  .btn-ghost--green:hover:not(:disabled) { color:#6aaa7a; }
  .btn-primary { width:100%; padding:12px; font-family:var(--mono); font-size:13px; font-weight:600; color:#000; background:var(--amber); border:none; cursor:pointer; transition:background .15s,opacity .15s; }
  .btn-primary:hover:not(:disabled) { background:#f0ac30; }
  .btn-primary:disabled { opacity:.4; cursor:not-allowed; }

  /* ── Messages ────────────────────────────────────────── */
  .msg-ok { font-size:13px; color:var(--green); padding:8px 12px; border-left:2px solid var(--green); background:var(--green-dim); }
  .msg-err { font-size:13px; color:var(--red); padding:8px 12px; border-left:2px solid var(--red); background:rgba(192,80,74,.1); }
  .empty-text { font-size:13px; color:var(--text-dim); }

  /* ── Version items ───────────────────────────────────── */
  .version-item { display:flex; justify-content:space-between; align-items:center; padding:10px 0; border-bottom:1px solid var(--border); }
  .version-item:last-child { border-bottom:none; }
  .version-item--current { border-left:2px solid var(--amber); padding-left:10px; margin-left:-10px; }
  .version-info { display:flex; gap:10px; align-items:center; flex-wrap:wrap; }
  .version-num { font-size:13px; font-weight:600; color:var(--text-muted); min-width:28px; }
  .version-date { font-size:11px; color:var(--text-dim); }
  .version-note { font-size:11px; color:var(--text-dim); }
  .version-current-badge { font-size:11px; color:var(--amber); border:1px solid rgba(232,160,32,.3); padding:2px 8px; }

  /* ── Delete button ───────────────────────────────────── */
  .btn-delete { padding:2px 7px; font-family:var(--mono); font-size:11px; color:var(--text-dim); background:none; border:1px solid transparent; cursor:pointer; transition:color .15s,border-color .15s; line-height:1.4; }
  .btn-delete:hover { color:var(--red); border-color:rgba(192,80,74,.4); }

  /* ── Modal ───────────────────────────────────────────── */
  .modal-backdrop { position:fixed; inset:0; background:rgba(0,0,0,.7); z-index:50; }
  .modal { position:fixed; z-index:51; top:50%; left:50%; transform:translate(-50%,-50%); background:var(--surface); border:1px solid var(--border2); padding:28px; width:min(400px,90vw); }
  .modal-title { font-family:var(--serif); font-size:16px; color:var(--text); margin-bottom:12px; }
  .modal-body { font-size:13px; color:var(--text-muted); line-height:1.7; margin-bottom:24px; }
  .modal-actions { display:flex; justify-content:flex-end; gap:10px; }
  .btn-danger { padding:8px 20px; font-family:var(--mono); font-size:13px; font-weight:600; color:#fff; background:var(--red); border:none; cursor:pointer; transition:opacity .15s; }
  .btn-danger:hover:not(:disabled) { opacity:.85; }
  .btn-danger:disabled { opacity:.5; cursor:not-allowed; }

  /* ── Drawer ──────────────────────────────────────────── */
  .drawer-backdrop { position:fixed; inset:0; background:rgba(0,0,0,.6); z-index:40; opacity:0; pointer-events:none; transition:opacity .25s; }
  .drawer-backdrop--open { opacity:1; pointer-events:all; }
  .drawer { position:fixed; z-index:41; background:var(--surface); top:0; right:0; bottom:0; width:340px; border-left:1px solid var(--border); transform:translateX(100%); visibility:hidden; transition:transform .25s cubic-bezier(.4,0,.2,1), visibility 0s linear .25s; }
  .drawer--open { transform:translateX(0); visibility:visible; transition:transform .25s cubic-bezier(.4,0,.2,1), visibility 0s linear 0s; }
  .drawer-header { padding:20px; border-bottom:1px solid var(--border); display:flex; justify-content:space-between; align-items:center; }
  .drawer-title { font-family:var(--serif); font-size:15px; color:var(--text); }
  .drawer-close { padding:4px 12px; font-size:18px; line-height:1; }
  .drawer-body { padding:16px 20px; overflow-y:auto; height:calc(100% - 65px); }

  /* ── Mobile tab bar ──────────────────────────────────── */
  .mobile-tabbar { display:none; position:fixed; bottom:0; left:0; right:0; height:56px; background:rgba(12,12,12,.95); border-top:1px solid var(--border); z-index:30; backdrop-filter:blur(8px); }
  .mobile-tab { flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:3px; cursor:pointer; border:none; background:none; font-family:var(--mono); font-size:9px; color:var(--text-dim); padding:6px 0; border-top:2px solid transparent; transition:color .15s,border-color .15s; }
  .mobile-tab--active { color:var(--amber); border-top-color:var(--amber); }

  /* ── Responsive ──────────────────────────────────────── */
  @media (max-width:767px) {
    .sidebar { display:none; }
    .right-panel { display:none; }
    .audio-options { grid-template-columns:1fr; }
    .mobile-tabbar { display:flex; }
    .content-main { padding:20px 16px 72px; }
    .drawer { left:0; right:0; bottom:0; top:auto; width:100%; height:80vh; border-left:none; border-top:1px solid var(--border); transform:translateY(100%); }
    .drawer--open { transform:translateY(0); }
    .stats-row { grid-template-columns:repeat(3,1fr); }
    .source-type-grid { grid-template-columns:repeat(auto-fill,minmax(100px,1fr)); }
    .header { padding:12px 16px; }
    .brand-title { font-size:16px; }
    .nav-btn { font-size:11px; padding:6px 10px; }
  }
`
