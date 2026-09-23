'use client';

import { useActionState } from 'react';
import { sendMessage } from './message-action';

export default function MessageBox({ postId }: { postId?: string }) {
  const [state, action, pending] = useActionState(sendMessage, null as null | { done?: boolean; error?: string });
  if (state?.done) return <p className="muted" style={{ margin: 0 }}>Thank you. Your note reached me.</p>;
  return (
    <form action={action} className="note" aria-label="Write to Kobus">
      <label className="muted" htmlFor="note-body">Questions or thoughts? Write to me. Only I will see this.</label>
      <textarea id="note-body" className="field" name="body" rows={4} required maxLength={4000} />
      <div className="note-row">
        <input className="field" name="name" placeholder="Your name (optional)" autoComplete="name" />
        <input className="field" name="email" type="email" placeholder="Email, if you'd like a reply" autoComplete="email" />
      </div>
      <input className="visually-hidden" tabIndex={-1} autoComplete="off" name="website" aria-hidden="true" />
      {postId && <input type="hidden" name="post" value={postId} />}
      <div><button className="btn ghost" disabled={pending}>{pending ? 'Sending…' : 'Send'}</button></div>
      {state?.error && <p className="small" style={{ margin: 0, color: 'var(--fail)' }}>{state.error}</p>}
    </form>
  );
}
