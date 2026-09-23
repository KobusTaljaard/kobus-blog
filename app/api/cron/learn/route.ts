import { runLearning } from '@/lib/learn';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

/** Weekly: reads the week's sources, iterations and published posts, and improves the voice profile. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return new Response('Unauthorized', { status: 401 });
  }
  try {
    const r = await runLearning('cron');
    return Response.json(r);
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
