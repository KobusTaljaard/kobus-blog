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
  // Newer Opus models reject a forced tool_choice, so the model is asked to use the tool
  // and the reply is read from the tool call, or from JSON in the text as a fallback.
  const messages: Anthropic.MessageParam[] = [{ role: 'user', content: opts.user }];
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await client()
      .messages.stream({
        model: MODEL,
        max_tokens: opts.maxTokens,
        system: `${opts.system}\n\nAlways give your answer by calling the ${opts.toolName} tool exactly once. Do not answer in plain text.`,
        messages,
        tools: [
          {
            name: opts.toolName,
            description: opts.toolDescription,
            input_schema: opts.schema as Anthropic.Tool.InputSchema,
          },
        ],
        tool_choice: { type: 'auto' },
      })
      .finalMessage();

    const call = res.content.find((b) => b.type === 'tool_use' && b.name === opts.toolName);
    if (call && call.type === 'tool_use') return call.input as T;

    const text = res.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n');
    const json = text.match(/\{[\s\S]*\}/);
    if (json) {
      try {
        return JSON.parse(json[0]) as T;
      } catch {
        /* fall through to a retry */
      }
    }
    messages.push({ role: 'assistant', content: res.content });
    messages.push({ role: 'user', content: `Please give the result by calling the ${opts.toolName} tool.` });
  }
  throw new Error('The model did not return a usable result. Please try again.');
}

const WRITER_CONTEXT = `The writer is Kobus Taljaard: a South African real estate investor, businessman and Christian who writes longhand in an A4 notebook, then reads it aloud; the recording is transcribed verbatim (filler words removed). He teaches: the Bible, real estate, life. His blog is read only by people — friends, family, curious strangers. It is not written for search engines.

How he structures a piece: a title; an intro; usually two to five points; under any point, optional "forks" (2–6 one-line ideas that open the point up); an "outro" that turns from the teaching toward the landing; and a conclusion where he draws everything together, "lands the plane" and makes one final application. He makes applications wherever the teaching allows — in the title, intro, any point or fork — not only at the end.`;

const APPS = { type: 'array', items: { type: 'string' }, description: 'Applications he makes at this spot, one short line each. Empty if none.' };
const LINE = (d: string) => ({ type: 'object', properties: { text: { type: 'string', description: d }, apps: APPS }, required: ['text', 'apps'] });

// ---------- Step 1: themes in an original source ----------

export type FoundTheme = { name: string; summary: string; quotes: string[]; main: boolean };
export type ThemeFind = { themes: FoundTheme[]; notes: string };

export async function findThemes(transcript: string): Promise<ThemeFind> {
  return callTool<ThemeFind>({
    system: `${WRITER_CONTEXT}

You are his editor. You read one notebook entry and name the themes in it, so he can choose which become blog posts. You never add ideas of your own.`,
    user: `<transcript>
${transcript}
</transcript>

List the themes in this entry. A theme is a subject that could carry a post of its own. Name every distinct subject he spends real time on, including side-roads where he wanders off his main subject; he will merge or drop them himself. Do not split one line of thought into several themes, and do not list passing remarks.

For each theme:
- name: 2–6 words, plain.
- summary: one sentence saying what he says about it.
- quotes: 1–3 short lines from the transcript, verbatim, that show it.
- main: true for the subject the entry is mostly about (exactly one), false for the rest.

notes: formatting, copywriting and language-consistency issues a writer must fix for any post from this entry (mixed British/American spelling — keep his dominant variant, likely British/South African; transcription errors; repeated words; unclear passages). Brief.`,
    toolName: 'save_themes',
    toolDescription: 'Save the themes found in the entry.',
    schema: {
      type: 'object',
      properties: {
        themes: {
          type: 'array',
          minItems: 1,
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              summary: { type: 'string' },
              quotes: { type: 'array', items: { type: 'string' }, maxItems: 3 },
              main: { type: 'boolean' },
            },
            required: ['name', 'summary', 'quotes', 'main'],
          },
        },
        notes: { type: 'string' },
      },
      required: ['themes', 'notes'],
    },
    maxTokens: 12000,
  });
}

// ---------- Step 2: an outline for one chosen theme ----------

export type OutlineOut = {
  title: { text: string; apps: string[] };
  intro: { text: string; apps: string[] };
  points: { text: string; apps: string[]; forks: { text: string; apps: string[] }[] }[];
  outro: { text: string; apps: string[] };
  conclusion: { text: string; apps: string[] };
};

