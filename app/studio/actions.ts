'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireOwner } from '@/lib/auth/server';
import { sql, CHECK_MIN, OVERALL_MIN, type Post, type HumanizerResult } from '@/lib/db';
import { findThemes, outlineTheme, writeFromOutline, humanize, fixIssues, CHECKS, MODEL, type Unit } from '@/lib/ai';
import { getProfile, logIteration, styleExamples, runLearning } from '@/lib/learn';
import { norm, quoteText } from '@/lib/rules';
import { cleanHtml, contentHash, htmlToMarkdown, markdownToHtml, slugify } from '@/lib/html';
import { compileHtml, docOf, normaliseDoc, outlineText, draftText, type Doc } from '@/lib/doc';

function refreshPublic(slug?: string | null) {
  revalidatePath('/writing');
  if (slug) revalidatePath(`/writing/${slug}`);
}

async function getPost(id: string): Promise<Post> {
  const rows = await sql`select * from app.posts where id = ${id}`;
  if (!rows[0]) throw new Error('Post not found.');
  return rows[0] as Post;
}


// ---------- Original sources → themes ----------

async function discoverThemes(sourceId: string, content: string) {
  try {
    const found = await findThemes(content, await getProfile());
    await sql`update app.sources set analysis = ${JSON.stringify({ notes: found.notes })}::jsonb where id = ${sourceId}`;
    await sql`delete from app.themes where source_id = ${sourceId} and status in ('proposed', 'removed', 'merged')
              and post_id is null`;
    let i = 0;
    for (const t of found.themes) {
      await sql`insert into app.themes (source_id, name, summary, quotes, main, sort)
                values (${sourceId}, ${t.name.trim()}, ${t.summary.trim()}, ${(t.quotes || []).slice(0, 3)}, ${!!t.main}, ${i++})`;
    }
    return { ok: true as const };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await sql`update app.sources set analysis = ${JSON.stringify({ error: message })}::jsonb where id = ${sourceId}`;
    return { ok: false as const, error: message };
  }
}

export async function uploadSource(_prev: unknown, formData: FormData) {
  await requireOwner();
  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) return { error: 'Choose a transcript file first.' };
  if (file.size > 2_000_000) return { error: 'That file is too large for a transcript.' };
  const content = (await file.text()).trim();
  if (!content) return { error: 'That file is empty.' };
  const [src] = await sql`insert into app.sources (filename, content) values (${file.name}, ${content}) returning id`;
  const result = await discoverThemes(src.id, content);
  if (!result.ok) return { error: `Saved, but finding the themes failed: ${result.error}. Open the source and try again.` };
  redirect(`/studio/themes/${src.id}`);
}

/** Finds the themes again (replaces any you haven't outlined yet). */
export async function reanalyseSource(id: string) {
  await requireOwner();
  const [src] = await sql`select content from app.sources where id = ${id}`;
  if (!src) return { error: 'Source not found.' };
  const result = await discoverThemes(id, src.content);
  if (!result.ok) return { error: result.error };
  redirect(`/studio/themes/${id}`);
}

// ---------- Themes: keep, remove, merge, outline ----------

export async function setThemeRemoved(id: string, removed: boolean) {
  await requireOwner();
  await sql`update app.themes set status = ${removed ? 'removed' : 'proposed'} where id = ${id} and status in ('proposed','removed')`;
  const [t] = await sql`select source_id from app.themes where id = ${id}`;
  if (t) revalidatePath(`/studio/themes/${t.source_id}`);
}

