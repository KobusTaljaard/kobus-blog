'use client';

import AutoText from './AutoText';

/** Applications can sit on any block: title, intro, point, fork, outro or conclusion. */
export function Apps({ apps, onChange }: { apps: string[]; onChange: (apps: string[]) => void }) {
  if (!apps.length) return null;
  return (
    <div className="apps">
      {apps.map((a, i) => (
        <div key={i} className="app-line">
          <span className="app-tag">Apply</span>
          <AutoText
            value={a}
            placeholder="Application"
            autoFocus={!a}
            onChange={(v) => onChange(apps.map((x, j) => (j === i ? v : x)))}
            onBackspaceEmpty={() => onChange(apps.filter((_, j) => j !== i))}
          />
          <button type="button" className="x no-print" aria-label="Remove application" onClick={() => onChange(apps.filter((_, j) => j !== i))}>×</button>
        </div>
      ))}
    </div>
  );
}

export function AddApp({ onAdd }: { onAdd: () => void }) {
  return (
    <button type="button" className="add no-print" onClick={onAdd}>+ apply</button>
  );
}
