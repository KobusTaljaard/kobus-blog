import { notFound } from 'next/navigation';
import { sql } from '@/lib/db';
import { contentHash } from '@/lib/html';
import Humanizer from './Humanizer';

export const maxDuration = 300;

export default async function HumanizerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const [post] = await sql`select * from app.posts where id = ${id}`;
  if (!post) notFound();
  return (
    <Humanizer
      key={id}
      p={{
        id,
        title: post.title,
        html: post.body_html,
        hash: contentHash(post.title, post.body_html),
        status: post.status,
        slug: post.slug,
        liveOutOfDate: post.status === 'published' && (post.published_html !== post.body_html || post.published_title !== post.title),
        excerpt: post.excerpt,
        tags: post.tags,
        featured: post.featured_image_id,
        qc: post.qc,
        qcHash: post.qc_hash,
      }}
    />
  );
}