/** The first id leads: the merged theme takes its name; the rest fold into it. */
export async function mergeThemes(ids: string[]) {
  await requireOwner();
  if (ids.length < 2) return { error: 'Tick at least two themes to merge.' };
  const rows = await sql`select * from app.themes where id = any(${ids}::uuid[]) and status = 'proposed'`;
  if (rows.length !== ids.length) return { error: 'One of those themes is no longer available.' };
  const lead = rows.find((r) => r.id === ids[0])!;
  const rest = ids.slice(1).map((id) => rows.find((r) => r.id === id)!);
  // A merged theme can itself be merged again: flatten its members.
  const members = [lead, ...rest].flatMap((r) => (r.members?.length ? r.members : [r.id]));
  const [m] = await sql`insert into app.themes (source_id, name, summary, quotes, main, members, sort)
    values (${lead.source_id}, ${lead.name}, ${lead.summary}, ${[...lead.quotes, ...rest.flatMap((r) => r.quotes)].slice(0, 4)},
            ${rows.some((r) => r.main)}, ${members}::uuid[], ${lead.sort}) returning id`;
  await sql`update app.themes set status = 'merged' where id = any(${ids}::uuid[])`;
  // Merged-away merges are no longer needed once their members move to the new one.
  await sql`delete from app.themes where id = any(${ids}::uuid[]) and cardinality(members) > 0`;
  revalidatePath(`/studio/themes/${lead.source_id}`);
  return { ok: true, id: m.id };
}

export async function unmergeTheme(id: string) {
  await requireOwner();
  const [t] = await sql`select * from app.themes where id = ${id} and cardinality(members) > 0 and status = 'proposed'`;
  if (!t) return { error: 'That theme cannot be split.' };
  await sql`update app.themes set status = 'proposed' where id = any(${t.members}::uuid[])`;
  await sql`delete from app.themes where id = ${id}`;
  revalidatePath(`/studio/themes/${t.source_id}`);
  return { ok: true };
}

/** One outline per chosen theme, made side by side. */
export async function makeOutlines(ids: string[]) {
  await requireOwner();
  if (!ids.length) return { error: 'Tick at least one theme.' };
  const chosen = await sql`select * from app.themes where id = any(${ids}::uuid[])
    and (status = 'proposed' or (status = 'outlined' and post_id is null))`;
  if (!chosen.length) return { error: 'Those themes are no longer available.' };
  const sourceId = chosen[0].source_id;
  const [src] = await sql`select content, analysis from app.sources where id = ${sourceId}`;
  const all = await sql`select id, name, summary, status, members from app.themes where source_id = ${sourceId}`;
  const byId = new Map(all.map((t) => [t.id, t]));
  const profile = await getProfile();

  const results = await Promise.allSettled(
    chosen.map(async (t) => {
      const absorbedIds: string[] = (t.members || []).slice(1);
      const lead = t.members?.length ? byId.get(t.members[0]) || t : t;
      const mine = new Set([t.id, ...(t.members || [])]);
      const others = all.filter((o) => !mine.has(o.id) && !(o.members?.length));
      const outline = await outlineTheme({
        transcript: src.content,
        theme: { name: lead.name, summary: lead.summary },
        absorbed: absorbedIds.map((i) => byId.get(i)).filter(Boolean).map((a: any) => ({ name: a.name, summary: a.summary })),
        others: others.map((o) => ({ name: o.name, summary: o.summary })),
        notes: src.analysis?.notes || '',
        profile,
      });
      const doc = normaliseDoc(outline, t.name);
      const [post] = await sql`insert into app.posts (source_id, theme, title, doc, notes, status)
        values (${sourceId}, ${t.name}, ${doc.title.text}, ${JSON.stringify(doc)}::jsonb, ${src.analysis?.notes || ''}, 'outline')
        returning id`;
      await sql`update app.themes set status = 'outlined', post_id = ${post.id} where id = ${t.id}`;
      await logIteration('ai_outline', { postId: post.id, sourceId, content: outlineText(doc) });
      return post.id as string;
    }),
  );
  revalidatePath(`/studio/themes/${sourceId}`);
  const failed = results.filter((r) => r.status === 'rejected') as PromiseRejectedResult[];
  const made = results.filter((r) => r.status === 'fulfilled') as PromiseFulfilledResult<string>[];
  if (failed.length && !made.length) return { error: `The outlines could not be made: ${failed[0].reason?.message || failed[0].reason}` };
  if (made.length === 1 && !failed.length) redirect(`/studio/outlines/${made[0].value}`);
  if (!failed.length) redirect('/studio/outlines');
  return { error: `${made.length} outline(s) made; ${failed.length} failed. Try those again.` };
}

