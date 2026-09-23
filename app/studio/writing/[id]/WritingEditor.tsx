'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';
import { useEditorState, type Editor } from '@tiptap/react';
import { block, compileHtml, point, type Doc, type Block } from '@/lib/doc';
import { norm, openFlags, quoteText, type HumanizerResult, type OpenFlag } from '@/lib/rules';
import AutoText from '../../_ui/AutoText';
import { SaveStatus, useAutosave } from '../../_ui/useAutosave';
import PrintButton from '../../_ui/PrintButton';
import { pickAndUploadImage } from '../../_ui/images';
import { aiFix, aiInstruct, dismissFlag, makePullQuote, setFeatured, writeIt } from '../../actions';
import Instruct from '../../_ui/Instruct';
import BodyEditor from './BodyEditor';
import { pullQuote } from './pullQuote';

function LinkField({ editor, onDone }: { editor: Editor; onDone: () => void }) {
  const [url, setUrl] = useState<string>(editor.getAttributes('link').href || '');
  const apply = () => {
    let href = url.trim();
    const chain = editor.chain().focus().extendMarkRange('link');
    if (!href) {
      chain.unsetLink().run();
      return onDone();
    }
    if (!/^(https?:|mailto:|\/)/i.test(href)) href = href.includes('@') && !href.includes('/') ? `mailto:${href}` : `https://${href}`;
    if (editor.state.selection.empty && !editor.isActive('link')) {
      // Nothing selected: put the address itself in as the link text.
      editor.chain().focus().insertContent({ type: 'text', text: href.replace(/^mailto:/, ''), marks: [{ type: 'link', attrs: { href } }] }).run();
    } else {
      chain.setLink({ href }).run();
    }
    onDone();
  };
  return (
    <span className="link-field">
      <input
        autoFocus
        value={url}
        placeholder="Paste a web address…"
        onChange={(e) => setUrl(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            apply();
          }
          if (e.key === 'Escape') onDone();
        }}
      />
      <button type="button" onClick={apply}>Apply</button>
      {editor.isActive('link') && (
        <button type="button" onClick={() => { editor.chain().focus().extendMarkRange('link').unsetLink().run(); onDone(); }}>Remove</button>
      )}
    </span>
  );
}

function Toolbar({ editor, onImage, busy }: { editor: Editor | null; onImage: () => void; busy: boolean }) {
  const [linking, setLinking] = useState(false);
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      b: !!e?.isActive('bold'),
      i: !!e?.isActive('italic'),
      h2: !!e?.isActive('heading', { level: 2 }),
      h3: !!e?.isActive('heading', { level: 3 }),
      h4: !!e?.isActive('heading', { level: 4 }),
      p: !!e?.isActive('paragraph'),
      q: !!e?.isActive('blockquote'),
      pq: !!e?.isActive('pullQuote'),
      link: !!e?.isActive('link'),
    }),
  });
  const c = () => editor?.chain().focus();
  const btn = (label: React.ReactNode, on: boolean | undefined, run: () => void, title: string) => (
    <button type="button" aria-pressed={!!on} title={title} disabled={!editor} onMouseDown={(e) => e.preventDefault()} onClick={run}>
      {label}
    </button>
  );
  return (
    <div className="fmt" role="toolbar" aria-label="Formatting">
      {btn(<b>B</b>, s?.b, () => c()?.toggleBold().run(), 'Bold (⌘B)')}
      {btn(<i>I</i>, s?.i, () => c()?.toggleItalic().run(), 'Italic (⌘I)')}
      {btn('Link', s?.link, () => setLinking((v) => !v), 'Link the selected words to a web address')}
      <span className="sep" />
      {btn('Text', s?.p, () => c()?.setParagraph().run(), 'Normal text')}
      {btn('H2', s?.h2, () => c()?.toggleHeading({ level: 2 }).run(), 'Heading')}
      {btn('H3', s?.h3, () => c()?.toggleHeading({ level: 3 }).run(), 'Subheading')}
      {btn('H4', s?.h4, () => c()?.toggleHeading({ level: 4 }).run(), 'Small heading')}
      {btn('“ ”', s?.q, () => c()?.toggleBlockquote().run(), 'Quote (someone else’s words)')}
      {btn('Pull quote', s?.pq, () => editor && pullQuote(editor), 'Select words to lift them out as a stand-out pull quote, or click in a paragraph to turn it into one')}
      <span className="sep" />
      {btn(busy ? '…' : 'Image', false, onImage, 'Insert an image in the text')}
      {linking && editor && <LinkField editor={editor} onDone={() => setLinking(false)} />}
    </div>
  );
}

