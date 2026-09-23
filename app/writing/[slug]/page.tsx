import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { sql } from '@/lib/db';
import { formatDate } from '@/lib/html';
import Strip from '@/components/Strip';
import Foot from '@/components/Foot';
import Comments from '@/components/Comments';
import Share from '@/components/Share';

export const dynamic = 'force-dynamic';

async function load(slug: string) {
  const [p] = await sql`select * from app.posts where slug = ${slug} and status = 'published'`;
  return p;
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const p = await load((await params).slug);
  if (!p) return {};
  // Absolute links so WhatsApp, Facebook and LinkedIn show the title, excerpt and picture.
  const h = await headers();
  const origin = `${h.get('x-forwarded-proto') || 'https'}://${h.get('x-forwarded-host') || h.get('host')}`;
  const title = p.published_title || p.title;
  const image = p.featured_image_id ? `${origin}/img/${p.featured_image_id}` : undefined;
  return {
    title,
    description: p.excerpt || undefined,
    alternates: { canonical: `${origin}/writing/${p.slug}` },
    openGraph: {
      type: 'article',
      title,
      description: p.excerpt || undefined,
      url: `${origin}/writing/${p.slug}`,
      siteName: 'Kobus Taljaard',
      publishedTime: p.published_at ? new Date(p.published_at).toISOString() : undefined,
      images: image ? [image] : undefined,
    },
    twitter: { card: image ? 'summary_large_image' : 'summary', title, description: p.excerpt || undefined, images: image ? [image] : undefined },
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
          <h1>{p.published_title || p.title}</h1>
          <span className="muted small">
            {p.author} · {formatDate(p.published_at)}
          </span>
        </header>
        {/* body_html is sanitised on every save (lib/html.ts cleanHtml) */}
        <article className="prose" dangerouslySetInnerHTML={{ __html: p.published_html ?? p.body_html }} />
        {p.tags?.length > 0 && (
          <div className="tags">
            {p.tags.map((t: string) => (
              <Link key={t} href={`/writing?tag=${encodeURIComponent(t)}`}>#{t}</Link>
            ))}
          </div>
        )}
        <Share title={p.published_title || p.title} />
      </main>
      <Comments postId={p.id} />
      <Foot />
    </>
  );
}