export async function deleteSource(id: string) {
  await requireOwner();
  const [{ n }] = await sql`select count(*)::int as n from app.posts where source_id = ${id}`;
  if (n > 0) return { error: 'Outlines still come from this source. Delete them first.' };
  await sql`delete from app.sources where id = ${id}`;
  revalidatePath('/studio/sources');
  return { ok: true };
}

// ---------- The shared outline / writing document (autosaved) ----------

export async function saveDoc(id: string, input: Doc) {
  await requireOwner();
  const doc = normaliseDoc(input);
  const clean = (b: { body: string }) => (b.body = b.body ? cleanHtml(b.body) : '');
  clean(doc.intro);
  doc.points.forEach((p) => {
    clean(p);
    p.forks.forEach(clean);
  });
  clean(doc.outro);
  clean(doc.conclusion);
  const body = compileHtml(doc);
  const title = doc.title.text.trim();
  await sql`update app.posts set doc = ${JSON.stringify(doc)}::jsonb, title = ${title}, body_html = ${body},
            updated_at = now() where id = ${id}`;
  return { ok: true, hash: contentHash(title, body) };
}

export async function writeIt(id: string) {
  await requireOwner();
  const post = await getPost(id);
  const doc = docOf(post);
  const [src] = post.source_id ? await sql`select content from app.sources where id = ${post.source_id}` : [];
  // Keep the outline cue for every block before the writer gives it a printed heading.
  const cueOf = (b: { text: string; cue?: string }) => b.cue || b.text;
  const cues = JSON.stringify(
    {
      working_title: doc.title.text,
      title_applications: doc.title.apps,
      blocks: [
        { id: doc.intro.id, role: 'intro', cue: doc.intro.text, applications: doc.intro.apps },
        ...doc.points.flatMap((p, i) => [
          { id: p.id, role: `point ${i + 1}`, cue: cueOf(p), applications: p.apps },
          ...p.forks.map((f, j) => ({ id: f.id, role: `point ${i + 1}, fork ${j + 1}`, cue: cueOf(f), applications: f.apps })),
        ]),
        { id: doc.outro.id, role: 'outro', cue: doc.outro.text, applications: doc.outro.apps },
        { id: doc.conclusion.id, role: 'conclusion', cue: doc.conclusion.text, applications: doc.conclusion.apps },
      ],
    },
    null,
    1,
  );
  await logIteration('outline_final', { postId: id, sourceId: post.source_id, content: outlineText(doc) });
  const before = draftText(doc);
  if (before.trim()) await logIteration('before_rewrite', { postId: id, sourceId: post.source_id, content: before });
  try {
    const [profile, examples] = await Promise.all([getProfile(), styleExamples(2)]);
    const w = await writeFromOutline({ transcript: src?.content || '', outline: cues, notes: post.notes || '', profile, examples });
    const byId = new Map(w.blocks.map((b) => [b.id, b]));
    const fill = (b: { id: string; body: string; text: string; cue?: string }, headed: boolean) => {
      const got = byId.get(b.id);
      if (!got) return;
      b.body = markdownToHtml(got.body_markdown || '');
      if (headed && got.heading?.trim() && got.heading.trim() !== b.text.trim()) {
        b.cue = cueOf(b);
        b.text = got.heading.trim();
      }
    };
    fill(doc.intro, false);
    doc.points.forEach((p) => {
      fill(p, true);
      p.forks.forEach((f) => fill(f, !!f.text.trim()));
    });
    fill(doc.outro, false);
    fill(doc.conclusion, false);
    if (w.title?.trim()) {
      if (w.title.trim() !== doc.title.text.trim()) doc.title.cue = cueOf(doc.title);
      doc.title.text = w.title.trim();
    }
    const body = compileHtml(doc);
    const tags = (w.tags || []).map((t) => t.trim().toLowerCase()).filter(Boolean).slice(0, 4);
    await sql`update app.posts set doc = ${JSON.stringify(doc)}::jsonb, body_html = ${body}, title = ${doc.title.text.trim()},
              status = case when status = 'outline' then 'draft' else status end,
              excerpt = case when excerpt = '' then ${(w.excerpt || '').trim()} else excerpt end,
              tags = case when cardinality(tags) = 0 then ${tags} else tags end,
              updated_at = now() where id = ${id}`;
    await logIteration('ai_draft', { postId: id, sourceId: post.source_id, content: draftText(doc) });
  } catch (e) {
    return { error: `The writing could not be done: ${e instanceof Error ? e.message : e}` };
  }
  revalidatePath(`/studio/writing/${id}`);
  revalidatePath(`/studio/outlines/${id}`);
  return { ok: true };
}

