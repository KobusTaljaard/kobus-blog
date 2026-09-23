'use server';

import { sql } from '@/lib/db';

export async function sendMessage(_prev: unknown, formData: FormData) {
  if (formData.get('website')) return { done: true }; // bot trap
  const body = String(formData.get('body') || '').trim();
  const name = String(formData.get('name') || '').trim().slice(0, 120) || null;
  const email = String(formData.get('email') || '').trim().toLowerCase().slice(0, 254) || null;
  const postId = String(formData.get('post') || '');
  if (body.length < 2) return { error: 'Write a few words first.' };
  if (body.length > 4000) return { error: 'That is a little long. Keep it under 4,000 characters.' };
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: 'That email address does not look right.' };
  const post = /^[0-9a-f-]{36}$/.test(postId) ? postId : null;
  await sql`insert into app.messages (post_id, name, email, body) values (${post}, ${name}, ${email}, ${body})`;
  return { done: true };
}
