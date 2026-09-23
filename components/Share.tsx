'use client';

import { useEffect, useState } from 'react';

/** Plain share links: no tracking scripts, nothing loads from the networks until a reader clicks. */
export default function Share({ title }: { title: string }) {
  const [url, setUrl] = useState('');
  const [copied, setCopied] = useState(false);
  const [native, setNative] = useState(false);
  useEffect(() => {
    setUrl(window.location.origin + window.location.pathname);
    setNative(typeof navigator.share === 'function');
  }, []);

  const u = encodeURIComponent(url);
  const t = encodeURIComponent(title);
  const links = [
    { name: 'WhatsApp', href: `https://wa.me/?text=${t}%20${u}` },
    { name: 'Facebook', href: `https://www.facebook.com/sharer/sharer.php?u=${u}` },
    { name: 'X', href: `https://x.com/intent/post?text=${t}&url=${u}` },
    { name: 'LinkedIn', href: `https://www.linkedin.com/sharing/share-offsite/?url=${u}` },
    { name: 'Email', href: `mailto:?subject=${t}&body=${u}` },
  ];

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard blocked: the reader can copy from the address bar */
    }
  };

  if (!url) return null;
  return (
    <div className="share" aria-label="Share this post">
      <span className="share-label">Share</span>
      {native && (
        <button type="button" onClick={() => navigator.share({ title, url }).catch(() => {})}>
          Share…
        </button>
      )}
      {links.map((l) => (
        <a key={l.name} href={l.href} target="_blank" rel="noopener noreferrer">
          {l.name}
        </a>
      ))}
      <button type="button" onClick={copy}>{copied ? 'Copied' : 'Copy link'}</button>
    </div>
  );
}
