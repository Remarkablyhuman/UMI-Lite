'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function Home() {
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    async function redirect() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.replace('/login')
        return
      }
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()

      if (!profile) {
        await supabase.auth.signOut()
        router.replace('/login')
        return
      }

      if (profile.role === 'admin') router.replace('/admin/inbox')
      else if (profile.role === 'editor') router.replace('/editor/inbox')
      else router.replace('/guest/inbox')
    }
    redirect()
  }, [])

  return null
}
