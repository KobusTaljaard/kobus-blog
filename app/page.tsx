import Link from 'next/link';
import { sql } from '@/lib/db';
import { formatDate } from '@/lib/html';
import Strip from '@/components/Strip';

export const dynamic = 'force-dynamic';

export default async function Home({ searchParams }: { searchParams: Promise<{ tag?: string }> }) {
  const { tag } = await searchParams;
  const t = tag?.trim().toLowerCase() || null;
  const posts = await sql`
    select id, slug, title, excerpt, featured_image_id, published_at
    from app.posts
    where status = 'published' and (${t}::text is null or ${t} = any(tags))
    order by published_at desc`;

  return (
    <>
      <Strip />
      {!t && (
        <div className="cover-desk">
          <div className="cover" role="img" aria-label="Notebook cover: Kobus Taljaard">
            <span className="deboss">Kobus<br />Taljaard</span>
          </div>
        </div>
      )}
      <main className="wrap">
        {t && (
          <p className="muted small" style={{ margin: '24px 0' }}>
            Entries tagged “{t}” · <Link href="/">all entries</Link>
          </p>
        )}
        {posts.length === 0 ? (
          <p className="muted" style={{ textAlign: 'center' }}>Nothing here yet.</p>
        ) : (
          <ul className="list">
            {posts.map((p) => (
              <li key={p.id}>
                <Link className="card" href={`/writing/${p.slug}`}>
                  {p.featured_image_id ? (
                    <img className="thumb" src={`/img/${p.featured_image_id}`} alt="" loading="lazy" />
                  ) : (
                    <span className="thumb" />
                  )}
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
