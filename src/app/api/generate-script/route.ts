import OpenAI from 'openai'
import { NextRequest, NextResponse } from 'next/server'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

export async function POST(req: NextRequest) {
  const { url } = await req.json()
  if (!url) return NextResponse.json({ error: 'url required' }, { status: 400 })

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: '你是一位专业的短视频脚本创作者。根据提供的参考视频链接，生成一段供达人对着镜头口播的中文脚本。脚本应自然流畅、口语化，直接输出脚本正文，不要标题或说明。',
      },
      {
        role: 'user',
        content: `参考视频链接：${url}\n\n请根据该视频的内容风格，生成一段口播脚本。`,
      },
    ],
  })

  const script = completion.choices[0]?.message?.content ?? ''
  return NextResponse.json({ script })
}
