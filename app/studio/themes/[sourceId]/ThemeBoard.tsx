'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { mergeThemes, unmergeTheme, setThemeRemoved, makeOutlines } from '../../actions';

type T = {
  id: string;
  name: string;
  summary: string;
  quotes: string[];
  main: boolean;
  removed: boolean;
  outlinedPost: { id: string; title: string } | null;
  includes: string[];
  merged: boolean;
};

export default function ThemeBoard({ themes }: { themes: T[] }) {
  const [picked, setPicked] = useState<string[]>([]); // in the order you ticked them
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  const open = themes.filter((t) => !t.removed && !t.outlinedPost);
  const done = themes.filter((t) => t.outlinedPost);
  const removed = themes.filter((t) => t.removed);
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const act = (label: string, fn: () => Promise<{ error?: string } | void | undefined>) =>
    start(async () => {
      setBusy(label);
      setError('');
      const r = await fn();
      setBusy('');
      if (r && 'error' in r && r.error) setError(r.error);
      else setPicked([]);
    });

  return (
    <>
      <div className="theme-bar">
        <p className="muted small" style={{ margin: 0 }}>
          Tick the themes you want. To merge, tick the one that should lead first; the others fold into it as points or forks.
        </p>
        <span className="grow" />
        <button type="button" className="quiet-btn" disabled={pending || picked.length < 2} onClick={() => act('merge', () => mergeThemes(picked))}>
          {busy === 'merge' ? 'Merging…' : `Merge ${picked.length >= 2 ? picked.length : ''} into one`}
        </button>
        <button type="button" className="btn" disabled={pending || picked.length < 1} onClick={() => act('outline', () => makeOutlines(picked))}>
          {busy === 'outline' ? `Outlining ${picked.length}… (a minute or two)` : picked.length > 1 ? `Make ${picked.length} outlines →` : 'Make the outline →'}
        </button>
      </div>
      {error && <p className="notice error">{error}</p>}

      <div className="theme-grid">
        {open.map((t) => {
          const n = picked.indexOf(t.id);
          return (
            <div key={t.id} className={`theme-card${n >= 0 ? ' picked' : ''}`}>
              <label className="theme-pick">
                <input type="checkbox" checked={n >= 0} onChange={() => toggle(t.id)} />
                <span className="theme-name">{t.name}</span>
                {n >= 0 && <span className="pick-no" title={n === 0 ? 'Leads a merge' : undefined}>{n + 1}</span>}
              </label>
              <div className="theme-tags">
                {t.main && <span className="tag">Main theme</span>}
                {t.merged && <span className="tag">Merged</span>}
              </div>
              <p className="theme-summary">{t.summary}</p>
              {t.includes.length > 0 && <p className="small muted">Includes: {t.includes.join(' · ')}</p>}
              {t.quotes.map((q, i) => (
                <p key={i} className="theme-quote">“{q}”</p>
              ))}
              <div className="theme-tools">
                {t.merged && <button type="button" className="add" disabled={pending} onClick={() => act('split', () => unmergeTheme(t.id))}>split apart</button>}
                <button type="button" className="add danger" disabled={pending} onClick={() => { setPicked((p) => p.filter((x) => x !== t.id)); act('remove', () => setThemeRemoved(t.id, true)); }}>remove</button>
              </div>
            </div>
          );
        })}
      </div>

      {done.length > 0 && (
        <>
          <h2 className="section-title">Already outlined</h2>
          <ul className="piece-list">
            {done.map((t) => (
              <li key={t.id}>
                <Link href={`/studio/outlines/${t.outlinedPost!.id}`}>
                  <span className="piece-title">{t.outlinedPost!.title}</span>
                  <span className="piece-meta">from “{t.name}” · open outline →</span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}

      {removed.length > 0 && (
        <>
          <h2 className="section-title">Removed</h2>
          <ul className="rows">
            {removed.map((t) => (
              <li key={t.id}>
                <span className="muted">{t.name}</span>
                <button type="button" className="add" disabled={pending} onClick={() => act('restore', () => setThemeRemoved(t.id, false))}>restore</button>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}
