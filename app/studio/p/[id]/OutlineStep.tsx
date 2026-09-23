'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { saveOutline, generateDraft, deletePost } from '../../actions';

export default function OutlineStep({
  id,
  theme,
  initialOutline,
  source,
}: {
  id: string;
  theme: string;
  initialOutline: string;
  source: React.ReactNode;
}) {
  const router = useRouter();
  const [outline, setOutline] = useState(initialOutline);
  const [saved, setSaved] = useState(initialOutline);
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState<'' | 'save' | 'draft'>('');
  const [error, setError] = useState('');

  const save = () =>
    start(async () => {
      setBusy('save');
      await saveOutline(id, outline);
      setSaved(outline);
      setBusy('');
    });

  const draft = () =>
    start(async () => {
      setBusy('draft');
      setError('');
      const r = await generateDraft(id, outline);
      setBusy('');
      if (r?.error) setError(r.error);
      else router.refresh();
    });

  return (
    <>
      <p className="section-title" style={{ marginTop: 16 }}>Outline</p>
      <h1 style={{ fontWeight: 'normal', fontSize: '1.5rem', margin: '0' }}>{theme || 'Untitled theme'}</h1>
      {source}
      <textarea
        className="field outline-box"
        value={outline}
        onChange={(e) => setOutline(e.target.value)}
        disabled={busy === 'draft'}
        aria-label="Outline"
      />
      <div className="actions">
        <button className="btn" onClick={draft} disabled={pending || !outline.trim()}>
          {busy === 'draft' ? 'Writing the draft…' : 'Approve and write draft'}
        </button>
        <button className="btn ghost" onClick={save} disabled={pending || outline === saved}>
          {busy === 'save' ? 'Saving…' : outline === saved ? 'Saved' : 'Save outline'}
        </button>
        {busy === 'draft' && <span className="muted small">This takes a minute or two.</span>}
      </div>
      {error && <p className="notice error">{error}</p>}
      <p className="small" style={{ marginTop: 48 }}>
        <button
          className="link-btn danger"
          disabled={pending}
          onClick={() => {
            if (window.confirm('Discard this outline? The source stays saved.')) start(() => deletePost(id));
          }}
        >
          Discard this outline
        </button>
      </p>
    </>
  );
}
