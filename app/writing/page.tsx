import Link from 'next/link';
import type { Metadata } from 'next';
import { sql } from '@/lib/db';
import { formatDate } from '@/lib/html';
import Strip from '@/components/Strip';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Writing' };

export default async function Reader({ searchParams }: { searchParams: Promise<{ tag?: string }> }) {
  const { tag } = await searchParams;
  const t = tag?.trim().toLowerCase() || null;
  const posts = await sql`
    select id, slug, published_title as title, excerpt, featured_image_id, published_at
    from app.posts
    where status = 'published' and (${t}::text is null or ${t} = any(tags))
    order by published_at desc`;
  return (
    <>
      <Strip />
      <main className="wrap reader">
        {t && (
          <p className="muted small" style={{ margin: '24px 0' }}>
            Entries tagged “{t}” · <Link href="/writing">all entries</Link>
          </p>
        )}
        {posts.length === 0 ? (
          <p className="muted" style={{ textAlign: 'center', marginTop: '20vh' }}>The first entries are on their way.</p>
        ) : (
          <ul className="list">
            {posts.map((p) => (
              <li key={p.id}>
                <Link className="card" href={`/writing/${p.slug}`}>
                  {p.featured_image_id ? <img className="thumb" src={`/img/${p.featured_image_id}`} alt="" loading="lazy" /> : <span className="thumb" />}
                  <span>
                    <h2>{p.title}</h2>
                    <span className="muted small">{formatDate(p.published_at)}</span>
                    {p.excerpt && <p>{p.excerpt}</p>}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </>
  );
}
