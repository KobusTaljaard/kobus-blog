import Anthropic from '@anthropic-ai/sdk';

// One model for every step. The spec requires Opus 5.5 or later for the final check;
// drafting uses it too because the draft must sound like Kobus.
export const MODEL = process.env.AI_MODEL || 'claude-opus-5-5';

let _client: Anthropic | null = null;
function client() {
  if (!_client) _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return _client;
}

async function callTool<T>(opts: {
  system: string;
  user: string;
  toolName: string;
  toolDescription: string;
  schema: Record<string, unknown>;
  maxTokens: number;
}): Promise<T> {
  const res = await client().messages.create({
    model: MODEL,
    max_tokens: opts.maxTokens,
    system: opts.system,
    messages: [{ role: 'user', content: opts.user }],
    tools: [
      {
        name: opts.toolName,
        description: opts.toolDescription,
        input_schema: opts.schema as Anthropic.Tool.InputSchema,
      },
    ],
    tool_choice: { type: 'tool', name: opts.toolName },
  });
  const block = res.content.find((b) => b.type === 'tool_use');
  if (!block || block.type !== 'tool_use') throw new Error('The model returned no result.');
  return block.input as T;
}

const WRITER_CONTEXT = `The writer is Kobus Taljaard: a South African real estate investor, businessman and Christian who writes longhand in a notebook, then reads it aloud; the recording is transcribed verbatim (filler words removed). His blog is read only by people — friends, family, curious strangers. It is not written for search engines.`;

// ---------- Step 2: background analysis ----------

export type Theme = { theme: string; outline: string; notes: string };
export type Analysis = { themes: Theme[]; general_notes: string };

export async function analyseTranscript(transcript: string): Promise<Analysis> {
  return callTool<Analysis>({
    system: `${WRITER_CONTEXT}

You are his editor. You read the transcript of one notebook entry and prepare it for the blog. You never add ideas of your own.`,
    user: `Here is the transcript.

<transcript>
${transcript}
</transcript>

Do the following:

1. Identify how many distinct themes it contains. A theme is a subject that could stand as its own blog post. Do not split hairs: related thoughts serving one point are one theme. A single-theme transcript is normal.
2. For each theme, write an outline in Markdown: a working title as the first line (prefixed "# "), then a bulleted list of the points he actually makes, in a sensible order, using his own phrasing where you can. Include short quotes of lines worth keeping verbatim. Do not add points he did not make.
3. For each theme, note formatting, copywriting and language-consistency issues the draft writer must fix (e.g. mixed British/American spelling — keep his dominant variant, which is likely British/South African; repeated words; unclear passages; tense shifts; transcription errors). Be specific and brief.

Return the result with the tool.`,
    toolName: 'save_analysis',
    toolDescription: 'Save the themes found in the transcript.',
    schema: {
      type: 'object',
      properties: {
        themes: {
          type: 'array',
          minItems: 1,
          items: {
            type: 'object',
            properties: {
              theme: { type: 'string', description: 'Short name of the theme (2–6 words).' },
              outline: { type: 'string', description: 'Markdown outline: "# Working title" then bullets.' },
              notes: { type: 'string', description: 'Issues the draft writer must fix for this theme.' },
            },
            required: ['theme', 'outline', 'notes'],
          },
        },
        general_notes: { type: 'string', description: 'Anything that applies to the whole transcript.' },
      },
      required: ['themes', 'general_notes'],
    },
    maxTokens: 8000,
  });
}

// ---------- Step 4: draft ----------

export type Draft = { title: string; body_markdown: string; excerpt: string; tags: string[] };

export const AI_TELLS = `- Stock AI vocabulary: delve, tapestry, testament, journey (figurative), realm, navigate (figurative), landscape (figurative), embark, unlock, foster, elevate, resonate, profound, pivotal, nuanced, multifaceted, "in today's world", "it's worth noting", "at the end of the day".
- Contrast formulas: "It's not X, it's Y", "not just X but Y", "This isn't about X. It's about Y."
- Reflexive groups of three, especially adjective triplets.
- Em-dash overuse; more than one or two per piece is a tell.
- Tidy moral or summary at the end ("Ultimately…", "In the end…", "And that's the real lesson."), and rhetorical questions answered immediately.
- Headings on a personal essay that does not need them; bullet points in personal writing.
- Uniform sentence rhythm; every paragraph the same length; over-smooth transitions ("Moreover", "Furthermore", "That said").
- Hedging and throat-clearing ("I think it's important to…", "Let's explore…").
- Generic, sourceless claims and vague universal statements that he did not make.`;

