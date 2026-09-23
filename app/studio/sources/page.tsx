import Link from 'next/link';
import { sql } from '@/lib/db';
import { formatDate } from '@/lib/html';
import UploadForm from './UploadForm';

export const maxDuration = 300;

export default async function SourcesPage() {
  const sources = await sql`
    select s.id, s.filename, s.created_at, s.analysis ? 'error' as failed,
           (select count(*)::int from app.posts p where p.source_id = s.id) as pieces
    from app.sources s order by s.created_at desc`;
  return (
    <div className="list-page">
      <h1 className="page-title">Original Sources</h1>
      <UploadForm />
      {sources.length > 0 && (
        <ul className="piece-list" style={{ marginTop: 40 }}>
          {sources.map((s) => (
            <li key={s.id}>
              <Link href={`/studio/sources/${s.id}`}>
                <span className="piece-title">{s.filename}</span>
                <span className="piece-meta">
                  {formatDate(s.created_at)} · {s.failed ? 'analysis failed' : `${s.pieces} ${s.pieces === 1 ? 'piece' : 'pieces'}`}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
