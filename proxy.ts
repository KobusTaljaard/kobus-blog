import { auth } from '@/lib/auth/server';

// Guards the studio and completes the magic-link sign-in (the link lands on /studio).
export default auth.middleware({ loginUrl: '/login' });

export const config = {
  matcher: ['/studio/:path*', '/studio'],
};