export async function outlineTheme(input: {
  transcript: string;
  theme: { name: string; summary: string };
  absorbed: { name: string; summary: string }[];
  others: { name: string; summary: string }[];
  notes: string;
}): Promise<OutlineOut> {
  const absorbed = input.absorbed.length
    ? `\n\nHe merged these themes into it. Fold them in as points or, more often, as forks under the point they serve:\n${input.absorbed.map((t) => `- ${t.name}: ${t.summary}`).join('\n')}`
    : '';
  const others = input.others.length
    ? `\n\nLeave out material that belongs to these other themes (they are separate pieces or were dropped):\n${input.others.map((t) => `- ${t.name}: ${t.summary}`).join('\n')}`
    : '';
  return callTool<OutlineOut>({
    system: `${WRITER_CONTEXT}

You are his editor. You outline one theme from his notebook entry in his structure. You never add ideas of your own.`,
    user: `<transcript>
${input.transcript}
</transcript>

<theme>
${input.theme.name}: ${input.theme.summary}${absorbed}${others}
</theme>

Outline this theme only. Every entry is an idea, not prose: one line, in his own words where possible.
- title: a working title.
- intro: the idea he opens with.
- points: TWO TO FIVE main points (three is typical), never more. A blog post, talk or article cannot carry more. Group related ideas as forks under the point they serve instead of making them points.
- forks: under any point, 0–6 one-line ideas that open it up. Only where the material branches.
- outro: the turn toward the landing, if there is one; else empty.
- conclusion: the landing, only if he states one; else empty.
- apps: record each application he makes, at the spot where he makes it.
Do not add points, forks or applications he did not make.`,
    toolName: 'save_outline',
    toolDescription: 'Save the outline.',
    schema: {
      type: 'object',
      properties: {
        title: LINE('Working title'),
        intro: LINE('Intro idea, one line'),
        points: {
          type: 'array',
          minItems: 1,
          maxItems: 5,
          items: {
            type: 'object',
            properties: { text: { type: 'string' }, apps: APPS, forks: { type: 'array', maxItems: 6, items: LINE('Fork idea, one line') } },
            required: ['text', 'apps', 'forks'],
          },
        },
        outro: LINE('Outro idea, one line, or empty'),
        conclusion: LINE('Conclusion idea, or empty'),
      },
      required: ['title', 'intro', 'points', 'outro', 'conclusion'],
    },
    maxTokens: 12000,
  });
}

// ---------- Writing: prose for every block of the approved outline ----------

export const AI_TELLS = `- Stock AI vocabulary: delve, tapestry, testament, journey (figurative), realm, navigate (figurative), landscape (figurative), embark, unlock, foster, elevate, resonate, profound, pivotal, nuanced, multifaceted, "in today's world", "it's worth noting", "at the end of the day".
- Contrast formulas: "It's not X, it's Y", "not just X but Y", "This isn't about X. It's about Y."
- Reflexive groups of three, especially adjective triplets.
- Em-dash overuse; more than one or two per piece is a tell.
- Tidy moral or summary tacked on, and rhetorical questions answered immediately.
- Uniform sentence rhythm; every paragraph the same length; over-smooth transitions ("Moreover", "Furthermore", "That said").
- Hedging and throat-clearing ("I think it's important to…", "Let's explore…").
- Generic, sourceless claims and vague universal statements he did not make.`;

export type Written = { blocks: { id: string; body_markdown: string }[]; excerpt: string; tags: string[] };

