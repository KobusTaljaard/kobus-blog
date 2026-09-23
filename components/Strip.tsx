import Link from 'next/link';

export default function Strip() {
  const main = process.env.MAIN_SITE_URL || 'https://kobustaljaard.lovable.app';
  return (
    <header className="strip">
      <a href={main}>Kobus Taljaard</a>
      <nav>
        <Link href="/">Writing</Link>
      </nav>
    </header>
  );
}
