'use client';

import { useEffect } from 'react';
import { useEditor, EditorContent, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';

/** The prose under one heading. Reports itself when focused so the one formatting bar can act on it. */
export default function BodyEditor({
  value,
  onChange,
  onFocus,
  placeholder,
}: {
  value: string;
  onChange: (html: string) => void;
  onFocus: (e: Editor) => void;
  placeholder: string;
}) {
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3, 4] },
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
      Placeholder.configure({ placeholder }),
    ],
    content: value,
    onUpdate: ({ editor }) => onChange(editor.isEmpty ? '' : editor.getHTML()),
    onFocus: ({ editor }) => onFocus(editor),
  });

  // Take in changes made elsewhere (a Humanizer fix), unless you're typing here.
  useEffect(() => {
    if (!editor || editor.isFocused) return;
    const now = editor.isEmpty ? '' : editor.getHTML();
    if (now !== value) editor.commands.setContent(value || '', { emitUpdate: false });
  }, [editor, value]);

  return <EditorContent editor={editor} className="body-editor prose" />;
}
