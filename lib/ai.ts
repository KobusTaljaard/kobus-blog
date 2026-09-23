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

LANGUAGE: every word the app writes, fixes or suggests is in US English: American spelling (color, honor, realize, center, traveled), American punctuation (double quotation marks, periods and commas inside them), and American dates (September 23, 2026). His transcripts may carry British spellings from the transcription tool; always convert them. Keep his South African idioms and turns of phrase; only the spelling and punctuation are American.

How he structures a piece: a title; an intro; usually two to five points; under any point, optional "forks" (2–6 one-line ideas that open the point up); an "outro" that turns from the teaching toward the landing; and a conclusion where he draws everything together, "lands the plane" and makes one final application. He makes applications wherever the teaching allows — in the title, intro, any point or fork — not only at the end.`;

/** What the app has learned about him so far (rebuilt weekly from his sources, edits and published posts). */
function learned(profile?: string) {
  return profile?.trim()
    ? `\n\n<what_you_have_learned_about_kobus>\nThis is a living profile built from everything he has written and every change he made to AI drafts. Treat it as the best available guide to his voice, beliefs and ways. Where it and your own instinct differ, follow it.\n\n${profile.trim()}\n</what_you_have_learned_about_kobus>`
    : '';
}

const APPS = { type: 'array', items: { type: 'string' }, description: 'Applications he makes at this spot, one short line each. Empty if none.' };
const LINE = (d: string) => ({ type: 'object', properties: { text: { type: 'string', description: d }, apps: APPS }, required: ['text', 'apps'] });

// ---------- Step 1: themes in an original source ----------

export type FoundTheme = { name: string; summary: string; quotes: string[]; main: boolean };
export type ThemeFind = { themes: FoundTheme[]; notes: string };

export async function findThemes(transcript: string, profile?: string): Promise<ThemeFind> {
  return callTool<ThemeFind>({
    system: `${WRITER_CONTEXT}${learned(profile)}

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

notes: formatting, copywriting and language-consistency issues a writer must fix for any post from this entry (British spellings to convert to US English; transcription errors; repeated words; unclear passages). Brief.`,
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
  profile?: string;
}): Promise<OutlineOut> {
  const absorbed = input.absorbed.length
    ? `\n\nHe merged these themes into it. Fold them in as points or, more often, as forks under the point they serve:\n${input.absorbed.map((t) => `- ${t.name}: ${t.summary}`).join('\n')}`
    : '';
  const others = input.others.length
    ? `\n\nLeave out material that belongs to these other themes (they are separate pieces or were dropped):\n${input.others.map((t) => `- ${t.name}: ${t.summary}`).join('\n')}`
    : '';
  return callTool<OutlineOut>({
    system: `${WRITER_CONTEXT}${learned(input.profile)}

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

export type Written = {
  title: string;
  blocks: { id: string; heading?: string; body_markdown: string }[];
  excerpt: string;
  tags: string[];
};

/** The craft rules for every piece of prose the app writes for him. Hardwired: the outline is a cue, never the text. */
export const WRITING_CRAFT = `THE OUTLINE IS NEVER THE ARTICLE.
An outline line is a cue: a note that reminds a writer what this part is about. It is not a sentence to keep, expand slightly, or paraphrase. Copying or lightly rewording outline lines into prose is lazy, machine writing and is forbidden. A reader of the finished post must never be able to reconstruct the outline by reading the first sentence of each section.

You write like the best essayist and copywriter alive, writing as Kobus:
- Go back to the original source (his notebook transcript) for every section. Mine it for BOTH ideas and words: his arguments, reasons, stories, examples, images, turns of phrase, questions, scripture he cites. The outline tells you which part of the source a section draws on; the source gives you the substance.
- Develop each idea the way a writer does: open with something concrete (a picture, a moment, a sharp claim, a question he would ask), unpack it, reason it through, show why it matters, and move the reader on. Earn each point before stating it.
- Build an argument across the piece. Each section should hand off to the next; the reader should feel pulled forward. Transitions come from the thought itself, not from connector words.
- Use his words where they are strong. Where his spoken phrasing is loose, write what he meant the way he would write it at his best, keeping his vocabulary, directness, humor and South African idioms.
- Vary sentence and paragraph length with purpose. Short lines for weight. Longer ones to carry a thought.
- Applications are part of the teaching, not bolt-ons: land each one where the outline places it, concretely, addressed to the reader's real life.
- Stay true to him. You may develop, illustrate and connect his ideas, but do not invent facts about his life, stories that did not happen, numbers, quotes, or theology he did not hold. General, obviously illustrative examples are fine; say them as illustrations.
- No lists unless he dictated one. Bold or italic only where he would lean on a word when speaking.
- Avoid every one of these AI-writing tells:
${AI_TELLS}`;