// ---------- Humanizer ----------

export async function runHumanizer(id: string) {
  await requireOwner();
  const post = await getPost(id);
  if (!post.title.trim() || !post.body_html.trim()) return { error: 'Write the piece first.' };
  const [src] = post.source_id ? await sql`select content from app.sources where id = ${post.source_id}` : [];
  try {
    const raw = await humanize(post.title, htmlToMarkdown(post.body_html), src?.content || '', await getProfile());
    const checks = CHECKS.map((c) => {
      const r = raw.checks.find((x) => x.key === c.key);
      return {
        key: c.key,
        name: c.name,
        gate: c.gate,
        score: Math.max(0, Math.min(100, Math.round(r?.score ?? 0))),
        summary: r?.summary || '',
        flags: (r?.flags || []).filter((f) => f.quote && f.issue),
      };
    });
    const core = checks.filter((c) => c.gate);
    const overall = Math.round(core.reduce((n, c) => n + c.score, 0) / core.length);
    const result: HumanizerResult = {
      checks,
      summary: raw.summary || '',
      overall,
      passed: overall >= OVERALL_MIN && core.every((c) => c.score >= CHECK_MIN),
      model: MODEL,
    };
    const hash = contentHash(post.title, post.body_html);
    await sql`update app.posts set qc = ${JSON.stringify(result)}::jsonb, qc_hash = ${hash}, qc_at = now(), qc_dismissed = '{}' where id = ${id}`;
    await logIteration('checked_text', { postId: id, sourceId: post.source_id, content: `# ${post.title}\n\n${htmlToMarkdown(post.body_html)}` });
    await logIteration('humanizer', {
      postId: id,
      sourceId: post.source_id,
      meta: { overall, checks: checks.map((c) => ({ check: c.name, score: c.score, flags: c.flags.map((f) => f.issue) })) },
    });
    return { ok: true, result, hash };
  } catch (e) {
    return { error: `The Humanizer could not run: ${e instanceof Error ? e.message : e}` };
  }
}

const escHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Replaces the flagged passage with the suggested fix, wherever it sits in the piece. */
export async function applyFix(id: string, quote: string, fix: string) {
  await requireOwner();
  const post = await getPost(id);
  const doc = docOf(post);
  const needles = [quote, escHtml(quote)];
  const tryBlock = (b: { body: string; text?: string }) => {
    for (const n of needles) {
      if (n && b.body.includes(n)) {
        b.body = b.body.replace(n, escHtml(fix));
        return true;
      }
    }
    return false;
  };
  const blocks = [doc.intro, ...doc.points.flatMap((p) => [p, ...p.forks]), doc.outro, doc.conclusion];
  let done = blocks.some(tryBlock);
  if (!done) {
    for (const b of [doc.title, ...doc.points, ...doc.points.flatMap((p) => p.forks)]) {
      if (b.text.includes(quote)) {
        b.text = b.text.replace(quote, fix);
        done = true;
        break;
      }
    }
  }
  if (!done) return { error: 'That passage has changed since the check, so it could not be found. Edit it in Writing.' };
  const r = await saveDoc(id, doc);
  return { ok: true, hash: r.hash, doc };
}

// ---------- AI fixes and dismissals ----------

type FlagIn = { check: string; quote: string; issue: string; fix?: string };

