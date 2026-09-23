import { notFound } from 'next/navigation';
import { sql } from '@/lib/db';
import { docOf, isWritten } from '@/lib/doc';
import WritingEditor from './WritingEditor';

export const maxDuration = 300;

export default async function WritingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const [post] = await sql`select * from app.posts where id = ${id}`;
  if (!post) notFound();
  const doc = docOf(post);
  return <WritingEditor key={`${id}-${post.updated_at}`} id={id} initial={doc} written={isWritten(doc)} qc={post.qc} dismissed={post.qc_dismissed || []} featured={post.featured_image_id} />;
}
