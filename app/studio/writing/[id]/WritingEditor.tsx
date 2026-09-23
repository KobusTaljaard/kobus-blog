'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { useEditorState, type Editor } from '@tiptap/react';
import { block, point, type Doc, type Block } from '@/lib/doc';
import AutoText from '../../_ui/AutoText';
import { SaveStatus, useAutosave } from '../../_ui/useAutosave';
import PrintButton from '../../_ui/PrintButton';
import { pickAndUploadImage } from '../../_ui/images';
import { writeIt } from '../../actions';
import BodyEditor from './BodyEditor';

function Toolbar({ editor, onImage, busy }: { editor: Editor | null; onImage: () => void; busy: boolean }) {
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
      <span className="sep" />
      {btn('Text', s?.p, () => c()?.setParagraph().run(), 'Normal text')}
      {btn('H2', s?.h2, () => c()?.toggleHeading({ level: 2 }).run(), 'Heading')}
      {btn('H3', s?.h3, () => c()?.toggleHeading({ level: 3 }).run(), 'Subheading')}
      {btn('H4', s?.h4, () => c()?.toggleHeading({ level: 4 }).run(), 'Small heading')}
      {btn('“ ”', s?.q, () => c()?.toggleBlockquote().run(), 'Quote')}
      <span className="sep" />
      {btn(busy ? '…' : 'Image', false, onImage, 'Insert an image')}
    </div>
  );
}

function Hints({ b }: { b: Block }) {
  if (!b.text && !b.apps.length) return null;
  return (
    <div className="hints no-print">
      {b.apps.map((a, i) => (
        <span key={i} className="hint-app"><span className="app-tag">Apply</span>{a}</span>
      ))}
    </div>
  );
}

export default function WritingEditor({ id, initial, written }: { id: string; initial: Doc; written: boolean }) {
  const router = useRouter();
  const { doc, update, status, flush } = useAutosave(id, initial);
  const [active, setActive] = useState<Editor | null>(null);
  const [pending, start] = useTransition();
  const [error, setError] = useState('');
  const [imgBusy, setImgBusy] = useState(false);

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
    <BodyEditor key={b.id} value={b.body} placeholder={placeholder} onFocus={setActive} onChange={(html) => update((d) => { set(d).body = html; })} />
  );

  return (
    <div className="sheet writing">
      <div className="sheet-bar sticky no-print">
        <Toolbar editor={active} onImage={addImage} busy={imgBusy} />
        <span className="grow" />
        <SaveStatus status={status} />
        <PrintButton label="Print article" />
        <Link className="quiet-btn" href={`/studio/humanizer/${id}`} onClick={() => flush()}>Humanizer →</Link>
      </div>
      {error && <p className="notice error no-print">{error}</p>}
      {!written && (
        <div className="notice no-print">
          Nothing written yet. Write straight into the page, or
          <button type="button" className="btn" style={{ marginLeft: 12 }} disabled={pending} onClick={write}>
            {pending ? 'Writing it… (a minute or two)' : 'let the AI write it from your outline'}
          </button>
        </div>
      )}

      <AutoText className="w-title" value={doc.title.text} placeholder="Title" onChange={(v) => update((d) => { d.title.text = v; })} />
      <Hints b={{ ...doc.title, text: '' }} />

      <section className="w-section">
        <span className="w-label no-print">Intro{doc.intro.text && <em> — {doc.intro.text}</em>}</span>
        <Hints b={doc.intro} />
        {body(doc.intro, (d) => d.intro, 'Write the intro…')}
      </section>

      {doc.points.map((p, i) => (
        <section key={p.id} className="w-section">
          <AutoText className="w-h2" value={p.text} placeholder={`Point ${i + 1}`} onChange={(v) => update((d) => { d.points[i].text = v; })} />
          <Hints b={p} />
          {body(p, (d) => d.points[i], 'Write this point…')}
          {p.forks.map((f, j) => (
            <div key={f.id} className="w-fork">
              <AutoText className="w-h3" value={f.text} placeholder="Fork (leave empty for no subheading)" onChange={(v) => update((d) => { d.points[i].forks[j].text = v; })} />
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
