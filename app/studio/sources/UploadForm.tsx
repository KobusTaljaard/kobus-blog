'use client';

import { useActionState, useState } from 'react';
import { uploadSource } from '../actions';

export default function UploadForm() {
  const [state, action, pending] = useActionState(uploadSource, null as null | { error?: string });
  const [name, setName] = useState('');
  return (
    <form action={action} style={{ display: 'grid', gap: 12 }}>
      <label className="field" style={{ cursor: 'pointer' }}>
        <input
          type="file"
          name="file"
          accept=".md,.txt,text/markdown,text/plain"
          required
          style={{ display: 'none' }}
          onChange={(e) => setName(e.target.files?.[0]?.name || '')}
        />
        {name || 'Choose a transcript (.md)'}
      </label>
      <div className="actions" style={{ margin: 0 }}>
        <button className="btn" disabled={pending || !name}>{pending ? 'Reading your entry…' : 'Upload'}</button>
        {pending && <span className="muted small">Finding the themes and outlining them. This takes a minute or two.</span>}
      </div>
      {state?.error && <p className="notice error">{state.error}</p>}
    </form>
  );
}
