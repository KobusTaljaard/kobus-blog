import Link from 'next/link';
import { sql } from '@/lib/db';
import { formatDate } from '@/lib/html';

const STAGE: Record<string, string> = { outline: 'Outline', draft: 'Written', published: 'Published' };

/** Every piece, newest first; each opens in the tab you're on. */
export default async function PieceList({ tab, empty }: { tab: 'outlines' | 'writing' | 'humanizer'; empty: string }) {
  const rows = await sql`select p.id, p.title, p.theme, p.status, p.updated_at, p.qc, s.filename
    from app.posts p left join app.sources s on s.id = p.source_id order by p.updated_at desc`;
  if (!rows.length) return <p className="muted">{empty}</p>;
  return (
    <ul className="piece-list">
      {rows.map((r) => (
        <li key={r.id}>
          <Link href={`/studio/${tab}/${r.id}`}>
            <span className="piece-title">{r.title || r.theme || 'Untitled'}</span>
            <span className="piece-meta">
              {STAGE[r.status]}
              {r.qc?.overall != null && <> · Humanizer {r.qc.overall}</>}
              {' · '}
              {formatDate(r.updated_at)}
              {r.filename && <> · from {r.filename}</>}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
