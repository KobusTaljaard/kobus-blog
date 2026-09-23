'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';
import { CHECK_MIN, OVERALL_MIN, type HumanizerResult } from '@/lib/rules';
import { runHumanizer, applyFix, publish, unpublish, savePublishDetails } from '../../actions';
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
};

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export default function Humanizer({ p }: { p: P }) {
  const router = useRouter();
  const [qc, setQc] = useState(p.qc);
  const [qcHash, setQcHash] = useState(p.qcHash);
  const hash = p.hash;
  const [open, setOpen] = useState<string | null>(null);
  const [fixed, setFixed] = useState<Set<string>>(new Set());
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [excerpt, setExcerpt] = useState(p.excerpt);
  const [tags, setTags] = useState(p.tags.join(', '));
  const [featured, setFeatured] = useState(p.featured);

  const current = !!qc && qcHash === hash;
  const canPublish = current && !!qc?.passed && !!featured;
  const live = p.status === 'published';

  // Mark every flagged passage in the article so you can see where it sits.
  const marked = useMemo(() => {
    let html = p.html;
    if (!qc || !current) return html;
    for (const c of qc.checks)
      for (const f of c.flags) {
        const needle = esc(f.quote);
        if (!fixed.has(f.quote) && html.includes(needle)) html = html.replace(needle, `<mark title="${esc(c.name)}">${needle}</mark>`);
      }
    return html;
  }, [p.html, qc, current, fixed]);

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
        setFixed(new Set());
        const firstWeak = r.result.checks.find((c) => c.gate && c.score < CHECK_MIN) || r.result.checks[0];
        setOpen(firstWeak?.key || null);
      }
    });

  const fix = (quote: string, text: string) =>
    start(async () => {
      setError('');
      const r = await applyFix(p.id, quote, text);
      if ('error' in r && r.error) return setError(r.error);
      setFixed((s) => new Set(s).add(quote));
      router.refresh();
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
                <ul>
                  {c.flags.map((f, i) => (
                    <li key={i} className={fixed.has(f.quote) ? 'done' : ''}>
                      <q>{f.quote}</q>
                      <span>{f.issue}</span>
                      {f.fix && (
                        <span className="fix">
                          <em>{f.fix}</em>
                          {fixed.has(f.quote) ? (
                            <span className="muted"> ✓ applied</span>
                          ) : (
                            <button type="button" className="add" disabled={pending} onClick={() => fix(f.quote, f.fix!)}>apply fix</button>
                          )}
                        </span>
                      )}
                    </li>
                  ))}
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
