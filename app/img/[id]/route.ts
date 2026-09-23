import { sql } from '@/lib/db';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return new Response('Not found', { status: 404 });
  const [img] = await sql`select content_type, encode(data, 'base64') as b64 from app.images where id = ${id}`;
  if (!img) return new Response('Not found', { status: 404 });
  return new Response(Buffer.from(img.b64, 'base64'), {
    headers: {
      'Content-Type': img.content_type,
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
}
