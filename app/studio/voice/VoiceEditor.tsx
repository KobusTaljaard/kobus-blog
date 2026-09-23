'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { learnNow, saveProfile } from '../actions';

type H = { id: string; when: string; by: string; changes: string };

export default function VoiceEditor({ profile, waiting, history }: { profile: string; waiting: number; history: H[] }) {
  const router = useRouter();
  const [text, setText] = useState(profile);
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');
  const dirty = text.trim() !== profile.trim();

  const learn = () =>
    start(async () => {
      setBusy('learn');
      setMsg('');
      const r = await learnNow();
      setBusy('');
      if ('error' in r && r.error) return setMsg(r.error);
      setMsg('Learned. The profile below is the new version.');
      router.refresh();
    });

  const save = () =>
    start(async () => {
      setBusy('save');
      const r = await saveProfile(text);
      setBusy('');
      if ('error' in r && r.error) return setMsg(r.error);
      setMsg('Saved. Every AI step uses this from now on.');
      router.refresh();
    });

  return (
    <div className="sheet voice">
      <div className="sheet-bar sticky">
        <span className="o-label">What the AI has learned about you</span>
        <span className="grow" />
        <span className="small muted">{waiting} new step{waiting === 1 ? '' : 's'} since the last lesson · learns every Monday</span>
        <button type="button" className="quiet-btn" disabled={pending} onClick={learn}>
          {busy === 'learn' ? 'Learning… (a minute or two)' : 'Learn now'}
        </button>
        <button type="button" className="btn" disabled={pending || !dirty} onClick={save}>
          {busy === 'save' ? 'Saving…' : 'Save my changes'}
        </button>
      </div>
      {msg && <p className="notice">{msg}</p>}
      <p className="small muted voice-intro">
        Every source you upload, every outline and draft, every change you make to the AI&apos;s writing, every Humanizer run, fix and
        dismissal, and every post you publish is recorded. Each week the AI reads all of it and rewrites this profile. Every step (themes,
        outlines, writing, Humanizer, fixes) reads it first. You can correct it here; it learns from your corrections too.
      </p>
      <textarea
        className="voice-text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Nothing learned yet. Press “Learn now” once you have a source or two and a draft you’ve edited."
        spellCheck
      />
      {history.length > 0 && (
        <details className="voice-history">
          <summary>History ({history.length})</summary>
          <ul>
            {history.map((h) => (
              <li key={h.id}>
                <b>{h.when}</b> · {h.by}
                {h.changes && <p className="small">{h.changes}</p>}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
