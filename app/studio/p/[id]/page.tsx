import Link from 'next/link';
import { notFound } from 'next/navigation';
import { sql, type Post } from '@/lib/db';
import { contentHash, formatDate } from '@/lib/html';
import OutlineStep from './OutlineStep';
import EditorStep from './EditorStep';

export const maxDuration = 300;

export default async function PostStudioPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const [post] = (await sql`
    select p.*, s.filename as source_name, s.created_at as source_date
    from app.posts p left join app.sources s on s.id = p.source_id
    where p.id = ${id}`) as Post[];
  if (!post) notFound();

  const source = post.source_name ? (
    <p className="muted small" style={{ margin: '8px 0 24px' }}>
      Source: {post.source_name} · {formatDate(post.source_date)}
    </p>
  ) : null;

  return (
    <div className="wrap">
      <p className="small" style={{ marginTop: 8 }}><Link href="/studio">← Posts</Link></p>
      {post.status === 'outline' ? (
        <OutlineStep id={post.id} theme={post.theme || ''} initialOutline={post.outline} source={source} />
      ) : (
        <EditorStep
          source={source}
          post={{
            id: post.id,
            status: post.status,
            slug: post.slug,
            title: post.title,
            body_html: post.body_html,
            excerpt: post.excerpt,
            tags: post.tags,
            featured_image_id: post.featured_image_id,
            outline: post.outline,
            qc: post.qc,
            qc_hash: post.qc_hash,
            hash: contentHash(post.title, post.body_html),
          }}
        />
      )}
    </div>
  );
}
