import Link from 'next/link';
import { notFound } from 'next/navigation';
import { sql } from '@/lib/db';
import { formatDate } from '@/lib/html';
import ThemeBoard from './ThemeBoard';
import SourceRowActions from '../../sources/SourceRowActions';

export const maxDuration = 300;

export default async function ThemesForSource({ params }: { params: Promise<{ sourceId: string }> }) {
  const { sourceId } = await params;
  if (!/^[0-9a-f-]{36}$/.test(sourceId)) notFound();
  const [src] = await sql`select id, filename, created_at, analysis ? 'error' as failed from app.sources where id = ${sourceId}`;
  if (!src) notFound();
  const themes = await sql`select t.*, p.title as post_title from app.themes t left join app.posts p on p.id = t.post_id
    where t.source_id = ${sourceId} order by t.sort, t.created_at`;
  const byId = new Map(themes.map((t) => [t.id, t]));
  const view = themes
    .filter((t) => t.status !== 'merged')
    .map((t) => ({
      id: t.id as string,
      name: t.name as string,
      summary: t.summary as string,
      quotes: t.quotes as string[],
      main: !!t.main,
      removed: t.status === 'removed',
      outlinedPost: t.status === 'outlined' && t.post_id ? { id: t.post_id as string, title: (t.post_title as string) || t.name } : null,
      includes: ((t.members as string[]) || []).slice(1).map((m) => byId.get(m)?.name).filter(Boolean) as string[],
      merged: ((t.members as string[]) || []).length > 0,
    }));
  return (
    <div className="sheet themes">
      <div className="sheet-bar no-print">
        <Link href={`/studio/sources/${src.id}`} className="muted">← {src.filename}</Link>
        <span className="muted">{formatDate(src.created_at)}</span>
        <span className="grow" />
        <SourceRowActions id={src.id} failed={true} canDelete={false} label="Find the themes again" />
      </div>
      {view.length === 0 ? (
        <p className="muted">{src.failed ? 'Finding the themes failed. Try again with the button above.' : 'No themes yet. Use “Find the themes again” above.'}</p>
      ) : (
        <ThemeBoard themes={view} />
      )}
    </div>
  );
}
