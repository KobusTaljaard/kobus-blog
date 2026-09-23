'use client';

export default function PrintButton({ label = 'Print' }: { label?: string }) {
  return (
    <button type="button" className="quiet-btn no-print" onClick={() => window.print()}>
      {label}
    </button>
  );
}
