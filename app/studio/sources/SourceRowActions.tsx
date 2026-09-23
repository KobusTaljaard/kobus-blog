'use client';

import { useTransition, useState } from 'react';
import { reanalyseSource, deleteSource } from '../actions';

export default function SourceRowActions({ id, failed, canDelete }: { id: string; failed: boolean; canDelete: boolean }) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState('');
  return (
    <>
      {failed && (
        <button className="link-btn" disabled={pending} onClick={() => start(async () => {
          const r = await reanalyseSource(id);
          if (r?.error) setErr(r.error);
        })}>
          {pending ? 'analysing…' : 'analyse again'}
        </button>
      )}{' '}
      {canDelete && (
        <button className="link-btn danger" disabled={pending} onClick={() => {
          if (!window.confirm('Delete this source?')) return;
          start(async () => { const r = await deleteSource(id); if (r?.error) setErr(r.error); });
        }}>delete</button>
      )}
      {err && <span style={{ color: 'var(--fail)' }}> {err}</span>}
    </>
  );
}
