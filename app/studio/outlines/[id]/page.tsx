import { notFound } from 'next/navigation';
import { sql } from '@/lib/db';
import { docOf, isWritten } from '@/lib/doc';
import { formatDate } from '@/lib/html';
import OutlineEditor from './OutlineEditor';

export const maxDuration = 300;

export default async function OutlinePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const [post] = await sql`select p.*, s.filename, s.created_at as src_date from app.posts p
    left join app.sources s on s.id = p.source_id where p.id = ${id}`;
  if (!post) notFound();
  const doc = docOf(post);
  return (
    <OutlineEditor
      key={id}
      id={id}
      initial={doc}
      written={isWritten(doc)}
      source={post.filename ? `${post.filename} · ${formatDate(post.src_date)}` : null}
    />
  );
}
