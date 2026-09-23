import { sql } from '@/lib/db';
import { formatDate } from '@/lib/html';
import CommentForm from './CommentForm';

export default async function Comments({ postId }: { postId: string }) {
  const comments = await sql`select id, name, body, created_at from app.comments
    where post_id = ${postId} and status = 'approved' order by created_at asc`;
  return (
    <section className="comments wrap" aria-label="Comments">
      <h2 className="section-title">{comments.length ? `Comments (${comments.length})` : 'Comments'}</h2>
      {comments.map((c) => (
        <div key={c.id} className="comment">
          <p>{c.body}</p>
          <span className="small muted">{c.name} · {formatDate(c.created_at)}</span>
        </div>
      ))}
      <CommentForm postId={postId} />
    </section>
  );
}
