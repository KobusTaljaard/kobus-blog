import { sql } from './db';
import { learnVoice } from './ai';
import { htmlToMarkdown } from './html';

/** The latest learned profile of Kobus, injected into every AI prompt. */
export async function getProfile(): Promise<string> {
  try {
    const [v] = await sql`select profile from app.voice order by created_at desc limit 1`;
    return v?.profile || '';
  } catch {
    return '';
  }
}

/** Records one step of the work so the weekly pass can learn from it. Never blocks the work. */
export async function logIteration(kind: string, data: { postId?: string | null; sourceId?: string | null; content?: string; meta?: unknown }) {
  try {
    await sql`insert into app.iterations (post_id, source_id, kind, content, meta)
      values (${data.postId || null}, ${data.sourceId || null}, ${kind}, ${data.content || ''}, ${JSON.stringify(data.meta ?? {})}::jsonb)`;
  } catch {
    /* learning is best-effort */
  }
}

/** Published posts to show the writer as style examples (most recent first). */
export async function styleExamples(limit = 2): Promise<{ title: string; markdown: string }[]> {
  const rows = await sql`select published_title, published_html from app.posts
    where status = 'published' and published_html is not null order by published_at desc limit ${limit}`;
  return rows.map((r) => ({ title: r.published_title || '', markdown: htmlToMarkdown(r.published_html).slice(0, 12000) }));
}

const cap = (s: string, n: number) => (s.length > n ? s.slice(0, n) + '\n…' : s);

/** Reads everything since the last pass (or everything, the first time) and improves the profile. */
export async function runLearning(by: 'cron' | 'manual' = 'cron') {
  const [last] = await sql`select profile from app.voice order by created_at desc limit 1`;
  // Evidence is counted from the last learning pass; his own edits to the profile don't reset it.
  const [pass] = await sql`select created_at from app.voice where by <> 'kobus' order by created_at desc limit 1`;
  const since = pass?.created_at || '1970-01-01';

  const sources = await sql`select filename, content, created_at from app.sources where created_at > ${since} order by created_at`;
  const its = await sql`select i.kind, i.content, i.meta, i.created_at, p.title from app.iterations i
    left join app.posts p on p.id = i.post_id where i.created_at > ${since} order by i.post_id, i.created_at`;
  const published = await sql`select published_title, published_html from app.posts
    where status = 'published' and published_at > ${since} order by published_at`;
  // The first pass also reads every earlier published post.
  const older = pass ? [] : await sql`select published_title, published_html from app.posts where status = 'published' and published_at <= ${since}`;

  if (!sources.length && !its.length && !published.length && !older.length) return { skipped: true as const };

  const parts: string[] = [];
  for (const s of sources) parts.push(`<source file="${s.filename}">\n${cap(s.content, 40000)}\n</source>`);
  for (const p of [...older, ...published]) parts.push(`<published_post title="${p.published_title}">\n${cap(htmlToMarkdown(p.published_html || ''), 20000)}\n</published_post>`);

  // Pair each AI draft with what he later ran through the Humanizer or published: the difference is his editing.
  const byPost = new Map<string, typeof its>();
  for (const i of its) {
    const k = i.title || '(untitled)';
    if (!byPost.has(k)) byPost.set(k, []);
    byPost.get(k)!.push(i);
  }
  for (const [title, list] of byPost) {
    const lines: string[] = [];
    for (const i of list) {
      if (['ai_outline', 'outline_final', 'ai_draft', 'before_rewrite', 'checked_text', 'published'].includes(i.kind)) {
        lines.push(`<${i.kind}>\n${cap(i.content, 15000)}\n</${i.kind}>`);
      } else if (i.kind === 'humanizer') {
        lines.push(`<humanizer_scores>${JSON.stringify(i.meta)}</humanizer_scores>`);
      } else if (i.kind === 'ai_fix') {
        lines.push(`<ai_fix accepted>${JSON.stringify(i.meta)}</ai_fix>`);
      } else if (i.kind === 'dismissed') {
        lines.push(`<flag_dismissed_by_kobus>${JSON.stringify(i.meta)}</flag_dismissed_by_kobus>`);
      } else if (i.kind === 'instruction') {
        lines.push(`<kobus_instructed_the_ai>${JSON.stringify(i.meta)}</kobus_instructed_the_ai>`);
      } else if (i.kind === 'pull_quote') {
        lines.push(`<kobus_made_a_pull_quote>${JSON.stringify(i.meta)}</kobus_made_a_pull_quote>`);
      } else if (i.kind === 'profile_edit') {
        lines.push(`<kobus_edited_the_profile_himself>${cap(i.content, 8000)}</kobus_edited_the_profile_himself>`);
      }
    }
    parts.push(`<piece title="${title}">\nIn order. ai_outline = what the AI proposed; outline_final = the outline after his edits; ai_draft = what the AI wrote; checked_text / published = the text after his own editing.\n${lines.join('\n')}\n</piece>`);
  }

  const evidence = cap(parts.join('\n\n'), 400000);
  const out = await learnVoice({ profile: last?.profile || '', evidence });
  if (!out.profile?.trim()) throw new Error('The learning pass returned an empty profile.');
  await sql`insert into app.voice (profile, changes, by) values (${out.profile.trim()}, ${out.changes || ''}, ${by})`;
  return { skipped: false as const, changes: out.changes };
}
