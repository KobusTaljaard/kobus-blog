import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { sql } from '@/lib/db';
import { formatDate } from '@/lib/html';
import Strip from '@/components/Strip';
import Foot from '@/components/Foot';
import Comments from '@/components/Comments';

export const dynamic = 'force-dynamic';

async function load(slug: string) {
  const [p] = await sql`select * from app.posts where slug = ${slug} and status = 'published'`;
  return p;
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const p = await load((await params).slug);
  if (!p) return {};
  return {
    title: p.title,
    description: p.excerpt || undefined,
    openGraph: p.featured_image_id ? { images: [`/img/${p.featured_image_id}`] } : undefined,
  };
}

export default async function PostPage({ params }: { params: Promise<{ slug: string }> }) {
  const p = await load((await params).slug);
  if (!p) notFound();
  return (
    <>
      <Strip />
      {p.featured_image_id && <img className="hero" src={`/img/${p.featured_image_id}`} alt="" />}
      <main className="wrap">
        <header className="post-head">
          <h1>{p.title}</h1>
          <span className="muted small">
            {p.author} · {formatDate(p.published_at)}
          </span>
        </header>
        {/* body_html is sanitised on every save (lib/html.ts cleanHtml) */}
        <article className="prose" dangerouslySetInnerHTML={{ __html: p.body_html }} />
        {p.tags?.length > 0 && (
          <div className="tags">
            {p.tags.map((t: string) => (
              <Link key={t} href={`/?tag=${encodeURIComponent(t)}`}>#{t}</Link>
            ))}
          </div>
        )}
      </main>
      <Comments postId={p.id} />
      <Foot note={false} />
    </>
  );
}
