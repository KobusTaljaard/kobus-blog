import Link from 'next/link';
import { notFound } from 'next/navigation';
import { sql } from '@/lib/db';
import { formatDate } from '@/lib/html';
import PrintButton from '../../_ui/PrintButton';
import SourceRowActions from '../SourceRowActions';

export const maxDuration = 300;

export default async function SourceView({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const [src] = await sql`select id, filename, content, created_at, analysis ? 'error' as failed from app.sources where id = ${id}`;
  if (!src) notFound();
  const pieces = await sql`select id, title, theme from app.posts where source_id = ${id} order by created_at`;
  return (
    <div className="sheet source">
      <div className="sheet-bar no-print">
        <Link href="/studio/sources" className="muted">← All sources</Link>
        <span className="muted">{src.filename} · {formatDate(src.created_at)}</span>
        <span className="grow" />
        {pieces.map((p) => (
          <Link key={p.id} className="quiet-btn" href={`/studio/outlines/${p.id}`}>{p.title || p.theme} →</Link>
        ))}
        <SourceRowActions id={src.id} failed={!!src.failed} canDelete={pieces.length === 0} />
        <PrintButton />
      </div>
      <h1 className="source-title print-only">{src.filename}</h1>
      <div className="source-text">{src.content}</div>
    </div>
  );
}
