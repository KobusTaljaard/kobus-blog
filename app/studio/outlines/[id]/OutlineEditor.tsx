'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { block, point, type Doc } from '@/lib/doc';
import AutoText from '../../_ui/AutoText';
import { Apps, AddApp } from '../../_ui/Apps';
import { SaveStatus, useAutosave } from '../../_ui/useAutosave';
import PrintButton from '../../_ui/PrintButton';
import { writeIt, deletePost } from '../../actions';

export default function OutlineEditor({ id, initial, source, written }: { id: string; initial: Doc; source: string | null; written: boolean }) {
  const router = useRouter();
  const { doc, update, status, flush } = useAutosave(id, initial);
  const [pending, start] = useTransition();
  const [error, setError] = useState('');
  const [focusFork, setFocusFork] = useState<string | null>(null);

  const write = () =>
    start(async () => {
      setError('');
      await flush();
      const r = await writeIt(id);
      if (r?.error) setError(r.error);
      else router.push(`/studio/writing/${id}`);
    });

  return (
    <div className="sheet outline">
      <div className="sheet-bar no-print">
        {source && <span className="muted">Source: {source}</span>}
        <span className="grow" />
        <SaveStatus status={status} />
        <PrintButton label="Print outline" />
        {written ? (
          <Link className="quiet-btn" href={`/studio/writing/${id}`}>Open in Writing →</Link>
        ) : (
          <button type="button" className="btn" disabled={pending} onClick={write}>
            {pending ? 'Writing it… (a minute or two)' : 'Write it →'}
          </button>
        )}
      </div>
      {error && <p className="notice error no-print">{error}</p>}

      <section className="o-block">
        <span className="o-label">Working title</span>
        <AutoText className="o-title" value={doc.title.text} placeholder="Working title" onChange={(v) => update((d) => { d.title.text = v; })} />
        <Apps apps={doc.title.apps} onChange={(a) => update((d) => { d.title.apps = a; })} />
        <AddApp onAdd={() => update((d) => { d.title.apps.push(''); })} />
      </section>

      <section className="o-block">
        <span className="o-label">Intro</span>
        <AutoText className="o-intro" value={doc.intro.text} placeholder="The idea you open with" onChange={(v) => update((d) => { d.intro.text = v; })} />
        <Apps apps={doc.intro.apps} onChange={(a) => update((d) => { d.intro.apps = a; })} />
        <AddApp onAdd={() => update((d) => { d.intro.apps.push(''); })} />
      </section>

      <section className="o-points">
        <span className="o-label">Points</span>
        {doc.points.map((p, i) => (
          <div key={p.id} className="o-point">
            <div className="o-point-name">
              <span className="o-num">{i + 1}</span>
              <div className="grow">
                <AutoText className="o-point-text" value={p.text} placeholder="Point" onChange={(v) => update((d) => { d.points[i].text = v; })} />
                <Apps apps={p.apps} onChange={(a) => update((d) => { d.points[i].apps = a; })} />
                <div className="row-tools no-print">
                  <AddApp onAdd={() => update((d) => { d.points[i].apps.push(''); })} />
                  {i > 0 && <button type="button" className="add" onClick={() => update((d) => { const [x] = d.points.splice(i, 1); d.points.splice(i - 1, 0, x); })}>↑ move up</button>}
                  {i < doc.points.length - 1 && <button type="button" className="add" onClick={() => update((d) => { const [x] = d.points.splice(i, 1); d.points.splice(i + 1, 0, x); })}>↓ move down</button>}
                  <button type="button" className="add danger" onClick={() => { if (!p.text && !p.forks.length && !p.body) update((d) => { d.points.splice(i, 1); }); else if (window.confirm('Remove this point, its forks and any writing under it?')) update((d) => { d.points.splice(i, 1); }); }}>remove</button>
                </div>
              </div>
            </div>
            <div className="o-forks">
              {p.forks.map((f, j) => (
                <div key={f.id} className="o-fork">
                  <span className="dash">–</span>
                  <div className="grow">
                    <AutoText
                      value={f.text}
                      placeholder="Fork idea"
                      autoFocus={focusFork === f.id}
                      onChange={(v) => update((d) => { d.points[i].forks[j].text = v; })}
                      onEnter={() => { const nb = block(); setFocusFork(nb.id); update((d) => { d.points[i].forks.splice(j + 1, 0, nb); }); }}
                      onBackspaceEmpty={() => { if (!f.body) update((d) => { d.points[i].forks.splice(j, 1); }); }}
                    />
                    <Apps apps={f.apps} onChange={(a) => update((d) => { d.points[i].forks[j].apps = a; })} />
                  </div>
                  <span className="fork-tools no-print">
                    <AddApp onAdd={() => update((d) => { d.points[i].forks[j].apps.push(''); })} />
                    <button type="button" className="x" aria-label="Remove fork" onClick={() => { if (!f.body || window.confirm('Remove this fork and its writing?')) update((d) => { d.points[i].forks.splice(j, 1); }); }}>×</button>
                  </span>
                </div>
              ))}
              <button type="button" className="add no-print" onClick={() => { const nb = block(); setFocusFork(nb.id); update((d) => { d.points[i].forks.push(nb); }); }}>+ fork</button>
            </div>
          </div>
        ))}
        <button type="button" className="add no-print" onClick={() => update((d) => { d.points.push(point()); })}>+ point</button>
      </section>

      <section className="o-inline">
        <span className="o-label">Outro</span>
        <div className="grow">
          <AutoText value={doc.outro.text} placeholder="The turn toward the landing" onChange={(v) => update((d) => { d.outro.text = v; })} />
          <Apps apps={doc.outro.apps} onChange={(a) => update((d) => { d.outro.apps = a; })} />
          <AddApp onAdd={() => update((d) => { d.outro.apps.push(''); })} />
        </div>
      </section>

      <section className="o-block">
        <span className="o-label">Conclusion: land the plane</span>
        <AutoText className="o-conclusion" value={doc.conclusion.text} placeholder="Often empty for now. Two or three lines if you already see the landing." onChange={(v) => update((d) => { d.conclusion.text = v; })} />
        <Apps apps={doc.conclusion.apps} onChange={(a) => update((d) => { d.conclusion.apps = a; })} />
        <AddApp onAdd={() => update((d) => { d.conclusion.apps.push(''); })} />
      </section>

      <p className="sheet-foot no-print">
        <button type="button" className="add danger" disabled={pending} onClick={() => { if (window.confirm('Delete this piece? The original source stays.')) start(() => deletePost(id)); }}>
          Delete this piece
        </button>
      </p>
    </div>
  );
}
