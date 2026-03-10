'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

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

  const inputStyle: React.CSSProperties = {
    padding: '12px 16px',
    fontSize: 14,
    border: '1px solid #2a2a2a',
    outline: 'none',
    background: '#0d0d0d',
    color: '#f0f0f0',
    borderRadius: 4,
    width: '100%',
    boxSizing: 'border-box',
  }

  return (
    <>
      <style>{`
        @media (max-width: 640px) {
          .login-left { display: none !important; }
          .login-right { flex: 1 !important; }
          .login-mobile-brand { display: block !important; }
        }
      `}</style>
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'row' }}>
        {/* Left panel */}
        <div
          className="login-left"
          style={{
            flex: 1,
            background: '#0d0d0d',
            padding: 'clamp(48px, 8vw, 80px)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
          }}
        >
          <div>
            <h1 style={{ fontSize: 'clamp(32px, 4vw, 48px)', fontWeight: 700, color: '#f0f0f0', margin: 0 }}>
              UMI
            </h1>
            <p style={{ fontSize: 14, color: '#555', marginTop: 8, marginBottom: 0 }}>内容生产协作平台</p>
            <div style={{ height: 1, background: '#1e1e1e', margin: '32px 0' }} />
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>
              {['视频制作工作流', '多角色协同管理', '高效简洁'].map(item => (
                <li key={item} style={{ color: '#444', fontSize: 14 }}>
                  <span style={{ marginRight: 10 }}>▸</span>{item}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Right panel */}
        <div
          className="login-right"
          style={{
            flex: 1,
            background: '#141414',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div style={{ width: 'min(420px, 100%)', padding: 'clamp(32px, 6vw, 56px)' }}>
            {/* Mobile-only brand header */}
            <div className="login-mobile-brand" style={{ display: 'none', marginBottom: 32 }}>
              <h1 style={{ fontSize: 28, fontWeight: 700, color: '#f0f0f0', margin: 0 }}>UMI</h1>
              <p style={{ fontSize: 13, color: '#555', marginTop: 6, marginBottom: 0 }}>内容生产协作平台</p>
            </div>
            {/* Tab switcher */}
            <div style={{ display: 'flex', marginBottom: 24, borderBottom: '1px solid #2a2a2a' }}>
              <button
                onClick={() => { setMode('login'); setError('') }}
                style={{
                  flex: 1, padding: '12px 0', fontSize: 14, fontWeight: mode === 'login' ? 600 : 400,
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
                  flex: 1, padding: '12px 0', fontSize: 14, fontWeight: mode === 'signup' ? 600 : 400,
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
                        flex: 1, padding: '12px 0', fontSize: 13, cursor: 'pointer',
                        background: role === r ? '#f0f0f0' : '#0d0d0d',
                        color: role === r ? '#111' : '#888',
                        border: '1px solid #2a2a2a',
                        borderRadius: 4,
                        fontWeight: role === r ? 600 : 400,
                      }}
                    >
                      {roleLabels[r]}
                    </button>
                  ))}
                </div>
              )}

              {error && <p style={{ color: '#f87171', fontSize: 13, margin: 0 }}>{error}</p>}
              {successMsg && <p style={{ color: '#4ade80', fontSize: 13, margin: 0 }}>{successMsg}</p>}

              <button
                type="submit"
                disabled={loading}
                style={{
                  padding: '13px', fontSize: 14, fontWeight: 700,
                  background: '#f0f0f0', color: '#111', border: 'none', cursor: 'pointer',
                  borderRadius: 4, opacity: loading ? 0.6 : 1, marginTop: 4,
                }}
              >
                {loading ? '...' : mode === 'login' ? '登录' : '注册'}
              </button>
            </form>
          </div>
        </div>
      </div>
    </>
  )
}
