'use client';

import { useTransition } from 'react';
import { deleteMessage } from '../actions';

export default function DeleteMessage({ id }: { id: string }) {
  const [pending, start] = useTransition();
  return (
    <button className="link-btn danger" disabled={pending} onClick={() => start(() => deleteMessage(id))}>
      {pending ? 'deleting…' : 'delete'}
    </button>
  );
}
