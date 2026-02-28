import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()

    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Role check: block editors
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 403 })
    if (profile.role === 'editor') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const body = await req.json()
    const { version } = body

    if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
      return NextResponse.json({ error: 'version must be a positive integer' }, { status: 400 })
    }

    // Fetch the historical version
    const { data: versionRow, error: fetchErr } = await supabase
      .from('guest_profile_versions')
      .select('profile_data, version, created_at')
      .eq('guest_id', user.id)
      .eq('version', version)
      .single()

    if (fetchErr || !versionRow) {
      return NextResponse.json(
        { error: `Version ${version} not found` },
        { status: 404 }
      )
    }

    // Upsert active profile with the historical data
    const { error: upsertErr } = await supabase
      .from('guest_profiles')
      .upsert(
        {
          guest_id: user.id,
          profile_data: versionRow.profile_data,
          status: 'ACTIVE',
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'guest_id' }
      )

    if (upsertErr) {
      console.error('[persona/rollback] upsert error:', upsertErr)
      return NextResponse.json({ error: upsertErr.message }, { status: 500 })
    }

    return NextResponse.json({
      rolled_back_to_version: versionRow.version,
      original_created_at: versionRow.created_at,
    })
  } catch (err: any) {
    console.error('[persona/rollback]', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
