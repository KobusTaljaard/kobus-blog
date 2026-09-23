import { sql } from '@/lib/db';
import { formatDate } from '@/lib/html';
import VoiceEditor from './VoiceEditor';

export const maxDuration = 300;

export default async function VoicePage() {
  const versions = await sql`select id, profile, changes, by, created_at from app.voice order by created_at desc limit 12`;
  const [pass] = await sql`select created_at from app.voice where by <> 'kobus' order by created_at desc limit 1`;
  const [{ n }] = await sql`select count(*)::int as n from app.iterations where created_at > ${pass?.created_at || '1970-01-01'}`;
  return (
    <VoiceEditor
      key={versions[0]?.id || 'none'}
      profile={versions[0]?.profile || ''}
      waiting={n}
      history={versions.map((v) => ({
        id: v.id,
        when: formatDate(v.created_at),
        by: v.by === 'kobus' ? 'You' : v.by === 'manual' ? 'Learned (on request)' : 'Learned (weekly)',
        changes: v.changes,
      }))}
    />
  );
}