export async function writeFromOutline(input: {
  transcript: string;
  outline: string;
  notes: string;
  profile?: string;
  examples?: { title: string; markdown: string }[];
}): Promise<Written> {
  const examples = input.examples?.length
    ? `\n\n<his_published_posts_for_style>\nMatch the voice, rhythm and depth of these posts he approved and published. Do not reuse their content.\n${input.examples.map((e) => `<post title="${e.title.replace(/"/g, "'")}">\n${e.markdown}\n</post>`).join('\n')}\n</his_published_posts_for_style>`
    : '';
  return callTool<Written>({
    system: `${WRITER_CONTEXT}${learned(input.profile)}

You write his blog post from his outline and his original notebook entry.

${WRITING_CRAFT}

Structure:
- Write prose for every block id in the outline, in its place, in reading order: intro, each point (and its forks), outro, conclusion.
- Headings: for each point and fork, return a heading a good editor would print: short, specific, alive, in his voice. It may keep his wording if it already works as a heading. Never put the heading's words at the start of the prose beneath it.
- title: a strong, clear title in his voice that a reader would click and a search engine would understand. Keep his working title if it is already good.
- The intro earns the reader's attention and sets up the question the piece answers. It does not summarise the points.
- The outro turns from the teaching toward the landing.
- The conclusion lands the plane: it draws everything together and makes one final application. End where his thought ends; no tidy moral tacked on.
- If a block's cue is empty and the source has nothing for it, return an empty body.
- Fix the listed issues. US English spelling and punctuation throughout.`,
    user: `<original_source>
${input.transcript}
</original_source>

<outline_cues>
${input.outline}
</outline_cues>${examples}

<issues_to_fix>
${input.notes || 'None noted.'}
</issues_to_fix>

Write the full post. Return the title, a heading and prose for each block id, a one- or two-sentence excerpt in his voice (for the blog's list page), and 1–4 short lowercase tags.`,
    toolName: 'save_writing',
    toolDescription: 'Save the finished post, block by block.',
    schema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        blocks: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              heading: { type: 'string', description: 'Printed heading for point and fork blocks; empty for intro, outro and conclusion.' },
              body_markdown: { type: 'string', description: 'Markdown paragraphs; no headings.' },
            },
            required: ['id', 'body_markdown'],
          },
        },
        excerpt: { type: 'string' },
        tags: { type: 'array', items: { type: 'string' }, maxItems: 4 },
      },
      required: ['title', 'blocks', 'excerpt', 'tags'],
    },
    maxTokens: 32000,
  });
}

// ---------- Humanizer: five checks ----------

export const CHECKS = [
  { key: 'ai', name: 'AI detection', gate: true, what: 'How completely human the writing reads. 100 = nothing would make a perceptive reader suspect a machine wrote or polished it. Deduct for the AI-writing tells.' },
  { key: 'flow', name: 'Natural flow and grammar', gate: true, what: 'Typos, grammar, wrong words, broken or clumsy sentences, words too grand or too plain for the moment. Every British spelling or punctuation habit (colour, realise, single quotation marks, punctuation outside quotes) is a flag: the post must be in US English.' },
  { key: 'argument', name: 'Argument and progression', gate: true, what: 'Does the teaching build? Ideas in a sensible sequence, each point expanding the last, moving toward the conclusion. Deduct for everything dumped at the start, a bloated middle, repetition, or a conclusion that does not land.' },
  { key: 'voice', name: 'Sounds like Kobus', gate: true, what: 'Compared with his own spoken words in the transcript: his vocabulary, rhythm, directness and idioms (spelling is judged under flow, not here). Deduct wherever it sounds like someone else or like a polished writer he is not.' },
  { key: 'seo', name: 'SEO and AI search', gate: false, what: 'Advisory only. Is the title clear and findable, is the topic plain from the first paragraph, would a search engine or AI assistant know what question this answers? Suggest, never demand keyword stuffing.' },
] as const;

export type HumanizerOut = {
  checks: { key: string; score: number; summary: string; flags: { quote: string; issue: string; fix?: string }[] }[];
  summary: string;
};

