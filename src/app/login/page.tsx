'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export const dynamic = 'force-dynamic'

const roleLabels: Record<'guest' | 'editor', string> = {
  guest: '达人',
  editor: '剪辑师',
}

export default function LoginPage() {
  const router = useRouter()
  const supabase = createClient()

  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<'guest' | 'editor'>('guest')
  const [displayName, setDisplayName] = useState('')
  const [error, setError] = useState('')
  const [successMsg, setSuccessMsg] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    if (mode === 'login') {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) {
        setError(error.message)
        setLoading(false)
        return
      }
      router.replace('/')
    } else {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { role, display_name: displayName.trim() || null } },
      })
      if (error) {
        setError(error.message)
        setLoading(false)
        return
      }
      setLoading(false)
      setSuccessMsg('注册成功')
      setMode('login')
    }
  }

  const inputStyle = { padding: '9px 12px', fontSize: 12, border: '1px solid #2a2a2a', outline: 'none', background: '#222', color: '#f0f0f0' }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#111' }}>
      <div style={{ width: 435, background: '#1a1a1a', padding: 48, border: '1px solid #2a2a2a' }}>
        <h1 style={{ fontSize: 21, fontWeight: 600, marginBottom: 24, color: '#f0f0f0' }}>UMI</h1>

        <div style={{ display: 'flex', marginBottom: 18, borderBottom: '1px solid #2a2a2a' }}>
          <button
            onClick={() => { setMode('login'); setError('') }}
            style={{
              flex: 1, padding: '9px 0', fontSize: 12, fontWeight: mode === 'login' ? 600 : 400,
              color: mode === 'login' ? '#f0f0f0' : '#888',
              borderTop: 'none', borderLeft: 'none', borderRight: 'none',
              borderBottom: mode === 'login' ? '2px solid #f0f0f0' : '2px solid transparent',
              background: 'none', cursor: 'pointer',
            }}
          >
            登录
          </button>
          <button
            onClick={() => { setMode('signup'); setSuccessMsg('') }}
            style={{
              flex: 1, padding: '9px 0', fontSize: 12, fontWeight: mode === 'signup' ? 600 : 400,
              color: mode === 'signup' ? '#f0f0f0' : '#888',
              borderTop: 'none', borderLeft: 'none', borderRight: 'none',
              borderBottom: mode === 'signup' ? '2px solid #f0f0f0' : '2px solid transparent',
              background: 'none', cursor: 'pointer',
            }}
          >
            注册
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <input
            type="email"
            placeholder="邮箱"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            style={inputStyle}
          />
          <input
            type="password"
            placeholder="密码"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            style={inputStyle}
          />

          {mode === 'signup' && (
            <input
              type="text"
              placeholder="昵称"
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              style={inputStyle}
            />
          )}

          {mode === 'signup' && (
            <div style={{ display: 'flex', gap: 6 }}>
              {(['guest', 'editor'] as const).map(r => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRole(r)}
                  style={{
                    flex: 1, padding: '9px 0', fontSize: 11, cursor: 'pointer',
                    background: role === r ? '#f0f0f0' : '#222',
                    color: role === r ? '#111' : '#888',
                    border: '1px solid #2a2a2a',
                    fontWeight: role === r ? 600 : 400,
                  }}
                >
                  {roleLabels[r]}
                </button>
              ))}
            </div>
          )}

          {error && <p style={{ color: '#f87171', fontSize: 11 }}>{error}</p>}
          {successMsg && <p style={{ color: '#4ade80', fontSize: 11 }}>{successMsg}</p>}
          <button
            type="submit"
            disabled={loading}
            style={{
              padding: '11px', fontSize: 12, fontWeight: 600,
              background: '#f0f0f0', color: '#111', border: 'none', cursor: 'pointer',
              opacity: loading ? 0.6 : 1,
            }}
          >
            {loading ? '...' : mode === 'login' ? '登录' : '注册'}
          </button>
        </form>
      </div>
    </div>
  )
}
