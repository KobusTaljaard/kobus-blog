import { marked } from 'marked';
import sanitize from 'sanitize-html';
import TurndownService from 'turndown';
import { createHash } from 'crypto';

/** The only formatting the blog allows: headings, paragraphs, bold, italic, quotes, pull quotes, images, and links. */
export function cleanHtml(html: string): string {
  return sanitize(html, {
    allowedTags: ['p', 'h2', 'h3', 'h4', 'strong', 'em', 'b', 'i', 'img', 'br', 'blockquote', 'a', 'aside'],
    allowedAttributes: { img: ['src', 'alt'], a: ['href', 'target', 'rel'], aside: ['class'] },
    allowedClasses: { aside: ['pull-quote'] },
    allowedSchemes: ['https', 'http', 'mailto'],
    allowedSchemesByTag: { img: [] },
    allowProtocolRelative: false,
    transformTags: {
      h1: 'h2',
      b: 'strong',
      i: 'em',
      li: 'p', // no lists on the blog: each item becomes its own line
      // Links to other sites open in a new tab; links within the blog stay in place.
      a: (tagName, attribs): sanitize.Tag => {
        const href = (attribs.href || '').trim();
        return /^https?:/i.test(href)
          ? { tagName, attribs: { href, target: '_blank', rel: 'noopener noreferrer' } }
          : { tagName, attribs: { href } };
      },
      // Pull quotes are the only asides.
      aside: (tagName, attribs): sanitize.Tag => ({ tagName, attribs: { class: 'pull-quote' } }),
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
  // Pull quotes stay as HTML inside the Markdown, so they survive an AI edit and come back intact.
  td.addRule('pullQuote', {
    filter: (node) => node.nodeName === 'ASIDE',
    replacement: (_content, node) => `\n\n<aside class="pull-quote">${(node as HTMLElement).innerHTML}</aside>\n\n`,
  });
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
  return new Date(d).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

