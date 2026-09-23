'use client';

import { useTransition } from 'react';
import { moderateComment, unblock } from '../actions';

export default function CommentActions({ id, status }: { id: string; status: string }) {
  const [pending, start] = useTransition();
  const btn = (label: string, fn: () => Promise<unknown>, danger = false) => (
    <button className={`link-btn${danger ? ' danger' : ''}`} disabled={pending} onClick={() => start(async () => { await fn(); })}>
      {label}
    </button>
  );
  if (status === 'blocked') return btn('unblock', () => unblock(id));
  return (
    <span style={{ display: 'inline-flex', gap: 16 }}>
      {status === 'pending' && btn('approve', () => moderateComment(id, 'approve'))}
      {btn(status === 'pending' ? 'reject' : 'remove', () => moderateComment(id, status === 'pending' ? 'reject' : 'delete'))}
      {btn('block sender', () => moderateComment(id, 'block'), true)}
    </span>
  );
}
