'use client';

import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useEditor, EditorContent, useEditorState } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import type { QcResult } from '@/lib/db';
import { savePost, uploadImage, runFinalCheck, approveAndPublish, unpublish, deletePost } from '../../actions';

type P = {
  id: string;
  status: 'draft' | 'published' | 'outline';
  slug: string | null;
  title: string;
  body_html: string;
  excerpt: string;
  tags: string[];
  featured_image_id: string | null;
  outline: string;
  qc: QcResult | null;
  qc_hash: string | null;
  hash: string;
};

const PASS = 85;

/** Shrink photos in the browser before upload so pages stay light. */
async function prepareImage(file: File, maxWidth = 1800) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxWidth / bitmap.width);
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, w, h);
  const blob: Blob = await new Promise((res, rej) =>
    canvas.toBlob((b) => (b ? res(b) : rej(new Error('Could not read image'))), 'image/jpeg', 0.84),
  );
  const fd = new FormData();
  fd.append('file', new File([blob], 'image.jpg', { type: 'image/jpeg' }));
  fd.append('width', String(w));
  fd.append('height', String(h));
  return fd;
}

function pickFile(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/jpeg,image/png,image/webp,image/heic';
    input.onchange = () => resolve(input.files?.[0] || null);
    input.click();
  });
}

