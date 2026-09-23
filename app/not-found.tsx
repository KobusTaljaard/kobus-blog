import Link from 'next/link';
import Strip from '@/components/Strip';

export default function NotFound() {
  return (
    <>
      <Strip />
      <main className="wrap" style={{ padding: '80px 16px', textAlign: 'center' }}>
        <p>This page isn’t in the notebook.</p>
        <p><Link href="/">Back to the writing</Link></p>
      </main>
    </>
  );
}
