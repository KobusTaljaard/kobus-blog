import { Extension } from '@tiptap/react';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import type { Node as PMNode } from '@tiptap/pm/model';
import { norm, quoteText } from '@/lib/rules';

export type FlagMark = { key: string; quote: string; label: string };

export const flagKey = new PluginKey<DecorationSet>('humanizer-flags');

/** Underlines each flagged passage without touching the text, so you can fix it by hand. */
function build(doc: PMNode, flags: FlagMark[]): DecorationSet {
  if (!flags.length) return DecorationSet.empty;
  const decos: Decoration[] = [];
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true;
    let text = '';
    const at: number[] = [];
    node.forEach((child, offset) => {
      if (child.isText && child.text) {
        for (let i = 0; i < child.text.length; i++) at.push(pos + 1 + offset + i);
        text += child.text;
      }
    });
    const hay = norm(text);
    for (const f of flags) {
      const q = norm(quoteText(f.quote));
      if (!q) continue;
      const i = hay.indexOf(q);
      if (i < 0) continue;
      decos.push(
        Decoration.inline(at[i], at[i + q.length - 1] + 1, {
          class: 'flagged',
          title: f.label,
          'data-flag': f.key,
        }),
      );
    }
    return false;
  });
  return DecorationSet.create(doc, decos);
}

export const FlagHighlight = Extension.create<{ get: () => FlagMark[] }>({
  name: 'flagHighlight',
  addOptions() {
    return { get: () => [] };
  },
  addProseMirrorPlugins() {
    const get = this.options.get;
    return [
      new Plugin({
        key: flagKey,
        state: {
          init: (_, state) => build(state.doc, get()),
          apply: (tr, old, _o, state) => (tr.docChanged || tr.getMeta(flagKey) ? build(state.doc, get()) : old),
        },
        props: {
          decorations(state) {
            return flagKey.getState(state);
          },
        },
      }),
    ];
  },
});
