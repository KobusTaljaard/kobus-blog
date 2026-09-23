'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Doc } from '@/lib/doc';
import { saveDoc } from '../actions';

/** Keeps the shared document and saves it a moment after you stop typing. */
export function useAutosave(id: string, initial: Doc) {
  const [doc, setDoc] = useState<Doc>(initial);
  const [status, setStatus] = useState<'saved' | 'waiting' | 'saving' | 'error'>('saved');
  const [hash, setHash] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(doc);
  latest.current = doc;

  const flush = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setStatus('saving');
    try {
      const r = await saveDoc(id, latest.current);
      setHash(r.hash);
      setStatus(timer.current ? 'waiting' : 'saved');
    } catch {
      setStatus('error');
    }
  }, [id]);

  const update = useCallback(
    (fn: (d: Doc) => void) => {
      setDoc((prev) => {
        const next: Doc = structuredClone(prev);
        fn(next);
        return next;
      });
      setStatus('waiting');
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(flush, 1200);
    },
    [flush],
  );

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (timer.current) {
        flush();
        e.preventDefault();
      }
    };
    window.addEventListener('beforeunload', warn);
    return () => {
      window.removeEventListener('beforeunload', warn);
      if (timer.current) flush();
    };
  }, [flush]);

  return { doc, setDoc, update, status, flush, hash };
}

export function SaveStatus({ status }: { status: string }) {
  const text = { saved: 'Saved', waiting: 'Editing…', saving: 'Saving…', error: 'Not saved — check your connection' }[status] || '';
  return <span className={`save-status${status === 'error' ? ' err' : ''}`}>{text}</span>;
}
