import { Node, mergeAttributes, type Editor } from '@tiptap/react';

/** A stand-out line set apart from the text (and kept for social posts). Stored as <aside class="pull-quote">. */
export const PullQuote = Node.create({
  name: 'pullQuote',
  group: 'block',
  content: 'inline*',
  defining: true,
  parseHTML() {
    return [{ tag: 'aside.pull-quote' }, { tag: 'aside' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['aside', mergeAttributes(HTMLAttributes, { class: 'pull-quote' }), 0];
  },
});

/**
 * With words selected: lifts them out of the sentence into a pull quote placed right after the paragraph.
 * With nothing selected: turns the current paragraph into a pull quote, or back again.
 */
export function pullQuote(editor: Editor) {
  const { state } = editor;
  const { from, to, $from, $to, empty } = state.selection;
  if (empty || !$from.sameParent($to) || !$from.parent.isTextblock) {
    editor.chain().focus().toggleNode('pullQuote', 'paragraph').run();
    return;
  }
  const node = state.schema.nodes.pullQuote.create(null, state.doc.slice(from, to).content);
  // Insert after the paragraph first (positions before it are unchanged), then remove the words from the sentence.
  const tr = state.tr.insert($to.after(), node).delete(from, to);
  // Tidy the sentence the words left: no double space, no space before punctuation.
  if (from > $from.start()) {
    const around = tr.doc.textBetween(from - 1, Math.min(from + 1, $from.start() + $from.parent.content.size - (to - from)));
    if (around === '  ') tr.delete(from, from + 1);
    else if (around[0] === ' ' && /[,.;:!?]/.test(around[1] || '')) {
      // "near, always here." → "near." rather than "near,."
      const before = from >= $from.start() + 2 ? tr.doc.textBetween(from - 2, from - 1) : '';
      tr.delete(/[,;:]/.test(before) ? from - 2 : from - 1, from);
    }
  }
  // The whole paragraph became the pull quote: drop the empty line it left.
  if (tr.doc.resolve(tr.mapping.map($from.before()) + 1).parent.content.size === 0) {
    const at = tr.mapping.map($from.before());
    tr.delete(at, at + 2);
  }
  editor.view.dispatch(tr);
  editor.commands.focus();
}
