'use client';

import { useActionState } from 'react';
import { postComment } from './comment-action';

export default function CommentForm({ postId }: { postId: string }) {
  const [state, action, pending] = useActionState(postComment, null as null | { done?: boolean; error?: string });
  if (state?.done) return <p className="muted">Thank you. Your comment will appear once I have read it.</p>;
  return (
    <form action={action} className="note" aria-label="Leave a comment">
      <label className="muted small" htmlFor="c-body">Leave a comment. It appears after I have read it.</label>
      <textarea id="c-body" className="field" name="body" rows={4} required maxLength={3000} />
      <div className="note-row">
        <input className="field" name="name" placeholder="Your name" required autoComplete="name" maxLength={80} />
        <input className="field" name="email" type="email" placeholder="Email (optional, never shown)" autoComplete="email" />
      </div>
      <input className="visually-hidden" tabIndex={-1} autoComplete="off" name="website" aria-hidden="true" />
      <input type="hidden" name="post" value={postId} />
      <div><button className="btn ghost" disabled={pending}>{pending ? 'Sending…' : 'Post comment'}</button></div>
      {state?.error && <p className="small" style={{ margin: 0, color: 'var(--fail)' }}>{state.error}</p>}
    </form>
  );
}
