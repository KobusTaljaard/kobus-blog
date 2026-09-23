import { requireOwner } from '@/lib/auth/server';
import { sql } from '@/lib/db';
import StudioNav from './_ui/StudioNav';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Studio', robots: { index: false, follow: false } };

export default async function StudioLayout({ children }: { children: React.ReactNode }) {
  await requireOwner();
  const [{ n }] = await sql`select count(*)::int as n from app.comments where status = 'pending'`;
  return (
    <div className="studio">
      <StudioNav pending={n} />
      <main className="studio-main">{children}</main>
    </div>
  );
}