export default function EditorStep({ post, source }: { post: P; source: React.ReactNode }) {
  const router = useRouter();
  const [title, setTitle] = useState(post.title);
  const [tags, setTags] = useState(post.tags.join(', '));
  const [excerpt, setExcerpt] = useState(post.excerpt);
  const [featured, setFeatured] = useState<string | null>(post.featured_image_id);
  const [dirty, setDirty] = useState(false);
  const [savedHash, setSavedHash] = useState(post.hash);
  const [savedFeatured, setSavedFeatured] = useState(post.featured_image_id);
  const [qc, setQc] = useState<QcResult | null>(post.qc);
  const [qcHash, setQcHash] = useState<string | null>(post.qc_hash);
  const [busy, setBusy] = useState<'' | 'save' | 'check' | 'publish' | 'image'>('');
  const [error, setError] = useState('');
  const [pending, start] = useTransition();

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2] },
        bulletList: false,
        orderedList: false,
        listItem: false,
        listKeymap: false,
        code: false,
        codeBlock: false,
        strike: false,
        underline: false,
        horizontalRule: false,
        link: false,
      }),
      Image.configure({ inline: false }),
    ],
    content: post.body_html,
    onUpdate: () => setDirty(true),
  });

  const fmt = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      h: e?.isActive('heading', { level: 2 }) ?? false,
      b: e?.isActive('bold') ?? false,
      i: e?.isActive('italic') ?? false,
    }),
  });

  const touch = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setDirty(true);
  };

  const save = useCallback(async () => {
    if (!editor) return false;
    setBusy('save');
    setError('');
    const r = await savePost(post.id, {
      title,
      body_html: editor.getHTML(),
      excerpt,
      tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
      featured_image_id: featured,
    });
    setBusy('');
    if ('error' in r && r.error) {
      setError(r.error);
      return false;
    }
    setDirty(false);
    if (r.hash) setSavedHash(r.hash);
    setSavedFeatured(featured);
    return true;
  }, [editor, excerpt, featured, post.id, tags, title]);

  // Cmd/Ctrl+S saves.
  const saveRef = useRef(save);
  saveRef.current = save;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        saveRef.current();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Warn before leaving with unsaved changes.
  useEffect(() => {
    const onLeave = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault();
    };
    window.addEventListener('beforeunload', onLeave);
    return () => window.removeEventListener('beforeunload', onLeave);
  }, [dirty]);

  async function addImage(kind: 'featured' | 'inline') {
    const file = await pickFile();
    if (!file) return;
    setBusy('image');
    setError('');
    try {
      const r = await uploadImage(await prepareImage(file));
      if ('error' in r && r.error) throw new Error(r.error);
      const src = `/img/${r.id}`;
      if (kind === 'featured') {
        setFeatured(r.id!);
        setDirty(true);
      } else {
        editor?.chain().focus().setImage({ src, alt: '' }).run();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The image could not be added.');
    }
    setBusy('');
  }

  const check = () =>
    start(async () => {
      if (dirty && !(await save())) return;
      setBusy('check');
      setError('');
      const r = await runFinalCheck(post.id);
      setBusy('');
      if ('error' in r && r.error) return setError(r.error);
      if (r.qc) {
        setQc(r.qc);
        setQcHash(r.hash!);
      }
    });

  const publish = () =>
    start(async () => {
      setBusy('publish');
      setError('');
      const r = await approveAndPublish(post.id);
      setBusy('');
      if ('error' in r && r.error) return setError(r.error);
      router.refresh();
    });

  const qcCurrent = !!qc && qcHash === savedHash && !dirty;
  const canPublish = qcCurrent && !!qc?.passed && !!savedFeatured && !dirty;
  const isLive = post.status === 'published';

  return (
    <>
      <p className="section-title" style={{ marginTop: 16 }}>
        {isLive ? 'Published' : 'Draft'}
        {isLive && post.slug && (
          <>
            {' · '}
            <a href={`/writing/${post.slug}`} target="_blank" rel="noreferrer">view</a>
          </>
        )}
      </p>
      {source}

      <div className="feature">
        {featured ? (
          <>
            <img src={`/img/${featured}`} alt="Featured image" />
            <p className="small muted" style={{ margin: '6px 0 0' }}>
              Featured image ·{' '}
              <button className="link-btn" onClick={() => addImage('featured')} disabled={!!busy}>replace</button>
            </p>
          </>
        ) : (
          <button className="link-btn small" onClick={() => addImage('featured')} disabled={!!busy}>
            {busy === 'image' ? 'Adding image…' : 'Add featured image'}
          </button>
        )}
      </div>

      <input
        className="title-input"
        value={title}
        onChange={(e) => touch(setTitle)(e.target.value)}
        placeholder="Title"
        aria-label="Title"
      />

      <div className="toolbar" role="toolbar" aria-label="Formatting">
        <button aria-pressed={fmt?.h} onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()} title="Heading">H</button>
        <button aria-pressed={fmt?.b} onClick={() => editor?.chain().focus().toggleBold().run()} title="Bold (⌘B)"><b>B</b></button>
        <button aria-pressed={fmt?.i} onClick={() => editor?.chain().focus().toggleItalic().run()} title="Italic (⌘I)"><i>I</i></button>
        <button onClick={() => addImage('inline')} disabled={!!busy} title="Insert image">Image</button>
        <span className="spacer" />
        <button onClick={() => save()} disabled={!dirty || !!busy} aria-pressed={false}>
          {busy === 'save' ? 'Saving…' : dirty ? 'Save' : 'Saved'}
        </button>
      </div>

      <div className="editor prose">
        <EditorContent editor={editor} />
      </div>

      <div style={{ display: 'grid', gap: 10, marginTop: 32 }}>
        <label className="small muted" htmlFor="excerpt">Excerpt (shown on the list page)</label>
        <textarea id="excerpt" className="field" rows={2} value={excerpt} onChange={(e) => touch(setExcerpt)(e.target.value)} />
        <label className="small muted" htmlFor="tags">Tags, separated by commas</label>
        <input id="tags" className="field" value={tags} onChange={(e) => touch(setTags)(e.target.value)} />
      </div>

      <section className="qc">
        <p className="section-title" style={{ margin: 0 }}>Final check</p>
        {qc && (
          <>
            <div className="scores">
              <div className={`score ${qc.ai_score >= PASS ? 'pass' : 'fail'}`}>
                <b>{qc.ai_score}</b>
                <span className="small muted">reads as human</span>
              </div>
              <div className={`score ${qc.quality_score >= PASS ? 'pass' : 'fail'}`}>
                <b>{qc.quality_score}</b>
                <span className="small muted">free of errors</span>
              </div>
            </div>
            {!qcCurrent && <p className="notice">The text has changed since this check. Run it again before publishing.</p>}
            <p>{qc.summary}</p>
            {qc.ai_flags.length + qc.error_flags.length > 0 && (
              <ul className="flags">
                {qc.ai_flags.map((f, i) => (
                  <li key={`a${i}`}>
                    <span className="small muted">Sounds machine-made · </span>
                    <q>{f.quote}</q>
                    <br />{f.note}
                    {f.fix && <><br /><span className="muted">Try: {f.fix}</span></>}
                  </li>
                ))}
                {qc.error_flags.map((f, i) => (
                  <li key={`e${i}`}>
                    <span className="small muted">Error · </span>
                    <q>{f.quote}</q>
                    <br />{f.note}
                    {f.fix && <><br /><span className="muted">Fix: {f.fix}</span></>}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
        {!qc && <p className="muted small">Scores the draft for AI-writing tells and for errors. Both must reach {PASS} to publish.</p>}

        <div className="actions">
          <button className="btn ghost" onClick={check} disabled={pending || !!busy || (qcCurrent && !dirty)}>
            {busy === 'check' ? 'Checking… (about a minute)' : dirty ? 'Save and run check' : 'Run final check'}
          </button>
          {!isLive && (
            <button className="btn" onClick={publish} disabled={!canPublish || pending || !!busy}>
              {busy === 'publish' ? 'Publishing…' : 'Approve and publish'}
            </button>
          )}
        </div>
        {!isLive && qcCurrent && qc?.passed && !savedFeatured && (
          <p className="small muted">Add a featured image (and save) to publish.</p>
        )}
        {isLive && <p className="small muted">This post is live. Saved changes appear on the blog straight away.</p>}
      </section>

      {error && <p className="notice error">{error}</p>}

      {post.outline && (
        <details style={{ margin: '24px 0' }}>
          <summary className="small muted" style={{ cursor: 'pointer' }}>Approved outline</summary>
          <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: '0.9rem' }}>{post.outline}</pre>
        </details>
      )}

      <p className="small" style={{ marginTop: 48, display: 'flex', gap: 20 }}>
        {isLive && (
          <button className="link-btn" disabled={pending} onClick={() => start(async () => { await unpublish(post.id); router.refresh(); })}>
            Unpublish
          </button>
        )}
        <button
          className="link-btn danger"
          disabled={pending}
          onClick={() => {
            if (window.confirm(isLive ? 'Delete this post from the blog for good?' : 'Delete this draft?')) start(() => deletePost(post.id));
          }}
        >
          Delete post
        </button>
      </p>
    </>
  );
}