/** The piece as editable units: title, headings and each body in Markdown. */
function unitsOf(doc: Doc): Unit[] {
  const units: Unit[] = [{ id: 'title', kind: 'title', label: 'Title', text: doc.title.text }];
  const body = (id: string, label: string, html: string) => {
    if (html.trim()) units.push({ id: `b:${id}`, kind: 'body', label, text: htmlToMarkdown(html) });
  };
  body(doc.intro.id, 'Intro', doc.intro.body);
  doc.points.forEach((p, i) => {
    if (p.text.trim()) units.push({ id: `h:${p.id}`, kind: 'heading', label: `Point ${i + 1} heading`, text: p.text });
    body(p.id, `Point ${i + 1}`, p.body);
    p.forks.forEach((f, j) => {
      if (f.text.trim()) units.push({ id: `h:${f.id}`, kind: 'heading', label: `Point ${i + 1}, fork ${j + 1} heading`, text: f.text });
      body(f.id, `Point ${i + 1}, fork ${j + 1}`, f.body);
    });
  });
  body(doc.outro.id, 'Outro', doc.outro.body);
  body(doc.conclusion.id, 'Conclusion', doc.conclusion.body);
  return units;
}

/** Replaces `find` in `text`, tolerating curly quotes and dashes. Null if it isn't there. */
function replaceIn(text: string, find: string, replace: string): string | null {
  if (!find) return null;
  let at = text.indexOf(find);
  if (at < 0) at = norm(text).indexOf(norm(find));
  if (at < 0) return null;
  return text.slice(0, at) + replace + text.slice(at + find.length);
}

/** Lets the AI fix one flagged issue, or several at once, with the smallest edits that do it. */
export async function aiFix(id: string, flags: FlagIn[]) {
  await requireOwner();
  if (!flags.length) return { error: 'Nothing to fix.' };
  const post = await getPost(id);
  const doc = docOf(post);
  const [src] = post.source_id ? await sql`select content from app.sources where id = ${post.source_id}` : [];
  let out;
  try {
    out = await fixIssues({ title: doc.title.text, units: unitsOf(doc), issues: flags, transcript: src?.content || '', profile: await getProfile() });
  } catch (e) {
    return { error: `The fix could not be made: ${e instanceof Error ? e.message : e}` };
  }
  const blocks = new Map<string, { text: string; body: string }>();
  blocks.set(doc.intro.id, doc.intro);
  blocks.set(doc.outro.id, doc.outro);
  blocks.set(doc.conclusion.id, doc.conclusion);
  doc.points.forEach((p) => {
    blocks.set(p.id, p);
    p.forks.forEach((f) => blocks.set(f.id, f));
  });
  const md = new Map<string, string>(); // body edits are made in Markdown, then turned back into HTML once
  let applied = 0;
  const missed: string[] = [];
  for (const e of out.edits || []) {
    if (e.unit === 'title') {
      const r = replaceIn(doc.title.text, e.find, e.replace) ?? (e.find.trim() ? null : e.replace);
      if (r === null) { missed.push(e.find); continue; }
      doc.title.text = r.trim();
      applied++;
    } else if (e.unit.startsWith('h:')) {
      const b = blocks.get(e.unit.slice(2));
      const r = b ? replaceIn(b.text, e.find, e.replace) : null;
      if (!b || r === null) { missed.push(e.find); continue; }
      b.text = r.trim();
      applied++;
    } else if (e.unit.startsWith('b:')) {
      const key = e.unit.slice(2);
      const b = blocks.get(key);
      if (!b) { missed.push(e.find); continue; }
      const cur = md.get(key) ?? htmlToMarkdown(b.body);
      const r = replaceIn(cur, e.find, e.replace);
      if (r === null) { missed.push(e.find); continue; }
      md.set(key, r);
      applied++;
    }
  }
  for (const [key, text] of md) blocks.get(key)!.body = markdownToHtml(text);
  if (!applied) return { error: out.note || 'The AI could not find a safe edit for that. Fix it by hand in Writing.' };
  const r = await saveDoc(id, doc);
  await logIteration('ai_fix', { postId: id, sourceId: post.source_id, meta: { issues: flags, edits: out.edits, note: out.note } });
  return { ok: true, applied, missed: missed.length, note: out.note, hash: r.hash };
}

