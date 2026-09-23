// One skeleton shared by the Outline and Writing tabs, so a change in one shows in the other.
// Outline edits `text` (the idea); Writing edits `body` (the prose). Titles and headings are the same field.

export type Block = { id: string; text: string; body: string; apps: string[] };
export type Point = Block & { forks: Block[] };
export type Doc = {
  v: 1;
  title: Block;
  intro: Block;
  points: Point[];
  outro: Block;
  conclusion: Block;
};

export const newId = () => Math.random().toString(36).slice(2, 10);

export const block = (text = '', id = newId()): Block => ({ id, text, body: '', apps: [] });
export const point = (text = ''): Point => ({ ...block(text), forks: [] });

export function emptyDoc(title = ''): Doc {
  return {
    v: 1,
    title: block(title, 'title'),
    intro: block('', 'intro'),
    points: [point(), point(), point()],
    outro: block('', 'outro'),
    conclusion: block('', 'conclusion'),
  };
}

/** Turns the older Markdown outlines ("# Title", "- point", "  - fork") into a Doc. */
export function docFromMarkdown(md: string, fallbackTitle = ''): Doc {
  const doc = emptyDoc(fallbackTitle);
  doc.points = [];
  const strip = (s: string) => s.replace(/\*\*|__/g, '').trim();
  for (const raw of md.split('\n')) {
    if (!raw.trim()) continue;
    const h = raw.match(/^#\s+(.*)/);
    if (h) {
      doc.title.text = strip(h[1]);
      continue;
    }
    const bullet = raw.match(/^(\s*)[-*]\s+(.*)/);
    if (bullet) {
      const nested = bullet[1].length >= 2;
      if (nested && doc.points.length) doc.points[doc.points.length - 1].forks.push(block(strip(bullet[2])));
      else doc.points.push(point(strip(bullet[2])));
    } else if (!doc.points.length) {
      doc.intro.text = [doc.intro.text, strip(raw)].filter(Boolean).join(' ');
    }
  }
  if (!doc.points.length) doc.points = [point()];
  return doc;
}

/** Normalises anything stored or returned by the AI into a well-formed Doc. */
export function normaliseDoc(input: any, fallbackTitle = ''): Doc {
  const b = (x: any, id?: string): Block => ({
    id: id || (typeof x?.id === 'string' && x.id) || newId(),
    text: typeof x === 'string' ? x : String(x?.text ?? ''),
    body: String(x?.body ?? ''),
    apps: Array.isArray(x?.apps) ? x.apps.map(String).filter((s: string) => s.trim()) : [],
  });
  const d = input || {};
  return {
    v: 1,
    title: b(d.title ?? fallbackTitle, 'title'),
    intro: b(d.intro, 'intro'),
    points: (Array.isArray(d.points) && d.points.length ? d.points : [{}]).map((p: any) => ({
      ...b(p),
      forks: (Array.isArray(p?.forks) ? p.forks : []).map((f: any) => b(f)),
    })),
    outro: b(d.outro, 'outro'),
    conclusion: b(d.conclusion, 'conclusion'),
  };
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** The article as readers see it: points become H2, forks H3, then each block's prose. */
export function compileHtml(doc: Doc): string {
  const parts: string[] = [];
  const add = (heading: string, tag: 'h2' | 'h3', body: string) => {
    if (heading.trim()) parts.push(`<${tag}>${esc(heading.trim())}</${tag}>`);
    if (body.trim()) parts.push(body);
  };
  if (doc.intro.body.trim()) parts.push(doc.intro.body);
  for (const p of doc.points) {
    add(p.text, 'h2', p.body);
    for (const f of p.forks) add(f.text, 'h3', f.body);
  }
  if (doc.outro.body.trim()) parts.push(doc.outro.body);
  if (doc.conclusion.body.trim()) parts.push(doc.conclusion.body);
  return parts.join('\n');
}

/** Every block that holds prose, in reading order, with a label for the Humanizer. */
export function proseBlocks(doc: Doc): { id: string; label: string; body: string }[] {
  const out = [{ id: doc.intro.id, label: 'Intro', body: doc.intro.body }];
  doc.points.forEach((p, i) => {
    out.push({ id: p.id, label: `Point ${i + 1}`, body: p.body });
    p.forks.forEach((f, j) => out.push({ id: f.id, label: `Point ${i + 1}, fork ${j + 1}`, body: f.body }));
  });
  out.push({ id: doc.outro.id, label: 'Outro', body: doc.outro.body });
  out.push({ id: doc.conclusion.id, label: 'Conclusion', body: doc.conclusion.body });
  return out;
}

export function isWritten(doc: Doc | null): boolean {
  return !!doc && proseBlocks(doc).some((b) => b.body.replace(/<[^>]+>/g, '').trim().length > 0);
}

/** The Doc for a stored piece; older pieces kept a Markdown outline instead. */
export function docOf(post: { doc?: any; outline?: string | null; title?: string | null; theme?: string | null }): Doc {
  if (post.doc) return normaliseDoc(post.doc, post.title || '');
  return docFromMarkdown(post.outline || '', post.title || post.theme || '');
}
