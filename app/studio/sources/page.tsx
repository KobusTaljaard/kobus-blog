import { sql } from '@/lib/db';
import { formatDate } from '@/lib/html';
import UploadForm from './UploadForm';
import SourceRowActions from './SourceRowActions';

export const maxDuration = 300;

export default async function SourcesPage() {
  const sources = await sql`
    select s.id, s.filename, s.created_at, s.analysis ? 'error' as failed,
           (select count(*)::int from app.posts p where p.source_id = s.id) as posts
    from app.sources s order by s.created_at desc`;

  return (
    <div className="wrap">
      <h2 className="section-title">Upload</h2>
      <UploadForm />
      {sources.length > 0 && (
        <>
          <h2 className="section-title">Sources</h2>
          <ul className="rows">
            {sources.map((s) => (
              <li key={s.id}>
                <span>
                  {s.filename}
                  <span className="muted small"> · {formatDate(s.created_at)}</span>
                </span>
                <span className="muted small" style={{ whiteSpace: 'nowrap' }}>
                  {s.failed ? 'analysis failed' : `${s.posts} ${s.posts === 1 ? 'post' : 'posts'}`}{' '}
                  <SourceRowActions id={s.id} failed={!!s.failed} canDelete={s.posts === 0} />
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