export async function writeFromOutline(input: { transcript: string; outline: string; notes: string }): Promise<Written> {
  return callTool<Written>({
    system: `${WRITER_CONTEXT}

You turn his approved outline into the finished post, block by block, in his voice. The post must read as if he wrote it by hand, because he did: your job is arrangement and cleanup, not authorship.

Rules:
- Use his words, phrasing, images and examples from the transcript wherever possible. Keep his idioms, directness and South African English.
- Write prose for every block id in the outline, in its place. Headings (title, point and fork names) are his; do not rewrite them and do not repeat them in the prose.
- Weave each listed application into the prose of its block, in his words.
- Stay within this outline. Do not add ideas, stories, facts, scripture references or conclusions he did not state. If a block's idea is empty, return an empty body for it.
- Fix the listed issues. Keep his dominant spelling variant.
- Short paragraphs of varied length. Bold or italic only where he would stress a word when speaking. No lists unless he dictated one. No headings inside a body.
- Avoid every one of these AI-writing tells:
${AI_TELLS}
- The conclusion lands the plane: it draws the piece together and makes the final application, in his words. End where his thought ends.`,
    user: `<transcript>
${input.transcript}
</transcript>

<approved_outline>
${input.outline}
</approved_outline>

<issues_to_fix>
${input.notes || 'None noted.'}
</issues_to_fix>

Return the prose for each block id, a one- or two-sentence excerpt in his voice (for the blog's list page) and 1–4 short lowercase tags.`,
    toolName: 'save_writing',
    toolDescription: 'Save the prose for every block.',
    schema: {
      type: 'object',
      properties: {
        blocks: {
          type: 'array',
          items: {
            type: 'object',
            properties: { id: { type: 'string' }, body_markdown: { type: 'string', description: 'Markdown paragraphs; no headings.' } },
            required: ['id', 'body_markdown'],
          },
        },
        excerpt: { type: 'string' },
        tags: { type: 'array', items: { type: 'string' }, maxItems: 4 },
      },
      required: ['blocks', 'excerpt', 'tags'],
    },
    maxTokens: 32000,
  });
}

// ---------- Humanizer: five checks ----------

export const CHECKS = [
  { key: 'ai', name: 'AI detection', gate: true, what: 'How completely human the writing reads. 100 = nothing would make a perceptive reader suspect a machine wrote or polished it. Deduct for the AI-writing tells.' },
  { key: 'flow', name: 'Natural flow and grammar', gate: true, what: 'Typos, grammar, wrong words, broken or clumsy sentences, words too grand or too plain for the moment, inconsistent spelling variant.' },
  { key: 'argument', name: 'Argument and progression', gate: true, what: 'Does the teaching build? Ideas in a sensible sequence, each point expanding the last, moving toward the conclusion. Deduct for everything dumped at the start, a bloated middle, repetition, or a conclusion that does not land.' },
  { key: 'voice', name: 'Sounds like Kobus', gate: true, what: 'Compared with his own spoken words in the transcript: his vocabulary, rhythm, directness, idioms and South African English. Deduct wherever it sounds like someone else or like a polished writer he is not.' },
  { key: 'seo', name: 'SEO and AI search', gate: false, what: 'Advisory only. Is the title clear and findable, is the topic plain from the first paragraph, would a search engine or AI assistant know what question this answers? Suggest, never demand keyword stuffing.' },
] as const;

export type HumanizerOut = {
  checks: { key: string; score: number; summary: string; flags: { quote: string; issue: string; fix?: string }[] }[];
  summary: string;
};

export async function humanize(title: string, articleMarkdown: string, transcript: string): Promise<HumanizerOut> {
  return callTool<HumanizerOut>({
    system: `${WRITER_CONTEXT}

You are the Humanizer: the last, strict and fair reader before a post goes public. You do not rewrite the piece; you point at exact passages and offer a fix in his voice.

Score each check from 0 to 100:
${CHECKS.map((c) => `- ${c.key} (${c.name}): ${c.what}`).join('\n')}

AI-writing tells:
${AI_TELLS}

Plain, simple or unpolished writing reads as human; do not deduct for it. For every deduction add a flag: the exact passage copied verbatim from the post (short, so it can be found), the problem in plain words, and a fix: replacement text for exactly that passage, in his voice. Do not flag matters of taste. Scores must match the flags: a clean check scores in the 90s.`,
    user: `<his_own_words_for_voice_reference>
${transcript}
</his_own_words_for_voice_reference>

<title>${title}</title>

<post>
${articleMarkdown}
</post>

Run all five checks. The overall summary is two plain sentences to Kobus: what is strongest and what to fix first.`,
    toolName: 'save_humanizer',
    toolDescription: 'Save the five checks.',
    schema: {
      type: 'object',
      properties: {
        checks: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              key: { type: 'string', enum: CHECKS.map((c) => c.key) },
              score: { type: 'integer', minimum: 0, maximum: 100 },
              summary: { type: 'string' },
              flags: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: { quote: { type: 'string' }, issue: { type: 'string' }, fix: { type: 'string' } },
                  required: ['quote', 'issue'],
                },
              },
            },
            required: ['key', 'score', 'summary', 'flags'],
          },
        },
        summary: { type: 'string' },
      },
      required: ['checks', 'summary'],
    },
    maxTokens: 16000,
  });
}
