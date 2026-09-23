// Shared by the server and the browser: no database code here.

export type Flag = { quote: string; issue: string; fix?: string };
export type Check = { key: string; name: string; gate: boolean; score: number; summary: string; flags: Flag[] };
export type HumanizerResult = { checks: Check[]; summary: string; overall: number; passed: boolean; model: string };

/** Publishing needs each core check at 80+ and the core average at 85+. SEO is advice only. */
export const CHECK_MIN = 80;
export const OVERALL_MIN = 85;

/** Same-length normalisation so a flagged quote still matches despite curly quotes or dashes. */
export function norm(s: string): string {
  return s
    .replace(/[\u2018\u2019\u201B\u2032]/g, "'")
    .replace(/[\u201C\u201D\u201F\u2033]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\u00A0/g, ' ');
}

/** Plain text of stored HTML, for "is this passage still there?" checks. */
export function plainText(html: string): string {
  return html
    .replace(/<\/(p|h[1-6]|blockquote)>/g, '\n')
    .replace(/<br\s*\/?>/g, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}

/** Strips Markdown emphasis the reviewer may have kept in a quote. */
export const quoteText = (q: string) => q.replace(/\*\*|__|\*|_/g, '').trim();

export type OpenFlag = { key: string; check: string; quote: string; issue: string; fix?: string };

/** Flags from the last Humanizer run that still apply to the current text and weren't dismissed. */
export function openFlags(qc: HumanizerResult | null, title: string, html: string, dismissed: string[]): OpenFlag[] {
  if (!qc) return [];
  const text = norm(title + '\n' + plainText(html));
  const out: OpenFlag[] = [];
  for (const c of qc.checks)
    for (const f of c.flags) {
      const q = quoteText(f.quote);
      if (!q || dismissed.includes(f.quote)) continue;
      if (!text.includes(norm(q))) continue;
      out.push({ key: `${c.key}:${f.quote}`, check: c.name, quote: f.quote, issue: f.issue, fix: f.fix });
    }
  return out;
}
