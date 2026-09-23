'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

// The tabs, in the order you work. The tab you're on and every step before it slide to the left;
// the steps still ahead wait on the right.
const TABS = [
  { key: 'sources', label: ['Original', 'Sources'] },
  { key: 'themes', label: ['Themes'] },
  { key: 'outlines', label: ['Outlines'] },
  { key: 'writing', label: ['Writing'] },
  { key: 'humanizer', label: ['Humanizer'] },
  { key: 'blog', label: ['Blog'] },
  { key: 'comments', label: ['Comments'] },
] as const;

const PIECE_TABS = new Set(['outlines', 'writing', 'humanizer']);

export default function StudioNav({ pending }: { pending: number }) {
  const path = usePathname() || '';
  const [, , section, pieceId] = path.split('/'); // /studio/<section>/<id>
  const current = Math.max(0, TABS.findIndex((t) => t.key === section));

  const href = (key: string) => {
    if (key === 'blog') return '/writing';
    if (PIECE_TABS.has(key) && pieceId && PIECE_TABS.has(section)) return `/studio/${key}/${pieceId}`;
    return `/studio/${key}`;
  };

  const tab = (t: (typeof TABS)[number], i: number) => (
    <Link key={t.key} href={href(t.key)} className={`tab${i === current ? ' on' : ''}`} aria-current={i === current ? 'page' : undefined}>
      <span className="tab-label">
        {t.label.map((l) => (
          <span key={l}>{l}</span>
        ))}
      </span>
      {t.key === 'comments' && pending > 0 && <span className="badge" aria-label={`${pending} waiting`}>{pending}</span>}
    </Link>
  );

  return (
    <nav className="studio-nav no-print" aria-label="Studio">
      <div className="tabs-done">{TABS.slice(0, current + 1).map((t, i) => tab(t, i))}</div>
      <div className="tabs-ahead">{TABS.slice(current + 1).map((t, i) => tab(t, current + 1 + i))}</div>
    </nav>
  );
}
