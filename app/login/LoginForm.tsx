'use client';

import { useState } from 'react';
import { sendCode, verifyCode } from './actions';

// Sign-in by emailed code: works whichever device or app you read the email on.
export default function LoginForm() {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const r = await sendCode(email);
    setBusy(false);
    if (r.error) setError(r.error);
    else setStep('code');
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const r = await verifyCode(email, code);
    setBusy(false);
    if (r?.error) setError(r.error);
  }

  if (step === 'code') {
    return (
      <form onSubmit={verify} style={{ display: 'grid', gap: 12 }}>
        <label htmlFor="code">Enter the code sent to {email}</label>
        <input
          id="code"
          className="field"
          inputMode="numeric"
          autoComplete="one-time-code"
          required
          autoFocus
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\s/g, ''))}
          style={{ letterSpacing: '0.3em', fontSize: '1.2rem' }}
        />
        <button className="btn" disabled={busy || code.length < 4}>{busy ? 'Signing in…' : 'Sign in'}</button>
        {error && <p className="notice error">{error}</p>}
        <p className="small muted">
          No code? <button type="button" className="link-btn" onClick={() => { setStep('email'); setCode(''); setError(''); }}>Send another</button>
        </p>
      </form>
    );
  }

  return (
    <form onSubmit={send} style={{ display: 'grid', gap: 12 }}>
      <label htmlFor="email">Email</label>
      <input id="email" className="field" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      <button className="btn" disabled={busy}>{busy ? 'Sending…' : 'Email me a sign-in code'}</button>
      {error && <p className="notice error">{error}</p>}
    </form>
  );
}
