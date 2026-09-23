import Link from 'next/link';
import { sql } from '@/lib/db';
import { formatDate } from '@/lib/html';
import CommentActions from './CommentActions';

export default async function CommentsPage() {
  const comments = await sql`
    select c.id, c.name, c.email, c.body, c.status, c.created_at, p.title, p.slug
    from app.comments c join app.posts p on p.id = c.post_id
    where c.status in ('pending', 'approved')
    order by (c.status = 'pending') desc, c.created_at desc
    limit 200`;
  const blocked = await sql`select id, kind, value, created_at from app.blocked order by created_at desc`;
  const pending = comments.filter((c) => c.status === 'pending');
  const approved = comments.filter((c) => c.status === 'approved');

  const row = (c: Record<string, any>) => (
    <div key={c.id} className="message">
      <p>{c.body}</p>
      <span className="small muted">
        {c.name}
        {c.email && <> · {c.email}</>}
        {' · '}{formatDate(c.created_at)}
        {' · on '}<Link href={`/writing/${c.slug}`}>{c.title}</Link>
      </span>
      <div className="small" style={{ marginTop: 6 }}><CommentActions id={c.id} status={c.status} /></div>
    </div>
  );

  return (
    <div className="list-page">
      <h1 className="page-title">Comments</h1>
      <h2 className="section-title">Waiting for you ({pending.length})</h2>
      {pending.length === 0 ? <p className="muted">Nothing waiting.</p> : pending.map(row)}
      <h2 className="section-title">On the blog</h2>
      {approved.length === 0 ? <p className="muted">No comments yet.</p> : approved.map(row)}
      {blocked.length > 0 && (
        <>
          <h2 className="section-title">Blocked</h2>
          <ul className="rows">
            {blocked.map((b) => (
              <li key={b.id}>
                <span className="small">{b.kind === 'email' ? b.value : 'A sender (network address)'}</span>
                <span className="small"><CommentActions id={b.id} status="blocked" /></span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
