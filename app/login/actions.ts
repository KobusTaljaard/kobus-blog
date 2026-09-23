'use server';

import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth/server';

const isOwner = (email: string) =>
  !!process.env.OWNER_EMAIL && email === process.env.OWNER_EMAIL.trim().toLowerCase();

export async function sendCode(email: string) {
  const e = email.trim().toLowerCase();
  // Only the owner ever receives a code; anyone else gets the same reply and no email.
  if (!isOwner(e)) return { ok: true };
  const { error } = await auth.emailOtp.sendVerificationOtp({ email: e, type: 'sign-in' });
  if (error) return { error: error.message || 'The code could not be sent.' };
  return { ok: true };
}

export async function verifyCode(email: string, code: string) {
  const e = email.trim().toLowerCase();
  if (!isOwner(e)) return { error: 'That code is not right.' };
  const { error } = await auth.signIn.emailOtp({ email: e, otp: code.trim() });
  if (error) return { error: error.message || 'That code is not right.' };
  redirect('/studio');
}
