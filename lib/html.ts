import { marked } from 'marked';
import sanitize from 'sanitize-html';
import TurndownService from 'turndown';
import { createHash } from 'crypto';

/** The only formatting the blog allows: headings, paragraphs, bold, italic, images, and links. */
export function cleanHtml(html: string): string {
  return sanitize(html, {
    allowedTags: ['p', 'h2', 'h3', 'strong', 'em', 'b', 'i', 'img', 'br', 'blockquote', 'a'],
    allowedAttributes: { img: ['src', 'alt'], a: ['href'] },
    allowedSchemes: ['https', 'http', 'mailto'],
    allowedSchemesByTag: { img: [] },
    allowProtocolRelative: false,
    transformTags: {
      h1: 'h2',
      b: 'strong',
      i: 'em',
      li: 'p', // no lists on the blog: each item becomes its own line
      img: (tagName, attribs): sanitize.Tag => {
        // Only images uploaded to this app are allowed.
        const src = attribs.src || '';
        return /^\/img\/[0-9a-f-]{36}$/.test(src)
          ? { tagName, attribs: { src, alt: attribs.alt || '' } }
          : { tagName: 'span', attribs: {} as sanitize.Attributes };
      },
    },
    exclusiveFilter: (frame) => frame.tag === 'span' && !frame.text.trim(),
  });
}

export function markdownToHtml(md: string): string {
  return cleanHtml(marked.parse(md, { async: false }) as string);
}

export function htmlToMarkdown(html: string): string {
  const td = new TurndownService({ headingStyle: 'atx', emDelimiter: '*' });
  return td.turndown(html || '');
}

export function contentHash(title: string, bodyHtml: string): string {
  return createHash('sha256').update(title.trim() + '\n' + bodyHtml).digest('hex');
}

export function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'post'
  );
}

export function formatDate(d: string | Date | null | undefined): string {
  if (!d) return '';
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}
