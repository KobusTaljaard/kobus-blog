'use client';

import { useState } from 'react';
import { authClient } from '@/lib/auth/client';

export default function LoginForm() {
  const [email, setEmail] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [message, setMessage] = useState('');

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setState('sending');
    const { error } = await authClient.signIn.magicLink({
      email: email.trim(),
      callbackURL: `${window.location.origin}/studio`,
    });
    if (error) {
      setState('error');
      setMessage(error.message || 'The link could not be sent.');
    } else {
      setState('sent');
    }
  }

  if (state === 'sent') {
    return <p>A sign-in link is on its way to {email}. Open it on this device.</p>;
  }

  return (
    <form onSubmit={send} style={{ display: 'grid', gap: 12 }}>
      <label htmlFor="email">Email</label>
      <input id="email" className="field" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      <button className="btn" disabled={state === 'sending'}>{state === 'sending' ? 'Sending…' : 'Send sign-in link'}</button>
      {state === 'error' && <p className="notice error">{message}</p>}
    </form>
  );
}
