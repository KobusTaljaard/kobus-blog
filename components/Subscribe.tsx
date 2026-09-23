'use client';

import { useActionState } from 'react';
import { subscribe } from './subscribe-action';

export default function Subscribe() {
  const [state, action, pending] = useActionState(subscribe, null as null | { done?: boolean; error?: string });
  if (state?.done) return <p className="muted">Thank you. You’re on the list.</p>;
  return (
    <form action={action} aria-label="Subscribe by email">
      <label className="muted" style={{ width: '100%' }} htmlFor="sub-email">
        Leave your email to hear about new entries:
      </label>
      <input id="sub-email" className="field" style={{ flex: '1 1 14rem' }} type="email" name="email" required placeholder="you@example.com" />
      <input className="visually-hidden" tabIndex={-1} autoComplete="off" name="website" aria-hidden="true" />
      <button className="btn ghost" disabled={pending}>{pending ? '…' : 'Subscribe'}</button>
      {state?.error && <p className="small" style={{ width: '100%', margin: 0, color: 'var(--fail)' }}>{state.error}</p>}
    </form>
  );
}
