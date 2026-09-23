import { createNeonAuth } from '@neondatabase/auth/next/server';
import { redirect } from 'next/navigation';
import { createHash } from 'crypto';

// A dedicated secret wins; otherwise derive one from the (already secret) database URL.
const cookieSecret =
  process.env.NEON_AUTH_COOKIE_SECRET ||
  createHash('sha256').update(`${process.env.DATABASE_URL}:neon-auth-cookie`).digest('base64');

export const auth = createNeonAuth({
  baseUrl: process.env.NEON_AUTH_BASE_URL!,
  cookies: {
    secret: cookieSecret,
    // Magic links arrive from an email app (a cross-site navigation), so the
    // session cookie must survive that first request.
    sameSite: 'lax',
  },
});

function isOwner(email: string | null | undefined) {
  const owner = (process.env.OWNER_EMAIL || '').trim().toLowerCase();
  return !!owner && !!email && email.trim().toLowerCase() === owner;
}

/** Use at the top of every studio page and server action. */
export async function requireOwner() {
  const { data: session } = await auth.getSession();
  if (!session?.user) redirect('/login');
  if (!isOwner(session.user.email)) redirect('/login?denied=1');
  return session.user;
}

export async function viewerIsOwner() {
  try {
    const { data: session } = await auth.getSession();
    return isOwner(session?.user?.email);
  } catch {
    return false;
  }
}
