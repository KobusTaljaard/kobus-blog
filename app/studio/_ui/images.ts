'use client';

import { uploadImage } from '../actions';

/** Lets you pick a photo, shrinks it in the browser, uploads it, and returns its id. */
export async function pickAndUploadImage(): Promise<string | null> {
  const file: File | null = await new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/jpeg,image/png,image/webp,image/heic';
    input.onchange = () => resolve(input.files?.[0] || null);
    input.click();
  });
  if (!file) return null;
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1800 / bitmap.width);
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, w, h);
  const blob: Blob = await new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('Could not read image'))), 'image/jpeg', 0.84));
  const fd = new FormData();
  fd.append('file', new File([blob], 'image.jpg', { type: 'image/jpeg' }));
  fd.append('width', String(w));
  fd.append('height', String(h));
  const r = await uploadImage(fd);
  if ('error' in r && r.error) throw new Error(r.error);
  return r.id!;
}