/** Your own instruction to the AI, for the whole piece or about one flagged passage. */
export async function aiInstruct(id: string, instruction: string, flag?: FlagIn) {
  await requireOwner();
  const what = instruction.trim();
  if (!what) return { error: 'Tell the AI what to do first.' };
  const issue: FlagIn = flag
    ? { check: "Kobus's instruction", quote: flag.quote, issue: `${what} (This is about a passage the reviewer flagged for: ${flag.issue})` }
    : { check: "Kobus's instruction", quote: '(the whole post)', issue: what };
  const r = await aiFix(id, [issue]);
  const [p] = await sql`select source_id from app.posts where id = ${id}`;
  await logIteration('instruction', { postId: id, sourceId: p?.source_id, meta: { instruction: what, about: flag ? quoteText(flag.quote) : null, done: 'ok' in r } });
  return r;
}

/** Lifts a flagged sentence out of the text into a pull quote placed after its paragraph. */
export async function makePullQuote(id: string, flag: FlagIn) {
  await requireOwner();
  const post = await getPost(id);
  const doc = docOf(post);
  const q = quoteText(flag.quote);
  const blocks = [doc.intro, ...doc.points.flatMap((p) => [p, ...p.forks]), doc.outro, doc.conclusion];
  let done = false;
  for (const b of blocks) {
    if (!b.body.trim()) continue;
    const md = htmlToMarkdown(b.body);
    let at = md.indexOf(q);
    if (at < 0) at = norm(md).indexOf(norm(q));
    if (at < 0) continue;
    const end = md.indexOf('\n\n', at + q.length);
    const cut = end < 0 ? md.length : end;
    const before = md.slice(0, at);
    const rest = md.slice(at + q.length, cut);
    const para = (before + rest).replace(/ {2,}/g, ' ').replace(/ ([,.;:!?])/g, '$1').replace(/[,;:]([.!?])/g, '$1');
    const next = `${para.trim() ? para + '\n\n' : ''}<aside class="pull-quote">${escHtml(q)}</aside>${md.slice(cut)}`;
    b.body = markdownToHtml(next);
    done = true;
    break;
  }
  if (!done) return { error: 'That passage could not be found. In Writing, select the words and press "Pull quote".' };
  const r = await saveDoc(id, doc);
  await sql`update app.posts set qc_dismissed = array_append(qc_dismissed, ${flag.quote}) where id = ${id}`;
  await logIteration('pull_quote', { postId: id, sourceId: post.source_id, meta: { quote: q, flagged_for: flag.issue } });
  return { ok: true, hash: r.hash };
}

/** The picture at the top of the post and on shared links. */
export async function setFeatured(id: string, imageId: string | null) {
  await requireOwner();
  const [row] = await sql`update app.posts set featured_image_id = ${imageId}, updated_at = now() where id = ${id} returning status, slug`;
  if (row?.status === 'published') refreshPublic(row.slug);
  return { ok: true };
}

/** "Leave it": the reviewer was wrong about this one. The weekly pass learns from it. */
export async function dismissFlag(id: string, flag: FlagIn) {
  await requireOwner();
  await sql`update app.posts set qc_dismissed = array_append(qc_dismissed, ${flag.quote}) where id = ${id}`;
  const [p] = await sql`select source_id from app.posts where id = ${id}`;
  await logIteration('dismissed', { postId: id, sourceId: p?.source_id, meta: { check: flag.check, quote: quoteText(flag.quote), issue: flag.issue } });
  return { ok: true };
}

// ---------- Voice: what the app has learned ----------

export async function saveProfile(text: string) {
  await requireOwner();
  const clean = text.trim();
  if (!clean) return { error: 'The profile is empty.' };
  await sql`insert into app.voice (profile, changes, by) values (${clean}, 'Edited by Kobus', 'kobus')`;
  await logIteration('profile_edit', { content: clean });
  revalidatePath('/studio/voice');
  return { ok: true };
}

export async function learnNow() {
  await requireOwner();
  try {
    const r = await runLearning('manual');
    revalidatePath('/studio/voice');
    return r.skipped ? { error: 'Nothing new to learn from since the last pass.' } : { ok: true, changes: r.changes };
  } catch (e) {
    return { error: `Learning failed: ${e instanceof Error ? e.message : e}` };
  }
}

