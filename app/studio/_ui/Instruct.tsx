'use client';

import { useState } from 'react';

/** A plain box to tell the AI exactly what you want done. Enter sends; Shift+Enter makes a new line. */
export default function Instruct({
  onSend,
  busy,
  disabled,
  placeholder = 'Tell the AI what to change, e.g. “Capitalize every pronoun that refers to Christ.”',
  label = 'Do it',
  compact = false,
}: {
  onSend: (text: string) => Promise<boolean | void> | void;
  busy: boolean;
  disabled?: boolean;
  placeholder?: string;
  label?: string;
  compact?: boolean;
}) {
  const [text, setText] = useState('');
  const send = async () => {
    const t = text.trim();
    if (!t) return;
    const ok = await onSend(t);
    if (ok !== false) setText('');
  };
  return (
    <div className={`instruct${compact ? ' compact' : ''}`}>
      <textarea
        rows={compact ? 2 : 3}
        value={text}
        placeholder={placeholder}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            send();
          }
        }}
      />
      <button type="button" className="btn small-btn" disabled={disabled || busy || !text.trim()} onClick={send}>
        {busy ? 'Working…' : label}
      </button>
    </div>
  );
}