export async function writeDraft(input: {
  transcript: string;
  theme: string;
  outline: string;
  notes: string;
}): Promise<Draft> {
  return callTool<Draft>({
    system: `${WRITER_CONTEXT}

You turn one theme from his spoken transcript into a finished blog post in his voice. The post must read as if he wrote it by hand, because he did: your job is arrangement and cleanup, not authorship.

Rules:
- Use his words, phrasing, images and examples from the transcript wherever possible. Keep his idioms, his directness, and his South African English.
- Cover this one theme only. Leave out everything in the transcript that belongs to other themes.
- Follow the approved outline's order and content. Do not add ideas, stories, facts, scripture references or conclusions he did not state.
- Fix the listed issues. Keep his dominant spelling variant consistently.
- Form: short paragraphs of varied length. Use a "## " heading only if the piece is long and genuinely has sections. Bold or italic only where he would stress a word when speaking. No lists unless he dictated one.
- Avoid every one of these AI-writing tells:
${AI_TELLS}
- End where his thought ends. No summary, no moral added.`,
    user: `<transcript>
${input.transcript}
</transcript>

<theme>${input.theme}</theme>

<approved_outline>
${input.outline}
</approved_outline>

<issues_to_fix>
${input.notes || 'None noted.'}
</issues_to_fix>

Write the post and return it with the tool. Also give a one- or two-sentence excerpt in his voice (used on the blog's list page, taken or lightly adapted from the post itself) and 1–4 short lowercase tags.`,
    toolName: 'save_draft',
    toolDescription: 'Save the finished draft.',
    schema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        body_markdown: { type: 'string', description: 'The post body in Markdown, without the title.' },
        excerpt: { type: 'string' },
        tags: { type: 'array', items: { type: 'string' }, maxItems: 4 },
      },
      required: ['title', 'body_markdown', 'excerpt', 'tags'],
    },
    maxTokens: 16000,
  });
}

// ---------- Step 6: final QC ----------

type QcRaw = {
  ai_score: number;
  quality_score: number;
  ai_flags: { quote: string; note: string; fix?: string }[];
  error_flags: { quote: string; note: string; fix?: string }[];
  summary: string;
};

export async function finalCheck(title: string, bodyMarkdown: string): Promise<QcRaw> {
  return callTool<QcRaw>({
    system: `${WRITER_CONTEXT}

You are the last reader before a post goes public. You are strict, specific and fair. You do not rewrite the piece; you point at exact passages.

You score two things from 0 to 100:

1. ai_score — how completely human the writing reads. 100 = nothing in it would make a perceptive reader suspect a machine wrote or polished it. Deduct for each AI-writing tell, weighted by how noticeable it is:
${AI_TELLS}
Do not deduct for plain, simple or unpolished writing; that reads as human.

2. quality_score — freedom from human error. 100 = no typos, grammar mistakes, inconsistent spelling variant, wrong words, broken sentences or passages whose meaning is unclear. Deduct per error, weighted by how much it hurts the reader.

For every deduction, add a flag quoting the exact passage (short, copied verbatim so it can be found), a plain explanation, and a concrete fix. Do not flag matters of taste. Scores must match the flags: a clean piece scores in the 90s.`,
    user: `<title>${title}</title>

<post>
${bodyMarkdown}
</post>

Check this post and return the result with the tool. The summary is one or two plain sentences addressed to Kobus.`,
    toolName: 'save_check',
    toolDescription: 'Save the final check result.',
    schema: {
      type: 'object',
      properties: {
        ai_score: { type: 'integer', minimum: 0, maximum: 100 },
        quality_score: { type: 'integer', minimum: 0, maximum: 100 },
        ai_flags: {
          type: 'array',
          items: {
            type: 'object',
            properties: { quote: { type: 'string' }, note: { type: 'string' }, fix: { type: 'string' } },
            required: ['quote', 'note'],
          },
        },
        error_flags: {
          type: 'array',
          items: {
            type: 'object',
            properties: { quote: { type: 'string' }, note: { type: 'string' }, fix: { type: 'string' } },
            required: ['quote', 'note'],
          },
        },
        summary: { type: 'string' },
      },
      required: ['ai_score', 'quality_score', 'ai_flags', 'error_flags', 'summary'],
    },
    maxTokens: 8000,
  });
}
