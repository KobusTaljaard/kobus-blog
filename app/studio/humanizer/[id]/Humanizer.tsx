'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState, useTransition } from 'react';
import { CHECK_MIN, OVERALL_MIN, norm, plainText, pullQuotes, quoteText, type HumanizerResult } from '@/lib/rules';
import {
  runHumanizer,
  applyFix,
  aiFix,
  aiInstruct,
  dismissFlag,
  makePullQuote,
  publish,
  unpublish,
  savePublishDetails,
} from '../../actions';
import { pickAndUploadImage } from '../../_ui/images';
import Instruct from '../../_ui/Instruct';

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

type F = { check: string; quote: string; issue: string; fix?: string };

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function QuoteCard({ text, path }: { text: string; path: string | null }) {
  const [copied, setCopied] = useState(false);
  const [origin, setOrigin] = useState('');
  useEffect(() => setOrigin(window.location.origin), []);
  const url = path && origin ? origin + path : null;
  const post = `“${text}”${url ? `\n\n${url}` : ''}`;
  const len = post.length;
  return (
    <li>
      <span className="pq-text">“{text}”</span>
      <span className="flag-actions">
        <button
          type="button"
          className="add strong"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(post);
              setCopied(true);
              setTimeout(() => setCopied(false), 1600);
            } catch {
              /* clipboard blocked */
            }
          }}
        >
          {copied ? 'copied' : 'copy for a social post'}
        </button>
        <a className="add" href={`https://x.com/intent/post?text=${encodeURIComponent(post)}`} target="_blank" rel="noopener noreferrer">
          post on X
        </a>
        <span className={`small ${len > 280 ? 'over' : 'muted'}`}>{len} characters{len > 280 ? ' (too long for X)' : ''}</span>
      </span>
    </li>
  );
}

