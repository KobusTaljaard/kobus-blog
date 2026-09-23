'use server';

import { sql } from '@/lib/db';

export async function subscribe(_prev: unknown, formData: FormData) {
  if (formData.get('website')) return { done: true }; // bot trap
  const email = String(formData.get('email') || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    return { error: 'That email address does not look right.' };
  }
  await sql`insert into app.subscribers (email) values (${email}) on conflict (email) do nothing`;
  return { done: true };
}