export async function humanize(title: string, articleMarkdown: string, transcript: string, profile?: string): Promise<HumanizerOut> {
  return callTool<HumanizerOut>({
    system: `${WRITER_CONTEXT}${learned(profile)}

You are the Humanizer: the last, strict and fair reader before a post goes public. You do not rewrite the piece; you point at exact passages and offer a fix in his voice.

Score each check from 0 to 100:
${CHECKS.map((c) => `- ${c.key} (${c.name}): ${c.what}`).join('\n')}

AI-writing tells:
${AI_TELLS}

Plain, simple or unpolished writing reads as human; do not deduct for it. For every deduction add a flag: the exact passage copied verbatim from the post (short, so it can be found), the problem in plain words, and a fix: replacement text for exactly that passage, in his voice. Do not flag matters of taste, and do not flag anything the learned profile says he deliberately does. Flag an outline line copied as prose as an argument and AI issue. Scores must match the flags: a clean check scores in the 90s.`,
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

// ---------- Fixing flagged issues ----------

export type Unit = { id: string; kind: 'title' | 'heading' | 'body'; label: string; text: string };
export type Edit = { unit: string; find: string; replace: string };
export type FixOut = { edits: Edit[]; note: string };

/** Fixes only the named issues with the smallest edits that do the job. */
export async function fixIssues(input: {
  title: string;
  units: Unit[];
  issues: { check: string; quote: string; issue: string; fix?: string }[];
  transcript: string;
  profile?: string;
}): Promise<FixOut> {
  return callTool<FixOut>({
    system: `${WRITER_CONTEXT}${learned(input.profile)}

You are his editor fixing specific problems a reviewer flagged in his post. Fix ONLY the listed issues. Leave every other word alone.

${WRITING_CRAFT}

How to edit:
- The post is given as units (title, headings, body blocks in Markdown), each with an id.
- Return edits. Each edit names a unit id, a "find" string copied EXACTLY, character for character, from that unit's text (long enough to be unique there, short enough to be precise), and the "replace" text.
- For a heading or the title, "find" is the whole heading or title.
- An issue about a whole section (flow, argument, a copied outline line) may need a rewritten paragraph: then "find" is that whole paragraph.
- Keep his voice. Keep Markdown bold/italic and image lines intact. Do not add headings inside body units.
- If an issue cannot be fixed without his input (a fact only he knows), make no edit for it and say so in note.
- An issue marked "Kobus's instruction" is a direct instruction from him. Carry it out completely, in every unit it applies to, even if that takes many edits (for example: capitalize every pronoun that refers to Christ). When one "find" string occurs several times in a unit, return one edit per occurrence; they are applied in order, each to the first remaining match.
- Leave <aside class="pull-quote"> lines (his pull quotes) as they are unless an issue is about one.`,
    user: `<his_own_words_for_reference>
${input.transcript.slice(0, 60000)}
</his_own_words_for_reference>

<post_units>
${input.units.map((u) => `<unit id="${u.id}" kind="${u.kind}" label="${u.label}">\n${u.text}\n</unit>`).join('\n')}
</post_units>

<issues_to_fix>
${input.issues.map((f, i) => `${i + 1}. [${f.check}] at "${f.quote}": ${f.issue}${f.fix ? ` (reviewer's suggestion: ${f.fix})` : ''}`).join('\n')}
</issues_to_fix>

Return the edits and a one-sentence note to Kobus on what you changed (or could not).`,
    toolName: 'save_edits',
    toolDescription: 'Save the edits that fix the issues.',
    schema: {
      type: 'object',
      properties: {
        edits: {
          type: 'array',
          items: {
            type: 'object',
            properties: { unit: { type: 'string' }, find: { type: 'string' }, replace: { type: 'string' } },
            required: ['unit', 'find', 'replace'],
          },
        },
        note: { type: 'string' },
      },
      required: ['edits', 'note'],
    },
    maxTokens: 32000,
  });
}

// ---------- Learning: the weekly self-improvement pass ----------

export type LearnOut = { profile: string; changes: string };

export const PROFILE_SECTIONS = `## Voice and style
## Words and phrases he uses (and ones he never would)
## How he builds a piece (openings, argument, applications, landings)
## Theology and how he teaches the Bible
## Business, real estate and money
## Family, relationships and how he speaks to people
## Life story and recurring examples (facts he has stated about himself)
## What he changes in AI drafts (editing lessons)
## Humanizer calibration (what not to flag; what matters most to him)`;

export async function learnVoice(input: { profile: string; evidence: string }): Promise<LearnOut> {
  return callTool<LearnOut>({
    system: `${WRITER_CONTEXT}

You maintain the living profile the writing app uses to write, outline, check and fix Kobus's work. Every week you read new evidence and improve the profile, so the app becomes more like him over time.

Method:
- Evidence ranks: his direct instructions to the AI (treat these as standing rules) > his own words (sources) > changes he made to AI output (strongest signal of what the AI gets wrong) > published posts > Humanizer results and dismissed flags (a dismissed flag means the reviewer was wrong for him).
- Keep what is still true, sharpen what the new evidence refines, add what is new, and remove what the evidence contradicts.
- Every line must be specific and useful to a writer: concrete habits, actual phrases, beliefs as he states them, examples he returns to. No flattery, no generic writing advice, no guesses about his inner life.
- Record only what the evidence shows. Mark anything seen only once as "(seen once)".
- Keep it under about 2,500 words, in these sections:
${PROFILE_SECTIONS}`,
    user: `<current_profile>
${input.profile || '(empty: this is the first pass; build it from the evidence)'}
</current_profile>

<new_evidence>
${input.evidence}
</new_evidence>

Return the complete updated profile (Markdown) and a short list of what changed this week.`,
    toolName: 'save_profile',
    toolDescription: 'Save the updated profile.',
    schema: {
      type: 'object',
      properties: { profile: { type: 'string' }, changes: { type: 'string' } },
      required: ['profile', 'changes'],
    },
    maxTokens: 16000,
  });
}
