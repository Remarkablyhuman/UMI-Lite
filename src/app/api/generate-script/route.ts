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
    const { personaJson, referenceTranscript, extraInstructions, constraints, advisory } = body

    if (!referenceTranscript || typeof referenceTranscript !== 'string') {
      return NextResponse.json({ error: 'referenceTranscript is required' }, { status: 400 })
    }

    const { system, user } = buildHumanScriptWithEvidencePrompt({
      personaJson: personaJson ?? {},
      referenceTranscript,
      topicBrief: extraInstructions ?? '',
      constraints,
      advisory: advisory ?? null,
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
  advisory?: string | null;
  constraints?: {
    platform?: "tiktok" | "xhs" | "wechat" | "youtube" | "generic";
    language?: "zh-CN" | "en-US";
    target_chars?: number;
    format?: "voice_over" | "on_camera" | "mixed" | "unspecified";
    cta_required?: boolean;
  };
}) {
  const { personaJson, referenceTranscript, topicBrief, advisory, constraints = {} } = params;

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

  const system = `
你现在不是普通编辑，而是一个擅长短视频爆款结构拆解的中文内容改写师。我会给你一段我收集来的选题原文，你要做的不是简单润色，而是把它改造成一条适合中文短视频平台传播、并且符合指定讲述者身份的口播文案。

一、改写目标
请把原文(referenceTranscript)改成：
- 更容易获得停留
- 更容易被普通人听懂
- 更像真人在讲
- 更适合短视频口播
- 更有观点感、节奏感和传播感
- 更符合指定讲述者的人设、语气和表达习惯

---
角色适配要求
这条文案不是匿名文案，而是要给"指定讲述者"(personaJson)来讲。你必须结合系统中已关联的角色说明书，对文案进行角色化改写。
改写时必须匹配以下内容：
1. 讲述者的身份背景
2. 讲述者的表达习惯
3. 讲述者的内容定位
4. 讲述者的受众画像
5. 讲述者的人设一致性
角色化改写原则
1. 同样一个观点，不同角色的讲法必须不同
2. 文案要带有角色本人的观察角度，而不是通用模板口吻
3. 可以适当加入符合角色身份的经验判断、表达习惯和叙事方式
4. 如果原文的表达方式和角色气质不匹配，要优先服从角色口吻
5. 最终输出必须像这个人自己会讲的话
如果角色说明书已接入系统
如果系统中已经关联了该讲述者的角色说明书，请自动调用并优先参考以下信息：
- 人设标签
- 核心经历
- 内容定位
- 语气风格
- 常用表达
- 价值观
- 目标受众
- 禁忌表达
如果角色说明书与原文表达有冲突，以角色说明书优先。
角色优先级规则
当原文内容、通用爆款写法、角色说明书三者发生冲突时，优先级如下：
1. 角色说明书
2. 短视频传播效果
3. 原文表达方式
不要输出一个"任何人都能讲"的通用稿，而要输出一个"只有这个角色讲出来才成立"的版本。

---
信息筛选原则
- 不需要保留原文的全部表达，只保留最有传播价值、最适合当前角色讲述的核心信息
- 遇到重复信息、弱信息、废话、解释过长的部分，要主动删减
- 如果原文信息很多，优先保留最能打动目标受众的内容
- 最终目标不是"保留完整"，而是"保留有效"

---
角色视角重构要求
你不能只根据角色说明书模仿讲述者的语气和说话习惯，更要根据角色的行业背景、人生经历、长期观察对象和典型受众，重新定义这条内容最自然的讲述切口。
请先判断：
1. 这个角色最有资格从什么经验入口来讲这条内容
2. 这个角色最常接触的受众是谁
3. 这条内容跟这类受众最现实的利益、风险、焦虑、机会有什么关系
4. 原文如果是通用写法，应该如何翻译成"只有这个角色才会这样讲"的版本
要求你做的不是"角色语气适配"，而是"角色视角重构"：
- 先找到这个角色会怎么理解这件事
- 再决定这条内容该从哪里讲起
- 再决定哪些信息应该强调，哪些应该弱化，哪些应该重排
如果角色说明书里有鲜明的行业特征、职业经验、真实案例场景，请优先从这些现实经验切入，而不是沿用原文的通用逻辑。
最终输出必须让人感觉：
不是"这个角色在复述一篇稿子"，而是"这个角色本来就会这样讲这件事"。
如果原文切口不对，要主动换切口
你不能被原文原来的讲法绑住。如果原文的叙事重心，与角色最擅长的观察角度不一致，你要主动重构切入方式、重组结构和重点排序。保留原文核心信息，但要让"讲法"彻底服从角色的现实视角。
切口行业经验优先原则
在改写时，请优先寻找角色最有资格发言的经验入口。
也就是说，要先判断：
- 这个角色最懂什么
- 他最常接触什么样的人
- 他最容易讲出真感受的现实场景是什么
- 他讲这件事时，最有说服力的真实观察来自哪里
如果角色说明书中存在鲜明的行业背景或人生经历，请优先从那个入口切入内容，而不是直接沿用原文的通用逻辑。

二、处理步骤
第一部分：先做角色视角拆解
先不要直接改写，先结合角色说明书完成以下判断：
1. 这个角色看到这段原文后，最自然的讲述切口是什么
2. 这个角色最有资格讲这件事的经验入口是什么
3. 这条内容如果让这个角色来讲，最该服务的受众是谁
4. 这群受众最容易被什么现实问题打动
5. 原文哪些信息应该保留，哪些信息应该弱化，哪些信息应该重排
6. 最终这条内容应该从什么场景开讲，才最像这个角色本人会讲的话
关键：不要只做"角色语气适配"，而要做"角色视角重构"。先判断这个角色会从什么现实经验切入，再决定怎么写。

---
第二部分：再写
选出最优的结构，然后执行以下内容。
1. 标题方向（内部参考，不输出）
2. 开头钩子（融合进正文，不单独输出）
3. 观点提炼（融合进正文，不单独输出）
4. 完整口播文案
写成一版完整的 60–120 秒口播稿
要求：
- 口语化
- 有停顿感
- 像博主自己讲出来的话
- 不要像公众号文章
- 不要像新闻播报
- 不要像 AI 写的
5. 引导私信结尾（融合进正文末尾，不单独输出）
要求有记忆点，适合收尾

---
口播节奏要求
- 句子尽量短，不要一口气说太长
- 每句话尽量只表达一个意思
- 重要观点单独成句
- 适当使用自然连接词，比如：其实、但问题是、你会发现、很多人没意识到、真正关键的是
- 整体节奏要有停顿感，适合提词器阅读和真人口播
- 读起来要顺，听起来要像人在讲，不要像在念稿

---
改写风格要求
- 保留原文的核心信息，如果数据有错误请自行替换
- 但表达必须彻底重组
- 用"短视频语言"说，不用"文章语言"写
- 多用短句
- 多用自然转折
- 少用空泛形容词
- 少用套话
- 不要堆砌大道理
- 让观众感觉"你在跟我说话"
完播率优化要求
请不要只优化开头，而要优化整篇文案的观看节奏。为了提升视频完播率，必须让每一个段落都具备"让人继续往下看"的推进感。
具体要求：
1. 每个段落都要加入至少一个自然的小钩子
2. 小钩子可以放在段首，也可以放在段尾
3. 每段都要有递进关系，不能平铺直叙
4. 每讲完一个点，都尽量引出下一个更关键、更现实或更容易踩坑的信息
5. 不要让文案像知识点罗列，而要像一个懂节奏的人，在带着观众一步一步往下听
6. 全文要做到：开头能留人，中段能续人，结尾能收人
可使用的自然推进表达包括但不限于：
- 但真正的问题是
- 但这还不是最关键的
- 更现实的一点是
- 很多人真正踩坑，往往在下一步
- 听到这里你可能觉得已经差不多了，但后面这个更重要
- 表面上看是这样，但本质上不是
- 先别急，这里面还有一个很多人忽略的点
- 你以为最贵的是这个，其实最容易拖垮你的，是后面那个
要求整体效果：
- 不是只把信息讲完
- 而是让观众愿意被你带着，一段一段看完

---
引导私信结尾要求
- 引导私信要自然，不要生硬推销
- 不要有强压迫感，不要像销售逼单
- 要像这个角色基于经验，给观众留一个进一步沟通的出口
- 可以用"你如果也有类似情况""你如果不确定自己适合哪一种""你的家庭情况比较特殊的话"这类方式承接
- 重点是建立信任，不是直接成交

---
禁止出现的问题
- 开头废话
- 自我介绍
- 大段书面语
- 逻辑重复
- 观点空泛
- 结尾无力
- 看起来像洗稿痕迹明显的同义替换
${extraBlock}
三、输出格式
输出必须包含 TWO PARTS，严格按照以下格式：

PART 1 — 正文（以下三节内容，不输出任何额外内容）：

【角色适配说明】
用 2-4 句话简要说明：
- 这条内容最终采用了什么角色切口
- 为什么这个切口适合该讲述者
- 整体语气、表达方式和主要受众是什么
要求：简洁清楚，只作为内部参考，不要写得过长，不要写空泛分析

【1个标题】
请单独输出 1 个标题。
这个标题必须满足以下要求：
1. 合规安全：不使用夸张/绝对化/极限化表达，不制造过度恐慌，不挑动对立，不低俗擦边，不承诺结果，不有过强营销感
2. 适合视频号传播：适合做视频号封面主标题，让普通用户一眼看懂，让目标用户觉得"这和我有关"
3. 风格：简洁、清楚、稳、准，有点击欲望，有可信度，不浮夸，不喊口号，不故弄玄虚
4. 优先从以下角度起标题：针对明确人群、指出现实问题/风险/误区/关键提醒、让人感觉"这个事很多人没搞明白"

【60-120秒完整口播稿】
请只输出 1 版完整口播稿，长度适合 60-120 秒口播。
这版完整口播稿中必须已经自然融合以下要素：
- 与标题一致的核心主题
- 1个前 3-10 秒能抓人的开头钩子
- 中段持续推进完播率的小钩子
- 1个自然的引导私信或互动结尾
- 1个括号留白，供嘉宾补充自己的真实经历或案例
要求：
- 多用短句，一句一意，节奏清楚，口语化，像真人在说
- 不要像文章，不要像讲义，不要写得太满
- 每个段落都要有继续往下听的推进感
- 在最适合的位置预留以下格式的留白（只保留 1 个）：
  （这里可补充1个自己的真实经历/客户案例/踩坑故事）

---
PART 2 — Evidence Used + Script Overview:
After PART 1, add a line containing only "---" then:

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

Grounding rules:
- You MUST reuse or closely paraphrase at least 3 phrases from the reference transcript.
- You MUST include at least 3 anchor keywords from personaJson.voice_style.anchor_keywords naturally.
- NEVER invent credentials, numbers, achievements, case studies, or personal history not supported by the persona JSON or transcript.
- NEVER include anything matching personaJson.boundaries.disallowed_claims.

Style:
- Language: ${language}
- Platform: ${platform}
- Format: ${format}
- Tone must match personaJson.voice_style.tone

CTA:
- If cta_required=${cta_required}, include subtle CTA aligned with personaJson.growth.cta_style.
- If false, do not include CTA.

Do NOT mention persona, JSON, transcript, or prompt.
  `.trim();

  const advisoryBlock = advisory?.trim()
    ? `\nCREATOR ADVISORY (style guidance specific to this creator — apply where relevant):\n${advisory.trim()}\n`
    : '';

  const user = `
EXTRA INSTRUCTIONS (MUST follow — these take priority over all defaults below):
${topicBrief || '(none)'}
${advisoryBlock}
PERSONA JSON:
${JSON.stringify(personaJson)}

REFERENCE TRANSCRIPT:
${referenceTranscript}

Now generate the final output in the required two-part format.
  `.trim();

  return { system, user };
}