'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';
import { CHECK_MIN, OVERALL_MIN, norm, plainText, quoteText, type HumanizerResult } from '@/lib/rules';
import { runHumanizer, applyFix, aiFix, dismissFlag, publish, unpublish, savePublishDetails } from '../../actions';
import { pickAndUploadImage } from '../../_ui/images';

type P = {
  id: string;
  title: string;
  html: string;
  hash: string;
  status: string;
  slug: string | null;
  liveOutOfDate: boolean;
  excerpt: string;
  tags: string[];
  featured: string | null;
  qc: HumanizerResult | null;
  qcHash: string | null;
  dismissed: string[];
};

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export default function Humanizer({ p }: { p: P }) {
  const router = useRouter();
  const [qc, setQc] = useState(p.qc);
  const [qcHash, setQcHash] = useState(p.qcHash);
  const hash = p.hash;
  const [open, setOpen] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<string[]>(p.dismissed);
  const [note, setNote] = useState('');
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [excerpt, setExcerpt] = useState(p.excerpt);
  const [tags, setTags] = useState(p.tags.join(', '));
  const [featured, setFeatured] = useState(p.featured);

  const current = !!qc && qcHash === hash;
  const canPublish = current && !!qc?.passed && !!featured;
  const live = p.status === 'published';

  // A flag is open while its passage is still in the text and you haven't set it aside.
  const text = useMemo(() => norm(p.title + '\n' + plainText(p.html)), [p.title, p.html]);
  const state = (quote: string) =>
    dismissed.includes(quote) ? 'left' : text.includes(norm(quoteText(quote))) ? 'open' : 'done';
  const allOpen = useMemo(
    () => (qc ? qc.checks.flatMap((c) => c.flags.filter((f) => state(f.quote) === 'open').map((f) => ({ check: c.name, ...f }))) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [qc, text, dismissed],
  );

  // Mark every open flagged passage in the article so you can see where it sits.
  const marked = useMemo(() => {
    let html = p.html;
    if (!qc) return html;
    for (const f of allOpen) {
      const needle = esc(quoteText(f.quote));
      let at = html.indexOf(needle);
      if (at < 0) at = norm(html).indexOf(norm(needle));
      if (at < 0) continue;
      html = html.slice(0, at) + `<mark title="${esc(f.check + ': ' + f.issue)}">` + html.slice(at, at + needle.length) + '</mark>' + html.slice(at + needle.length);
    }
    return html;
  }, [p.html, qc, allOpen]);

  const run = () =>
    start(async () => {
      setBusy('run');
      setError('');
      const r = await runHumanizer(p.id);
      setBusy('');
      if ('error' in r && r.error) return setError(r.error);
      if (r.result) {
        setQc(r.result);
        setQcHash(r.hash!);
        setDismissed([]);
        setNote('');
        const firstWeak = r.result.checks.find((c) => c.gate && c.score < CHECK_MIN) || r.result.checks[0];
        setOpen(firstWeak?.key || null);
      }
    });

  const fix = (quote: string, replacement: string) =>
    start(async () => {
      setError('');
      const r = await applyFix(p.id, quote, replacement);
      if ('error' in r && r.error) return setError(r.error);
      router.refresh();
    });

  const letAiFix = (flags: { check: string; quote: string; issue: string; fix?: string }[], tag: string) =>
    start(async () => {
      setBusy(tag);
      setError('');
      setNote('');
      const r = await aiFix(p.id, flags);
      setBusy('');
      if ('error' in r && r.error) return setError(r.error);
      setNote(`${r.note || 'Fixed.'}${r.missed ? ` (${r.missed} edit${r.missed === 1 ? '' : 's'} could not be placed.)` : ''} Run the Humanizer again when you're done.`);
      router.refresh();
    });

  const leave = (f: { check: string; quote: string; issue: string }) =>
    start(async () => {
      setDismissed((d) => [...d, f.quote]);
      await dismissFlag(p.id, f);
    });

  const saveDetails = async (next?: { featured?: string | null }) => {
    await savePublishDetails(p.id, {
      excerpt,
      tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
      featured_image_id: next && 'featured' in next ? next.featured! : featured,
    });
  };

  const doPublish = () =>
    start(async () => {
      setBusy('publish');
      setError('');
      await saveDetails();
      const r = await publish(p.id);
      setBusy('');
      if ('error' in r && r.error) return setError(r.error);
      router.refresh();
    });

  return (
    <div className="hum">
      <article className="hum-article prose">
        <h1>{p.title || 'Untitled'}</h1>
        {p.html ? <div dangerouslySetInnerHTML={{ __html: marked }} /> : <p className="muted">Nothing written yet. <Link href={`/studio/writing/${p.id}`}>Go to Writing</Link>.</p>}
      </article>

      <aside className="hum-panel">
        <div className="hum-head">
          {qc ? (
            <div className={`overall ${qc.passed ? 'pass' : 'fail'}`}>
              <b>{qc.overall}</b>
              <span>{qc.passed ? 'Ready to publish' : `Needs ${OVERALL_MIN}+ overall and ${CHECK_MIN}+ on each check`}</span>
            </div>
          ) : (
            <p className="muted">Five checks: AI detection, natural flow and grammar, argument and progression, sounds like you, and SEO/AI search (advice only).</p>
          )}
          <button type="button" className="btn" disabled={pending || !p.html} onClick={run}>
            {busy === 'run' ? 'Reading… (about a minute)' : qc ? 'Run again' : 'Run the Humanizer'}
          </button>
        </div>
        {qc && !current && <p className="notice">The text changed since this run. Run it again to publish.</p>}
        {qc?.summary && <p className="hum-summary">{qc.summary}</p>}
        {allOpen.length > 0 && (
          <div className="fix-all">
            <button type="button" className="btn" disabled={pending} onClick={() => letAiFix(allOpen, 'all')}>
              {busy === 'all' ? 'Fixing… (a minute or two)' : `AI fix everything (${allOpen.length})`}
            </button>
            <Link className="quiet-btn" href={`/studio/writing/${p.id}`}>Fix them myself in Writing →</Link>
          </div>
        )}
        {note && <p className="notice">{note}</p>}

        {qc?.checks.map((c) => (
          <div key={c.key} className={`check ${open === c.key ? 'open' : ''}`}>
            <button type="button" className="check-head" onClick={() => setOpen(open === c.key ? null : c.key)} aria-expanded={open === c.key}>
              <span className="check-name">{c.name}{!c.gate && <em> · advice</em>}</span>
              <span className="bar"><span style={{ width: `${c.score}%` }} className={c.gate && c.score < CHECK_MIN ? 'low' : ''} /></span>
              <span className="check-score">{c.score}</span>
            </button>
            {open === c.key && (
              <div className="check-body">
                <p>{c.summary}</p>
                {c.flags.length === 0 && <p className="muted">Nothing to fix here.</p>}
                {c.flags.some((f) => state(f.quote) === 'open') && c.flags.filter((f) => state(f.quote) === 'open').length > 1 && (
                  <button
                    type="button"
                    className="add"
                    disabled={pending}
                    onClick={() => letAiFix(c.flags.filter((f) => state(f.quote) === 'open').map((f) => ({ check: c.name, ...f })), c.key)}
                  >
                    {busy === c.key ? 'fixing…' : `let AI fix all ${c.flags.filter((f) => state(f.quote) === 'open').length} here`}
                  </button>
                )}
                <ul>
                  {c.flags.map((f, i) => {
                    const st = state(f.quote);
                    const tag = `${c.key}-${i}`;
                    return (
                      <li key={i} className={st !== 'open' ? 'done' : ''}>
                        <q>{f.quote}</q>
                        <span>{f.issue}</span>
                        {f.fix && st === 'open' && (
                          <span className="fix">
                            <em>{f.fix}</em>
                          </span>
                        )}
                        {st === 'open' ? (
                          <span className="flag-actions">
                            <button type="button" className="add strong" disabled={pending} onClick={() => letAiFix([{ check: c.name, ...f }], tag)}>
                              {busy === tag ? 'fixing…' : 'let AI fix this'}
                            </button>
                            {f.fix && (
                              <button type="button" className="add" disabled={pending} onClick={() => fix(f.quote, f.fix!)}>use the suggestion</button>
                            )}
                            <button type="button" className="add" disabled={pending} onClick={() => leave({ check: c.name, ...f })}>leave it</button>
                          </span>
                        ) : (
                          <span className="muted small">{st === 'left' ? 'left as it is' : '✓ changed'}</span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </div>
        ))}

        <div className="publish-box">
          <span className="o-label">Publishing</span>
          <div className="feature-pick">
            {featured ? <img src={`/img/${featured}`} alt="Featured image" /> : <span className="muted">No featured image yet</span>}
            <button
              type="button"
              className="add"
              onClick={async () => {
                try {
                  const idImg = await pickAndUploadImage();
                  if (idImg) {
                    setFeatured(idImg);
                    await saveDetails({ featured: idImg });
                  }
                } catch (e) {
                  setError(e instanceof Error ? e.message : 'The image could not be added.');
                }
              }}
            >
              {featured ? 'replace image' : '+ featured image'}
            </button>
          </div>
          <label className="small muted" htmlFor="ex">Excerpt (on the blog's list page)</label>
          <textarea id="ex" className="field" rows={3} value={excerpt} onChange={(e) => setExcerpt(e.target.value)} onBlur={() => saveDetails()} />
          <label className="small muted" htmlFor="tg">Tags, separated by commas</label>
          <input id="tg" className="field" value={tags} onChange={(e) => setTags(e.target.value)} onBlur={() => saveDetails()} />
          <div className="actions">
            <button type="button" className="btn" disabled={!canPublish || pending} onClick={doPublish}>
              {busy === 'publish' ? 'Publishing…' : live ? (p.liveOutOfDate ? 'Update the live post' : 'Publish again') : 'Publish'}
            </button>
            {live && p.slug && <a className="quiet-btn" href={`/writing/${p.slug}`} target="_blank" rel="noreferrer">View on the blog</a>}
            {live && <button type="button" className="add" disabled={pending} onClick={() => start(async () => { await unpublish(p.id); router.refresh(); })}>unpublish</button>}
          </div>
          {!featured && current && qc?.passed && <p className="small muted">Add a featured image to publish.</p>}
          {live && p.liveOutOfDate && <p className="small muted">Readers still see the last published version until you update it.</p>}
        </div>
        {error && <p className="notice error">{error}</p>}
      </aside>
    </div>
  );
}
