import Link from 'next/link';
import Strip from '@/components/Strip';

export default function Home() {
  return (
    <>
      <Strip />
      <main className="cover-desk">
        <Link href="/writing" className="cover" aria-label="Open the notebook: read Kobus Taljaard's writing">
          <span className="deboss">Kobus<br />Taljaard</span>
        </Link>
      </main>
    </>
  );
}