function Featured({ id, initial }: { id: string; initial: string | null }) {
  const [img, setImg] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const pick = async () => {
    setBusy(true);
    setErr('');
    try {
      const got = await pickAndUploadImage();
      if (got) {
        setImg(got);
        await setFeatured(id, got);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'The image could not be added.');
    }
    setBusy(false);
  };
  return (
    <div className="w-featured no-print">
      {img ? (
        <>
          <img src={`/img/${img}`} alt="Featured image" />
          <span className="w-featured-actions">
            <span className="app-tag">Featured image</span>
            <button type="button" className="add" disabled={busy} onClick={pick}>{busy ? 'uploading…' : 'replace'}</button>
            <button type="button" className="add danger" disabled={busy} onClick={async () => { setImg(null); await setFeatured(id, null); }}>remove</button>
          </span>
        </>
      ) : (
        <button type="button" className="feature-drop" disabled={busy} onClick={pick}>
          {busy ? 'Uploading…' : '+ Featured image'}
          <span className="small muted">The picture at the top of the post and on shared links. Needed to publish.</span>
        </button>
      )}
      {err && <p className="notice error">{err}</p>}
    </div>
  );
}

function Hints({ b }: { b: Block }) {
  const cue = b.cue && b.cue.trim() !== b.text.trim() ? b.cue : '';
  if (!cue && !b.apps.length) return null;
  return (
    <div className="hints no-print">
      {cue && <span className="hint-cue"><span className="app-tag">Outline</span>{cue}</span>}
      {b.apps.map((a, i) => (
        <span key={i} className="hint-app"><span className="app-tag">Apply</span>{a}</span>
      ))}
    </div>
  );
}

