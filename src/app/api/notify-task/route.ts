import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const TASK_LABELS: Record<string, string> = {
  RECORD_VIDEO: '录制任务',
  EDIT_VIDEO: '剪辑任务',
}

export async function POST(req: NextRequest) {
  const { taskType, assigneeId, referenceId } = await req.json()

  if (!assigneeId || !taskType) {
    return NextResponse.json({ error: 'missing fields' }, { status: 400 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const { data: profile } = await supabase
    .from('profiles')
    .select('email, display_name')
    .eq('id', assigneeId)
    .maybeSingle()

  if (!profile?.email) {
    return NextResponse.json({ skipped: 'no email' })
  }

  let runRefId = ''
  if (referenceId) {
    const { data: ref } = await supabase
      .from('references')
      .select('run_ref_id')
      .eq('id', referenceId)
      .maybeSingle()
    runRefId = ref?.run_ref_id ?? ''
  }

  const label = TASK_LABELS[taskType] ?? taskType
  const name = profile.display_name ?? profile.email
  const inboxUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/`

  const htmlBody = `
    <p>你好 ${name}，</p>
    <p>你有一个新的<strong>${label}</strong>等待处理。</p>
    ${runRefId ? `<p>项目编号：<strong>${runRefId}</strong></p>` : ''}
    <p><a href="${inboxUrl}">点击前往我的任务</a></p>
  `

  const res = await fetch('https://api.postmarkapp.com/email', {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'X-Postmark-Server-Token': process.env.POSTMARK_SERVER_TOKEN!,
    },
    body: JSON.stringify({
      From: process.env.POSTMARK_FROM_EMAIL,
      To: profile.email,
      Subject: `新任务：${label}${runRefId ? ` [${runRefId}]` : ''}`,
      HtmlBody: htmlBody,
      TextBody: `你好 ${name}，你有新的${label}。${runRefId ? `项目：${runRefId}。` : ''}请登录查看：${inboxUrl}`,
      MessageStream: 'outbound',
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    console.error('[notify-task] Postmark error:', err)
    return NextResponse.json({ error: err }, { status: 500 })
  }

  return NextResponse.json({ sent: true })
}
