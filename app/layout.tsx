import type { Metadata, Viewport } from 'next';
import { Courier_Prime } from 'next/font/google';
import './globals.css';

// American Typewriter ships with Apple devices. Elsewhere, Courier Prime stands in.
const fallback = Courier_Prime({
  weight: ['400', '700'],
  style: ['normal', 'italic'],
  subsets: ['latin'],
  variable: '--font-fallback',
  display: 'swap',
});

export const metadata: Metadata = {
  title: { default: 'Kobus Taljaard — Writing', template: '%s — Kobus Taljaard' },
  description: 'Notebook entries by Kobus Taljaard.',
};

export const viewport: Viewport = { themeColor: '#f5f0e6' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-ZA" className={fallback.variable}>
      <body>{children}</body>
    </html>
  );
}