function Notes({
  flags,
  busy,
  pending,
  onFix,
  onLeave,
  onClose,
  onInstruct,
  onQuote,
}: {
  flags: OpenFlag[];
  busy: string;
  pending: boolean;
  onFix: (f: OpenFlag[], tag: string) => void;
  onLeave: (f: OpenFlag) => void;
  onClose: () => void;
  onInstruct: (text: string, f: OpenFlag | undefined, tag: string) => Promise<boolean>;
  onQuote: (f: OpenFlag) => void;
}) {
  const [asking, setAsking] = useState<string | null>(null);
  const show = (f: OpenFlag) => {
    const el =
      document.querySelector(`[data-flag="${CSS.escape(f.key)}"]`) ||
      Array.from(document.querySelectorAll<HTMLTextAreaElement>('textarea.flag-field')).find((t) => norm(t.value).includes(norm(quoteText(f.quote))));
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.add('flash');
    setTimeout(() => el.classList.remove('flash'), 1600);
  };
  return (
    <aside className="w-notes no-print" aria-label="Humanizer notes">
      <div className="w-notes-head">
        <b>Humanizer notes</b>
        <button type="button" className="add" onClick={onClose} aria-label="Close">close</button>
      </div>
      <div className="instruct-wrap">
        <span className="o-label">Tell the AI what to change</span>
        <Instruct compact busy={busy === 'instruct'} disabled={pending} onSend={(t) => onInstruct(t, undefined, 'instruct')} />
      </div>
      {flags.length === 0 ? (
        <p className="small muted">Nothing open. Run the Humanizer again when you&apos;re happy.</p>
      ) : (
        <>
          <p className="small muted">Underlined in the text. Click a note to jump to it. Fix it yourself, or let the AI.</p>
          <button type="button" className="btn small-btn" disabled={pending} onClick={() => onFix(flags, 'all')}>
            {busy === 'all' ? 'Fixing…' : `AI fix everything (${flags.length})`}
          </button>
          <ul>
            {flags.map((f) => (
              <li key={f.key}>
                <span className="note-check">{f.check}</span>
                <button type="button" className="note-quote" onClick={() => show(f)}>“{quoteText(f.quote)}”</button>
                <span className="small">{f.issue}</span>
                {f.fix && <span className="small muted"><em>Suggestion:</em> {f.fix}</span>}
                <span className="flag-actions">
                  <button type="button" className="add strong" disabled={pending} onClick={() => onFix([f], f.key)}>
                    {busy === f.key ? 'fixing…' : 'let AI fix this'}
                  </button>
                  <button type="button" className="add" disabled={pending} onClick={() => setAsking(asking === f.key ? null : f.key)}>tell AI how</button>
                  <button type="button" className="add" disabled={pending} onClick={() => onQuote(f)}>
                    {busy === `pq-${f.key}` ? 'moving…' : 'make it a pull quote'}
                  </button>
                  <button type="button" className="add" disabled={pending} onClick={() => onLeave(f)}>leave it</button>
                </span>
                {asking === f.key && (
                  <Instruct
                    compact
                    busy={busy === `ask-${f.key}`}
                    disabled={pending}
                    placeholder="What should the AI do with this passage?"
                    onSend={async (t) => {
                      const ok = await onInstruct(t, f, `ask-${f.key}`);
                      if (ok) setAsking(null);
                      return ok;
                    }}
                  />
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </aside>
  );
}

export default function WritingEditor({
  id,
  initial,
  written,
  qc,
  dismissed: initialDismissed,
  featured,
}: {
  id: string;
  initial: Doc;
  written: boolean;
  qc: HumanizerResult | null;
  dismissed: string[];
  featured: string | null;
}) {
  const router = useRouter();
  const { doc, update, status, flush } = useAutosave(id, initial);
  const [active, setActive] = useState<Editor | null>(null);
  const [pending, start] = useTransition();
  const [error, setError] = useState('');
  const [imgBusy, setImgBusy] = useState(false);
  const [dismissed, setDismissed] = useState(initialDismissed);
  const [busy, setBusy] = useState('');
  const [note, setNote] = useState('');

  // The Humanizer's flags that still apply, recomputed as you type: fix a passage and its note goes.
  const html = useMemo(() => compileHtml(doc), [doc]);
  const flags = useMemo(() => openFlags(qc, doc.title.text, html, dismissed), [qc, doc.title.text, html, dismissed]);
  const [showNotes, setShowNotes] = useState(flags.length > 0);
  const marks = useMemo(() => flags.map((f) => ({ key: f.key, quote: f.quote, label: `${f.check}: ${f.issue}` })), [flags]);
  const flaggedField = (t: string) => flags.some((f) => norm(t).includes(norm(quoteText(f.quote))));
  const fieldClass = (base: string, t: string) => (flaggedField(t) ? `${base} flag-field flagged-field` : `${base} flag-field`);

  const fixWithAi = (list: OpenFlag[], tag: string) =>
    start(async () => {
      setBusy(tag);
      setError('');
      setNote('');
      await flush();
      const r = await aiFix(id, list.map(({ check, quote, issue, fix }) => ({ check, quote, issue, fix })));
      setBusy('');
      if ('error' in r && r.error) return setError(r.error);
      setNote(r.note || 'Fixed.');
      router.refresh();
    });

  const instruct = (text: string, f: OpenFlag | undefined, tag: string) =>
    new Promise<boolean>((resolve) =>
      start(async () => {
        setBusy(tag);
        setError('');
        setNote('');
        await flush();
        const r = await aiInstruct(id, text, f && { check: f.check, quote: f.quote, issue: f.issue, fix: f.fix });
        setBusy('');
        if ('error' in r && r.error) {
          setError(r.error);
          return resolve(false);
        }
        setNote(('note' in r && r.note) || 'Done.');
        router.refresh();
        resolve(true);
      }),
    );

  const toQuote = (f: OpenFlag) =>
    start(async () => {
      setBusy(`pq-${f.key}`);
      setError('');
      await flush();
      const r = await makePullQuote(id, { check: f.check, quote: f.quote, issue: f.issue });
      setBusy('');
      if ('error' in r && r.error) return setError(r.error);
      router.refresh();
    });

  const leave = (f: OpenFlag) => {
    setDismissed((d) => [...d, f.quote]);
    dismissFlag(id, { check: f.check, quote: f.quote, issue: f.issue });
  };

  const rewrite = () => {
    if (!window.confirm('Let the AI write the whole piece again from your outline and source? This replaces the current text (your version is kept for the AI to learn from).')) return;
    write();
  };

  const addImage = async () => {
    if (!active) return setError('Click into the text where the image should go first.');
    setImgBusy(true);
    try {
      const imgId = await pickAndUploadImage();
      if (imgId) active.chain().focus().setImage({ src: `/img/${imgId}`, alt: '' }).run();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The image could not be added.');
    }
    setImgBusy(false);
  };

  const write = () =>
    start(async () => {
      setError('');
      await flush();
      const r = await writeIt(id);
      if (r?.error) setError(r.error);
      else router.refresh();
    });

  const body = (b: Block, set: (d: Doc) => Block, placeholder: string) => (
    <BodyEditor key={b.id} value={b.body} flags={marks} placeholder={placeholder} onFocus={setActive} onChange={(html) => update((d) => { set(d).body = html; })} />
  );

  return (
    <div className={`sheet writing${showNotes && qc ? ' with-notes' : ''}`}>
      <div className="sheet-bar sticky no-print">
        <Toolbar editor={active} onImage={addImage} busy={imgBusy} />
        <span className="grow" />
        <SaveStatus status={status} />
        {qc && (
          <button type="button" className={`quiet-btn${flags.length ? ' has-notes' : ''}`} onClick={() => setShowNotes((v) => !v)}>
            Humanizer notes{flags.length ? ` (${flags.length})` : ''}
          </button>
        )}
        {written && (
          <button type="button" className="quiet-btn" disabled={pending} onClick={rewrite}>
            {pending && busy === '' ? 'Writing…' : 'AI rewrite'}
          </button>
        )}
        <PrintButton label="Print article" />
        <Link className="quiet-btn" href={`/studio/humanizer/${id}`} onClick={() => flush()}>Humanizer →</Link>
      </div>
      {error && <p className="notice error no-print">{error}</p>}
      {note && <p className="notice no-print">{note}</p>}
      {showNotes && qc && (
        <Notes flags={flags} busy={busy} pending={pending} onFix={fixWithAi} onLeave={leave} onClose={() => setShowNotes(false)} onInstruct={instruct} onQuote={toQuote} />
      )}
      {!written && (
        <div className="notice no-print">
          Nothing written yet. Write straight into the page, or
          <button type="button" className="btn" style={{ marginLeft: 12 }} disabled={pending} onClick={write}>
            {pending ? 'Writing it… (a minute or two)' : 'let the AI write it from your outline'}
          </button>
        </div>
      )}

      <Featured id={id} initial={featured} />
      <AutoText className={fieldClass('w-title', doc.title.text)} value={doc.title.text} placeholder="Title" onChange={(v) => update((d) => { d.title.text = v; })} />
      <Hints b={{ ...doc.title, text: '' }} />

      <section className="w-section">
        <span className="w-label no-print">Intro{doc.intro.text && <em> — {doc.intro.text}</em>}</span>
        <Hints b={doc.intro} />
        {body(doc.intro, (d) => d.intro, 'Write the intro…')}
      </section>

      {doc.points.map((p, i) => (
        <section key={p.id} className="w-section">
          <AutoText className={fieldClass('w-h2', p.text)} value={p.text} placeholder={`Point ${i + 1}`} onChange={(v) => update((d) => { d.points[i].text = v; })} />
          <Hints b={p} />
          {body(p, (d) => d.points[i], 'Write this point…')}
          {p.forks.map((f, j) => (
            <div key={f.id} className="w-fork">
              <AutoText className={fieldClass('w-h3', f.text)} value={f.text} placeholder="Fork (leave empty for no subheading)" onChange={(v) => update((d) => { d.points[i].forks[j].text = v; })} />
              <Hints b={f} />
              {body(f, (d) => d.points[i].forks[j], 'Write this fork…')}
            </div>
          ))}
          <button type="button" className="add no-print" onClick={() => update((d) => { d.points[i].forks.push(block()); })}>+ fork</button>
        </section>
      ))}
      <button type="button" className="add no-print" onClick={() => update((d) => { d.points.push(point()); })}>+ point</button>

      <section className="w-section">
        <span className="w-label no-print">Outro{doc.outro.text && <em> — {doc.outro.text}</em>}</span>
        <Hints b={doc.outro} />
        {body(doc.outro, (d) => d.outro, 'The turn toward the landing…')}
      </section>

      <section className="w-section">
        <span className="w-label no-print">Conclusion{doc.conclusion.text && <em> — {doc.conclusion.text}</em>}</span>
        <Hints b={doc.conclusion} />
        {body(doc.conclusion, (d) => d.conclusion, 'Land the plane…')}
      </section>
    </div>
  );
}
