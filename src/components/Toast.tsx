import { useEffect, useState } from 'react';

/** Brief, non-blocking confirmation. Announced politely to screen readers. */
export default function Toast({ toast }: { toast: { id: number; text: string } | null }) {
  const [dismissedId, setDismissedId] = useState<number | null>(null);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setDismissedId(toast.id), 2800);
    return () => clearTimeout(t);
  }, [toast]);

  const visible = toast && toast.id !== dismissedId ? toast : null;
  return (
    <div className="toast-region" role="status" aria-live="polite">
      {visible && (
        <div key={visible.id} className="toast">
          {visible.text}
        </div>
      )}
    </div>
  );
}
