import Link from 'next/link';
import { sql } from '@/lib/db';
import { formatDate } from '@/lib/html';
import DeleteMessage from './DeleteMessage';

export default async function MessagesPage() {
  const messages = await sql`
    select m.id, m.name, m.email, m.body, m.created_at, p.title as post_title, p.slug as post_slug
    from app.messages m left join app.posts p on p.id = m.post_id
    order by m.created_at desc`;

  return (
    <div className="wrap">
      <h2 className="section-title">Messages</h2>
      {messages.length === 0 && <p className="muted">No messages yet.</p>}
      {messages.map((m) => (
        <div key={m.id} className="message">
          <p>{m.body}</p>
          <span className="small muted">
            {m.name || 'Anonymous'}
            {m.email && <> · <a href={`mailto:${m.email}`}>{m.email}</a></>}
            {' · '}{formatDate(m.created_at)}
            {m.post_slug && <> · on <Link href={`/writing/${m.post_slug}`}>{m.post_title}</Link></>}
            {' · '}<DeleteMessage id={m.id} />
          </span>
        </div>
      ))}
    </div>
  );
}
