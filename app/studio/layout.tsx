import Link from 'next/link';
import { requireOwner } from '@/lib/auth/server';
import { signOut } from './actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Studio', robots: { index: false, follow: false } };

export default async function StudioLayout({ children }: { children: React.ReactNode }) {
  await requireOwner();
  return (
    <>
      <header className="studio-bar">
        <Link href="/studio">Studio</Link>
        <nav>
          <Link href="/studio">Posts</Link>
          <Link href="/studio/sources">Sources</Link>
          <Link href="/studio/messages">Messages</Link>
          <Link href="/">Blog</Link>
          <form action={signOut}><button className="link-btn">Sign out</button></form>
        </nav>
      </header>
      <main className="wide" style={{ paddingBottom: 80 }}>{children}</main>
    </>
  );
}
