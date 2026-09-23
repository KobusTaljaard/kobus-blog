'use server';

import { headers } from 'next/headers';
import { createHash } from 'crypto';
import { sql } from '@/lib/db';

/** A one-way fingerprint of the sender's network address, so spammers can be blocked without storing IPs. */
async function senderId() {
  const h = await headers();
  const ip = (h.get('x-forwarded-for') || '').split(',')[0].trim() || h.get('x-real-ip') || 'unknown';
  return createHash('sha256').update(`${ip}:${process.env.DATABASE_URL}`).digest('hex').slice(0, 32);
}

export async function postComment(_prev: unknown, formData: FormData) {
  if (formData.get('website')) return { done: true }; // bot trap
  const postId = String(formData.get('post') || '');
  const name = String(formData.get('name') || '').trim().slice(0, 80);
  const email = String(formData.get('email') || '').trim().toLowerCase().slice(0, 254) || null;
  const body = String(formData.get('body') || '').trim();
  if (!/^[0-9a-f-]{36}$/.test(postId)) return { error: 'Something went wrong. Please reload the page.' };
  if (!name) return { error: 'Please add your name.' };
  if (body.length < 2) return { error: 'Write a few words first.' };
  if (body.length > 3000) return { error: 'Please keep it under 3,000 characters.' };
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: 'That email address does not look right.' };

  const sender = await senderId();
  const [blocked] = await sql`select 1 from app.blocked
    where (kind = 'sender' and value = ${sender}) or (kind = 'email' and value = ${email ?? ''})`;
  if (blocked) return { done: true }; // blocked senders see the normal thank-you and nothing is stored

  const [{ n }] = await sql`select count(*)::int as n from app.comments
    where sender = ${sender} and created_at > now() - interval '1 hour'`;
  if (n >= 5) return { error: 'Thank you. Please wait a while before commenting again.' };

  const [post] = await sql`select 1 from app.posts where id = ${postId} and status = 'published'`;
  if (!post) return { error: 'This post is no longer available.' };

  await sql`insert into app.comments (post_id, name, email, body, sender)
            values (${postId}, ${name}, ${email}, ${body}, ${sender})`;
  return { done: true };
}
