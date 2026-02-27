import OpenAI from "openai"
import { NextRequest, NextResponse } from "next/server"

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

export async function POST(req: NextRequest) {
  try {
    const { url } = await req.json()
    if (!url)
      return NextResponse.json({ error: "url required" }, { status: 400 })

    const response = await openai.responses.create({
      model: "gpt-4o-mini",
      input: `参考视频链接：${url}
      
给出视频标题，并猜这个视频是说什么的。`,
    })

    const script = response.output_text

    return NextResponse.json({ script })
  } catch (err: any) {
    console.error(err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
