import Link from 'next/link';
import { sql } from '@/lib/db';
import { formatDate } from '@/lib/html';

export default async function ThemesIndex() {
  const rows = await sql`
    select s.id, s.filename, s.created_at,
      (select count(*)::int from app.themes t where t.source_id = s.id and t.status = 'proposed') as open,
      (select count(*)::int from app.themes t where t.source_id = s.id and t.status = 'outlined' and t.post_id is not null) as outlined
    from app.sources s order by s.created_at desc`;
  return (
    <div className="list-page">
      <h1 className="page-title">Themes</h1>
      {rows.length === 0 && <p className="muted">Upload an original source first.</p>}
      <ul className="piece-list">
        {rows.map((r) => (
          <li key={r.id}>
            <Link href={`/studio/themes/${r.id}`}>
              <span className="piece-title">{r.filename}</span>
              <span className="piece-meta">
                {r.open} to choose from · {r.outlined} outlined · {formatDate(r.created_at)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