export async function savePublishDetails(
  id: string,
  data: { excerpt: string; tags: string[]; featured_image_id: string | null },
) {
  await requireOwner();
  const tags = data.tags.map((t) => t.trim().toLowerCase()).filter(Boolean).slice(0, 8);
  const [row] = await sql`update app.posts set excerpt = ${data.excerpt.trim()}, tags = ${tags},
            featured_image_id = ${data.featured_image_id}, updated_at = now() where id = ${id} returning status, slug`;
  if (row?.status === 'published') refreshPublic(row.slug);
  return { ok: true };
}

export async function uploadImage(formData: FormData) {
  await requireOwner();
  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) return { error: 'No image received.' };
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return { error: 'Use a JPEG, PNG or WebP image.' };
  if (file.size > 5_000_000) return { error: 'Image is too large.' };
  const b64 = Buffer.from(await file.arrayBuffer()).toString('base64');
  const width = Number(formData.get('width')) || null;
  const height = Number(formData.get('height')) || null;
  const [row] = await sql`insert into app.images (content_type, data, width, height)
                          values (${file.type}, decode(${b64}, 'base64'), ${width}, ${height}) returning id`;
  return { id: row.id as string };
}

/** Publishes, or updates the live copy of an already published post. */
export async function publish(id: string) {
  await requireOwner();
  const post = await getPost(id);
  const hash = contentHash(post.title, post.body_html);
  if (!post.qc?.passed || post.qc_hash !== hash) {
    return { error: 'Run the Humanizer on the current text first. Publishing needs a pass.' };
  }
  if (!post.featured_image_id) return { error: 'Add a featured image first.' };
  let slug = post.slug;
  if (!slug) {
    const base = slugify(post.title);
    slug = base;
    for (let i = 2; ; i++) {
      const [taken] = await sql`select 1 from app.posts where slug = ${slug} and id <> ${id}`;
      if (!taken) break;
      slug = `${base}-${i}`;
    }
  }
  await sql`update app.posts set status = 'published', slug = ${slug}, published_html = body_html, published_title = title,
            published_at = coalesce(published_at, now()), updated_at = now() where id = ${id}`;
  await logIteration('published', { postId: id, sourceId: post.source_id, content: `# ${post.title}\n\n${htmlToMarkdown(post.body_html)}` });
  refreshPublic(slug);
  return { ok: true, slug };
}

export async function unpublish(id: string) {
  await requireOwner();
  const post = await getPost(id);
  await sql`update app.posts set status = 'draft', updated_at = now() where id = ${id}`;
  refreshPublic(post.slug);
  return { ok: true };
}

export async function deletePost(id: string) {
  await requireOwner();
  const post = await getPost(id);
  await sql`delete from app.posts where id = ${id}`;
  refreshPublic(post.slug);
  redirect('/studio/outlines');
}

// ---------- Comments ----------

export async function moderateComment(id: string, action: 'approve' | 'reject' | 'block' | 'delete') {
  await requireOwner();
  const [c] = await sql`select c.id, c.email, c.sender, p.slug from app.comments c
                        join app.posts p on p.id = c.post_id where c.id = ${id}`;
  if (!c) return;
  if (action === 'approve') await sql`update app.comments set status = 'approved' where id = ${id}`;
  if (action === 'reject') await sql`update app.comments set status = 'rejected' where id = ${id}`;
  if (action === 'delete') await sql`delete from app.comments where id = ${id}`;
  if (action === 'block') {
    if (c.sender) await sql`insert into app.blocked (kind, value) values ('sender', ${c.sender}) on conflict do nothing`;
    if (c.email) await sql`insert into app.blocked (kind, value) values ('email', ${c.email}) on conflict do nothing`;
    await sql`update app.comments set status = 'rejected'
              where sender = ${c.sender} or (email is not null and email = ${c.email})`;
  }
  revalidatePath('/studio', 'layout');
  refreshPublic(c.slug);
}

export async function unblock(id: string) {
  await requireOwner();
  await sql`delete from app.blocked where id = ${id}`;
  revalidatePath('/studio/comments');
}
