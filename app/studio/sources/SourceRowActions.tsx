'use client';

import { useTransition, useState } from 'react';
import { useRouter } from 'next/navigation';
import { reanalyseSource, deleteSource } from '../actions';

export default function SourceRowActions({ id, failed, canDelete, label = 'Find the themes again' }: { id: string; failed: boolean; canDelete: boolean; label?: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState('');
  return (
    <>
      {failed && (
        <button type="button" className="quiet-btn" disabled={pending} onClick={() => start(async () => {
          const r = await reanalyseSource(id);
          if (r?.error) setErr(r.error);
        })}>
          {pending ? 'Finding themes… (about a minute)' : label}
        </button>
      )}
      {canDelete && (
        <button type="button" className="add danger" disabled={pending} onClick={() => {
          if (!window.confirm('Delete this source?')) return;
          start(async () => { const r = await deleteSource(id); if (r?.error) setErr(r.error); else router.push('/studio/sources'); });
        }}>delete</button>
      )}
      {err && <span className="small" style={{ color: 'var(--fail)' }}>{err}</span>}
    </>
  );
}
