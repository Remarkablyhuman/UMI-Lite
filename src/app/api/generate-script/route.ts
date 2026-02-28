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

export function buildHumanScriptWithEvidencePrompt(params: {
  personaJson: any;
  referenceTranscript: string;
  topicBrief: string;
  constraints?: {
    platform?: "tiktok" | "xhs" | "wechat" | "youtube" | "generic";
    language?: "zh-CN" | "en-US";
    duration_seconds?: 60 | 75 | 90;
    format?: "voice_over" | "on_camera" | "mixed" | "unspecified";
    cta_required?: boolean;
  };
}) {
  const { personaJson, referenceTranscript, topicBrief, constraints = {} } = params;

  const {
    platform = "generic",
    language = "zh-CN",
    duration_seconds = 75,
    format = "unspecified",
    cta_required = true,
  } = constraints;

  const system = `
You are a professional short-form video scriptwriter.

Your task:
Write a ${duration_seconds}-second script that sounds like the creator described in the persona JSON,
and mirrors the speaking rhythm, structure, and natural wording style of the reference transcript.

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

PART 2 — Evidence Used:
After the script, add:
---
Evidence Used:
- 3–8 short phrases or sentence patterns reused or closely paraphrased from the reference transcript
- List 3 anchor keywords from personaJson.voice_style.anchor_keywords that were included
- Confirm "No disallowed claims used"

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
- Keep pacing appropriate for ${duration_seconds}s

4) CTA:
- If cta_required=${cta_required}, include subtle CTA aligned with personaJson.growth.cta_style.
- If false, do not include CTA.

Do NOT mention persona, JSON, transcript, or prompt.
  `.trim();

  const user = `
TOPIC BRIEF:
${topicBrief}

PERSONA JSON:
${JSON.stringify(personaJson)}

REFERENCE TRANSCRIPT:
${referenceTranscript}

Now generate the final output in the required two-part format.
  `.trim();

  return { system, user };
}