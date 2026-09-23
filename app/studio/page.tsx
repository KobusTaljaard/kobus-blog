import Link from 'next/link';
import { sql } from '@/lib/db';
import { formatDate } from '@/lib/html';

export default async function PostsPage() {
  const posts = await sql`
    select p.id, p.status, p.title, p.theme, p.updated_at, p.published_at, p.qc, p.qc_hash,
           s.filename as source_name
    from app.posts p left join app.sources s on s.id = p.source_id
    order by p.updated_at desc`;

  const groups = [
    { key: 'outline', label: 'Outlines' },
    { key: 'draft', label: 'Drafts' },
    { key: 'published', label: 'Published' },
  ] as const;

  if (posts.length === 0) {
    return (
      <div className="wrap" style={{ paddingTop: 60 }}>
        <p>No posts yet.</p>
        <p><Link href="/studio/sources">Upload a transcript</Link> to begin.</p>
      </div>
    );
  }

  return (
    <div className="wrap">
      <p className="actions"><Link className="btn ghost" href="/studio/sources" style={{ textDecoration: 'none' }}>Upload a transcript</Link></p>
      {groups.map((g) => {
        const rows = posts.filter((p) => p.status === g.key);
        if (!rows.length) return null;
        return (
          <section key={g.key}>
            <h2 className="section-title">{g.label}</h2>
            <ul className="rows">
              {rows.map((p) => (
                <li key={p.id}>
                  <Link href={`/studio/p/${p.id}`}>{p.title || p.theme || 'Untitled'}</Link>
                  <span className="muted small" style={{ whiteSpace: 'nowrap' }}>
                    {g.key === 'published' ? formatDate(p.published_at) : formatDate(p.updated_at)}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
