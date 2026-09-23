'use client';

import { useLayoutEffect, useRef } from 'react';

/** A text field that grows with what you write. Enter can be handed to the parent (e.g. "new fork"). */
export default function AutoText({
  value,
  onChange,
  placeholder,
  className = '',
  onEnter,
  onBackspaceEmpty,
  autoFocus,
  ariaLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  onEnter?: () => void;
  onBackspaceEmpty?: () => void;
  autoFocus?: boolean;
  ariaLabel?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = '0px';
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);
  return (
    <textarea
      ref={ref}
      rows={1}
      className={`autotext ${className}`}
      value={value}
      placeholder={placeholder}
      aria-label={ariaLabel || placeholder}
      autoFocus={autoFocus}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && !e.shiftKey && onEnter) {
          e.preventDefault();
          onEnter();
        }
        if (e.key === 'Backspace' && !value && onBackspaceEmpty) {
          e.preventDefault();
          onBackspaceEmpty();
        }
      }}
    />
  );
}
