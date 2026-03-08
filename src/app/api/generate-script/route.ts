/**
 * Human-readable script + short evidence footer
 * Output format:
 *
 * [SCRIPT TEXT]
 *
 * ---
 * Evidence Used:
 * - ...
 * - ...
 */

import OpenAI from 'openai'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  try {
    const body = await req.json()
    const { personaJson, referenceTranscript, extraInstructions, constraints } = body

    if (!referenceTranscript || typeof referenceTranscript !== 'string') {
      return NextResponse.json({ error: 'referenceTranscript is required' }, { status: 400 })
    }

    const { system, user } = buildHumanScriptWithEvidencePrompt({
      personaJson: personaJson ?? {},
      referenceTranscript,
      topicBrief: extraInstructions ?? '',
      constraints,
    })

    const completion = await openai.chat.completions.create({
      model: 'gpt-5.1',
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      temperature: 0.7,
    })

    const raw = completion.choices[0]?.message?.content ?? ''

    // Split on the --- separator that precedes "Evidence Used:"
    // Use line-by-line scan to handle variations like "\n\n---\n\n" or "--- "
    const lines = raw.split('\n')
    const sepLineIndex = lines.findIndex(l => l.trim() === '---')
    let part1: string
    let part2: string
    if (sepLineIndex !== -1) {
      part1 = lines.slice(0, sepLineIndex).join('\n').trim()
      part2 = lines.slice(sepLineIndex + 1).join('\n').trim()
    } else {
      // Fallback: return everything as part1
      part1 = raw.trim()
      part2 = ''
    }

    return NextResponse.json({ part1, part2 })
  } catch (err: any) {
    console.error('[generate-script]', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export function buildHumanScriptWithEvidencePrompt(params: {
  personaJson: any;
  referenceTranscript: string;
  topicBrief: string;
  constraints?: {
    platform?: "tiktok" | "xhs" | "wechat" | "youtube" | "generic";
    language?: "zh-CN" | "en-US";
    target_chars?: number;
    format?: "voice_over" | "on_camera" | "mixed" | "unspecified";
    cta_required?: boolean;
  };
}) {
  const { personaJson, referenceTranscript, topicBrief, constraints = {} } = params;

  const {
    platform = "generic",
    language = "zh-CN",
    target_chars = 600,
    format = "unspecified",
    cta_required = true,
  } = constraints;

  const targetChars = Math.min(target_chars, 2000)

  const extraBlock = topicBrief?.trim()
    ? `\nCRITICAL — EXTRA INSTRUCTIONS (highest priority, override style defaults if needed):\n${topicBrief.trim()}\n`
    : '';

  const system_temp = `
  You are a professional short-form video scriptwriter.

  Your task:
  Write a script that that preserves the main topic, content, and perspective of the REFERENCE TRANSCRIPT, slightly adjust the language so that it sounds like the creator described in the persona JSON,
  and mirrors the speaking rhythm, structure, and natural wording style of the reference transcript.
  `

  const system = `
  You are a director preparing a word-for-word script for a new narrator.

  Your task:
  Write a script that that preserves the main topic, content, and perspective of the REFERENCE TRANSCRIPT, slightly adjust the language so that it sounds like the creator described in the persona JSON,
  and mirrors the speaking rhythm, structure, and natural wording style of the reference transcript.
  All core information in the original text must remain unchanged, including data, events, prices, time, locations, and other factual details.
  The new narrator’s background is attached as PERSONA JSON.
  The script must be written strictly from the perspective of the narrator’s real-life experiences and personal observations.

  Requirements:
  The tone should feel like the narrator is sharing their own life experiences, not explaining or commenting like a content creator.
  Do not use generic influencer or commentator language
  The final script must not reveal the structure of the original text.
  It should sound natural, personal, and conversational, as if the narrator is speaking from their own life and background.
${extraBlock}
LENGTH REQUIREMENT for PART 1 only (mandatory — do not deviate):
- PART 1 (the script) must be approximately ${targetChars} Chinese characters (or equivalent words if in English).
- Do NOT stop early. Do NOT exceed ${Math.round(targetChars * 1.1)} characters in PART 1.
- A PART 1 shorter than ${Math.round(targetChars * 0.85)} characters is unacceptable.
- PART 2 (Evidence Used) is not counted toward this limit.

IMPORTANT RULES:

1) Output must contain TWO parts:

PART 1 — The Script:
- Clean, human-readable script only.
- No headings like "Hook" or "Body".
- No JSON.
- No explanation.
- Natural spoken language.
- Use line breaks for pacing.
- Strong hook → 2–3 key ideas → closing → CTA (if required).

PART 2 — Evidence Used + Script Overview:
After the script, add:
---
Evidence Used:
- 3–8 short phrases or sentence patterns reused or closely paraphrased from the reference transcript
- List 3 anchor keywords from personaJson.voice_style.anchor_keywords that were included
- Confirm "No disallowed claims used"

Script Summary:
(1–2 sentences summarising the core message and angle of the PART 1 script you just wrote above — NOT a summary of the reference transcript)

Key Points:
- (main idea 1)
- (main idea 2)
- (main idea 3)
[up to 5 bullet points reflecting the main ideas in the REFERENCE TRANSCRIPT — NOT the script you just wrote]

2) Grounding rules:
- You MUST reuse or closely paraphrase at least 3 phrases from the reference transcript.
- You MUST include at least 3 anchor keywords from personaJson.voice_style.anchor_keywords naturally.
- NEVER invent credentials, numbers, achievements, case studies, or personal history not supported by the persona JSON or transcript.
- NEVER include anything matching personaJson.boundaries.disallowed_claims.

3) Style:
- Language: ${language}
- Platform: ${platform}
- Format: ${format}
- Tone must match personaJson.voice_style.tone
- Keep pacing natural and consistent throughout — target ~${targetChars} Chinese characters

4) CTA:
- If cta_required=${cta_required}, include subtle CTA aligned with personaJson.growth.cta_style.
- If false, do not include CTA.

Do NOT mention persona, JSON, transcript, or prompt.
  `.trim();

  const user = `
EXTRA INSTRUCTIONS (MUST follow — these take priority over all defaults below):
${topicBrief || '(none)'}

PERSONA JSON:
${JSON.stringify(personaJson)}

REFERENCE TRANSCRIPT:
${referenceTranscript}

Now generate the final output in the required two-part format.
  `.trim();

  return { system, user };
}