export default function Humanizer({ p }: { p: P }) {
  const router = useRouter();
  const [qc, setQc] = useState(p.qc);
  const [qcHash, setQcHash] = useState(p.qcHash);
  const hash = p.hash;
  const [open, setOpen] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<string[]>(p.dismissed);
  const [asking, setAsking] = useState<string | null>(null); // which flag has its "tell AI how" box open
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
  const quotes = useMemo(() => pullQuotes(p.html), [p.html]);

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

  const done = (r: { error?: string; note?: string; missed?: number }, fallback: string) => {
    if (r.error) {
      setError(r.error);
      return false;
    }
    setNote(`${r.note || fallback}${r.missed ? ` (${r.missed} edit${r.missed === 1 ? '' : 's'} could not be placed.)` : ''} Run the Humanizer again when you're done.`);
    router.refresh();
    return true;
  };

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

  const letAiFix = (flags: F[], tag: string) =>
    start(async () => {
      setBusy(tag);
      setError('');
      setNote('');
      const r = await aiFix(p.id, flags);
      setBusy('');
      done(r as never, 'Fixed.');
    });

  const instruct = (instruction: string, flag?: F, tag = 'instruct') =>
    new Promise<boolean>((resolve) =>
      start(async () => {
        setBusy(tag);
        setError('');
        setNote('');
        const r = await aiInstruct(p.id, instruction, flag);
        setBusy('');
        const ok = done(r as never, 'Done.');
        if (ok) setAsking(null);
        resolve(ok);
      }),
    );

  const toQuote = (f: F, tag: string) =>
    start(async () => {
      setBusy(tag);
      setError('');
      const r = await makePullQuote(p.id, f);
      setBusy('');
      if ('error' in r && r.error) return setError(r.error);
      setDismissed((d) => [...d, f.quote]);
      setNote('Made it a pull quote. It sits after its paragraph and is listed under Publishing for social posts.');
      router.refresh();
    });

  const leave = (f: F) =>
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

  const pickFeatured = async () => {
    try {
      const idImg = await pickAndUploadImage();
      if (idImg) {
        setFeatured(idImg);
        await saveDetails({ featured: idImg });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The image could not be added.');
    }
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

  const publishBox = (
    <div className="publish-box">
      <span className="o-label">Publishing</span>
      <div className={`feature-pick${featured ? '' : ' empty'}`}>
        {featured ? (
          <img src={`/img/${featured}`} alt="Featured image" />
        ) : (
          <button type="button" className="feature-drop" onClick={pickFeatured}>
            + Add the featured image
            <span className="small muted">Shown at the top of the post and on shared links. Needed to publish.</span>
          </button>
        )}
        {featured && (
          <button type="button" className="add" onClick={pickFeatured}>replace image</button>
        )}
      </div>
      <label className="small muted" htmlFor="ex">Excerpt (on the blog&apos;s list page and shared links)</label>
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
      {!canPublish && (
        <p className="small muted">
          To publish: {[!qc || !current ? 'run the Humanizer on the current text' : '', current && qc && !qc.passed ? `reach ${OVERALL_MIN}+ overall and ${CHECK_MIN}+ on each check` : '', !featured ? 'add the featured image' : ''].filter(Boolean).join('; ')}.
        </p>
      )}
      {live && p.liveOutOfDate && <p className="small muted">Readers still see the last published version until you update it.</p>}

      {quotes.length > 0 && (
        <div className="pq-list">
          <span className="o-label">Pull quotes, ready for social posts</span>
          <ul>
            {quotes.map((q, i) => (
              <QuoteCard key={i} text={q} path={live && p.slug ? `/writing/${p.slug}` : null} />
            ))}
          </ul>
        </div>
      )}
    </div>
  );

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

        {/* Ready to go: publishing comes first. */}
        {current && qc?.passed && publishBox}

        {p.html && (
          <div className="instruct-wrap">
            <span className="o-label">Tell the AI what to change</span>
            <Instruct busy={busy === 'instruct'} disabled={pending} onSend={(t) => instruct(t)} />
          </div>
        )}

        {allOpen.length > 0 && (
          <div className="fix-all">
            <button type="button" className="btn" disabled={pending} onClick={() => letAiFix(allOpen, 'all')}>
              {busy === 'all' ? 'Fixing… (a minute or two)' : `AI fix everything (${allOpen.length})`}
            </button>
            <Link className="quiet-btn" href={`/studio/writing/${p.id}`}>Fix them myself in Writing →</Link>
          </div>
        )}
        {note && <p className="notice">{note}</p>}
        {error && <p className="notice error">{error}</p>}

        {qc?.checks.map((c) => {
          const openHere = c.flags.filter((f) => state(f.quote) === 'open');
          return (
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
                  {openHere.length > 1 && (
                    <button type="button" className="add" disabled={pending} onClick={() => letAiFix(openHere.map((f) => ({ check: c.name, ...f })), c.key)}>
                      {busy === c.key ? 'fixing…' : `let AI fix all ${openHere.length} here`}
                    </button>
                  )}
                  <ul>
                    {c.flags.map((f, i) => {
                      const st = state(f.quote);
                      const tag = `${c.key}-${i}`;
                      const flag = { check: c.name, ...f };
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
                            <>
                              <span className="flag-actions">
                                <button type="button" className="add strong" disabled={pending} onClick={() => letAiFix([flag], tag)}>
                                  {busy === tag ? 'fixing…' : 'let AI fix this'}
                                </button>
                                <button type="button" className="add" disabled={pending} onClick={() => setAsking(asking === tag ? null : tag)}>
                                  tell AI how
                                </button>
                                {f.fix && (
                                  <button type="button" className="add" disabled={pending} onClick={() => fix(f.quote, f.fix!)}>use the suggestion</button>
                                )}
                                <button type="button" className="add" disabled={pending} onClick={() => toQuote(flag, `pq-${tag}`)}>
                                  {busy === `pq-${tag}` ? 'moving…' : 'make it a pull quote'}
                                </button>
                                <button type="button" className="add" disabled={pending} onClick={() => leave(flag)}>leave it</button>
                              </span>
                              {asking === tag && (
                                <Instruct
                                  compact
                                  busy={busy === `ask-${tag}`}
                                  disabled={pending}
                                  placeholder="What should the AI do with this passage?"
                                  onSend={(t) => instruct(t, flag, `ask-${tag}`)}
                                />
                              )}
                            </>
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
          );
        })}

        {!(current && qc?.passed) && publishBox}
      </aside>
    </div>
  );
}
