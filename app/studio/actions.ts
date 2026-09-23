'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireOwner, auth } from '@/lib/auth/server';
import { sql, QC_PASS_MARK, type Post, type QcResult } from '@/lib/db';
import { analyseTranscript, writeDraft, finalCheck, MODEL } from '@/lib/ai';
import { cleanHtml, contentHash, htmlToMarkdown, markdownToHtml, slugify } from '@/lib/html';

function refreshPublic(slug?: string | null) {
  revalidatePath('/');
  if (slug) revalidatePath(`/writing/${slug}`);
}

async function getPost(id: string): Promise<Post> {
  const rows = await sql`select * from app.posts where id = ${id}`;
  if (!rows[0]) throw new Error('Post not found.');
  return rows[0] as Post;
}

// ---------- Sources ----------

async function analyseAndSplit(sourceId: string, content: string) {
  try {
    const analysis = await analyseTranscript(content);
    await sql`update app.sources set analysis = ${JSON.stringify(analysis)}::jsonb where id = ${sourceId}`;
    for (const t of analysis.themes) {
      const notes = [t.notes, analysis.general_notes].filter(Boolean).join('\n\n');
      await sql`insert into app.posts (source_id, theme, outline, notes, status)
                values (${sourceId}, ${t.theme}, ${t.outline}, ${notes}, 'outline')`;
    }
    return { ok: true as const, count: analysis.themes.length };
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
  const result = await analyseAndSplit(src.id, content);
  if (!result.ok) return { error: `Saved, but the analysis failed: ${result.error}. Try “Analyse again”.` };
  redirect('/studio');
}

export async function reanalyseSource(id: string) {
  await requireOwner();
  const [src] = await sql`select content from app.sources where id = ${id}`;
  if (!src) return { error: 'Source not found.' };
  const result = await analyseAndSplit(id, src.content);
  if (!result.ok) return { error: result.error };
  redirect('/studio');
}

export async function deleteSource(id: string) {
  await requireOwner();
  const [{ n }] = await sql`select count(*)::int as n from app.posts where source_id = ${id}`;
  if (n > 0) return { error: 'Posts still come from this source. Delete them first.' };
  await sql`delete from app.sources where id = ${id}`;
  revalidatePath('/studio/sources');
  return { ok: true };
}

// ---------- Outline → draft ----------

export async function saveOutline(id: string, outline: string) {
  await requireOwner();
  await sql`update app.posts set outline = ${outline}, updated_at = now() where id = ${id} and status = 'outline'`;
  return { ok: true };
}

export async function generateDraft(id: string, outline: string) {
  await requireOwner();
  const post = await getPost(id);
  if (post.status !== 'outline') return { error: 'This post already has a draft.' };
  await sql`update app.posts set outline = ${outline}, updated_at = now() where id = ${id}`;

  const [src] = post.source_id ? await sql`select content from app.sources where id = ${post.source_id}` : [];
  if (!src) return { error: 'The source transcript for this post is missing.' };

  try {
    const d = await writeDraft({
      transcript: src.content,
      theme: post.theme || '',
      outline,
      notes: post.notes || '',
    });
    const body = markdownToHtml(d.body_markdown);
    const tags = (d.tags || []).map((t) => t.trim().toLowerCase()).filter(Boolean).slice(0, 4);
    await sql`update app.posts
              set status = 'draft', title = ${d.title.trim()}, body_html = ${body},
                  excerpt = ${d.excerpt.trim()}, tags = ${tags}, updated_at = now()
              where id = ${id}`;
  } catch (e) {
    return { error: `The draft could not be written: ${e instanceof Error ? e.message : e}` };
  }
  revalidatePath(`/studio/p/${id}`);
  return { ok: true };
}

// ---------- Free edit ----------

export async function savePost(
  id: string,
  data: { title: string; body_html: string; excerpt: string; tags: string[]; featured_image_id: string | null },
) {
  await requireOwner();
  const body = cleanHtml(data.body_html);
  const tags = data.tags.map((t) => t.trim().toLowerCase()).filter(Boolean).slice(0, 8);
  const [row] = await sql`update app.posts
            set title = ${data.title.trim()}, body_html = ${body}, excerpt = ${data.excerpt.trim()},
                tags = ${tags}, featured_image_id = ${data.featured_image_id}, updated_at = now()
            where id = ${id} and status in ('draft','published')
            returning status, slug`;
  if (!row) return { error: 'Could not save.' };
  if (row.status === 'published') refreshPublic(row.slug);
  return { ok: true, hash: contentHash(data.title, body) };
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

// ---------- Final check → publish ----------

export async function runFinalCheck(id: string) {
  await requireOwner();
  const post = await getPost(id);
  if (!post.title.trim() || !post.body_html.trim()) return { error: 'Add a title and some text first.' };
  try {
    const raw = await finalCheck(post.title, htmlToMarkdown(post.body_html));
    const qc: QcResult = {
      ...raw,
      ai_flags: raw.ai_flags || [],
      error_flags: raw.error_flags || [],
      passed: raw.ai_score >= QC_PASS_MARK && raw.quality_score >= QC_PASS_MARK,
      model: MODEL,
    };
    const hash = contentHash(post.title, post.body_html);
    await sql`update app.posts set qc = ${JSON.stringify(qc)}::jsonb, qc_hash = ${hash}, qc_at = now() where id = ${id}`;
    return { ok: true, qc, hash };
  } catch (e) {
    return { error: `The check could not run: ${e instanceof Error ? e.message : e}` };
  }
}

export async function approveAndPublish(id: string) {
  await requireOwner();
  const post = await getPost(id);
  const hash = contentHash(post.title, post.body_html);
  if (!post.qc?.passed || post.qc_hash !== hash) {
    return { error: 'Run the final check on the saved text first. Publishing needs a pass.' };
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
  await sql`update app.posts set status = 'published', slug = ${slug},
            published_at = coalesce(published_at, now()), updated_at = now() where id = ${id}`;
  refreshPublic(slug);
  revalidatePath(`/studio/p/${id}`);
  return { ok: true, slug };
}

export async function unpublish(id: string) {
  await requireOwner();
  const post = await getPost(id);
  await sql`update app.posts set status = 'draft', updated_at = now() where id = ${id}`;
  refreshPublic(post.slug);
  revalidatePath(`/studio/p/${id}`);
  return { ok: true };
}

export async function deletePost(id: string) {
  await requireOwner();
  const post = await getPost(id);
  await sql`delete from app.posts where id = ${id}`;
  refreshPublic(post.slug);
  redirect('/studio');
}

export async function signOut() {
  await auth.signOut();
  redirect('/');
}

export async function deleteMessage(id: string) {
  await requireOwner();
  await sql`delete from app.messages where id = ${id}`;
  revalidatePath('/studio/messages');
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
    // Hide everything this person has sent, published or not.
    await sql`update app.comments set status = 'rejected'
              where sender = ${c.sender} or (email is not null and email = ${c.email})`;
  }
  revalidatePath('/studio/comments');
  refreshPublic(c.slug);
}

export async function unblock(id: string) {
  await requireOwner();
  await sql`delete from app.blocked where id = ${id}`;
  revalidatePath('/studio/comments');
}
