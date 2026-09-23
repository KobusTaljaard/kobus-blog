'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireOwner } from '@/lib/auth/server';
import { sql, CHECK_MIN, OVERALL_MIN, type Post, type HumanizerResult } from '@/lib/db';
import { findThemes, outlineTheme, writeFromOutline, humanize, CHECKS, MODEL } from '@/lib/ai';
import { cleanHtml, contentHash, htmlToMarkdown, markdownToHtml, slugify } from '@/lib/html';
import { compileHtml, docOf, normaliseDoc, type Doc } from '@/lib/doc';

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
    const found = await findThemes(content);
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
      });
      const doc = normaliseDoc(outline, t.name);
      const [post] = await sql`insert into app.posts (source_id, theme, title, doc, notes, status)
        values (${sourceId}, ${t.name}, ${doc.title.text}, ${JSON.stringify(doc)}::jsonb, ${src.analysis?.notes || ''}, 'outline')
        returning id`;
      await sql`update app.themes set status = 'outlined', post_id = ${post.id} where id = ${t.id}`;
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
  const outlineText = JSON.stringify(
    {
      title: doc.title.text,
      blocks: [
        { id: doc.intro.id, role: 'intro', idea: doc.intro.text, apps: doc.intro.apps },
        ...doc.points.flatMap((p, i) => [
          { id: p.id, role: `point ${i + 1}`, heading: p.text, apps: p.apps },
          ...p.forks.map((f, j) => ({ id: f.id, role: `point ${i + 1} fork ${j + 1}`, heading: f.text, apps: f.apps })),
        ]),
        { id: doc.outro.id, role: 'outro', idea: doc.outro.text, apps: doc.outro.apps },
        { id: doc.conclusion.id, role: 'conclusion', idea: doc.conclusion.text, apps: doc.conclusion.apps },
      ],
      title_apps: doc.title.apps,
    },
    null,
    1,
  );
  try {
    const w = await writeFromOutline({ transcript: src?.content || '', outline: outlineText, notes: post.notes || '' });
    const byId = new Map(w.blocks.map((b) => [b.id, b.body_markdown || '']));
    const fill = (b: { id: string; body: string }) => {
      const md = byId.get(b.id);
      if (md !== undefined) b.body = markdownToHtml(md);
    };
    fill(doc.intro);
    doc.points.forEach((p) => {
      fill(p);
      p.forks.forEach(fill);
    });
    fill(doc.outro);
    fill(doc.conclusion);
    const body = compileHtml(doc);
    const tags = (w.tags || []).map((t) => t.trim().toLowerCase()).filter(Boolean).slice(0, 4);
    await sql`update app.posts set doc = ${JSON.stringify(doc)}::jsonb, body_html = ${body}, title = ${doc.title.text.trim()},
              status = case when status = 'outline' then 'draft' else status end,
              excerpt = case when excerpt = '' then ${(w.excerpt || '').trim()} else excerpt end,
              tags = case when cardinality(tags) = 0 then ${tags} else tags end,
              updated_at = now() where id = ${id}`;
  } catch (e) {
    return { error: `The writing could not be done: ${e instanceof Error ? e.message : e}` };
  }
  revalidatePath(`/studio/writing/${id}`);
  return { ok: true };
}

// ---------- Humanizer ----------

export async function runHumanizer(id: string) {
  await requireOwner();
  const post = await getPost(id);
  if (!post.title.trim() || !post.body_html.trim()) return { error: 'Write the piece first.' };
  const [src] = post.source_id ? await sql`select content from app.sources where id = ${post.source_id}` : [];
  try {
    const raw = await humanize(post.title, htmlToMarkdown(post.body_html), src?.content || '');
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
    await sql`update app.posts set qc = ${JSON.stringify(result)}::jsonb, qc_hash = ${hash}, qc_at = now() where id = ${id}`;
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
