import type { ReactNode } from 'react';

export const selectClass =
  'h-9 w-full rounded-md border border-input bg-transparent px-2.5 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30 dark:[&>option]:bg-popover';

export const textareaClass =
  'min-h-20 w-full resize-y rounded-md border border-input bg-transparent px-2.5 py-2 text-sm leading-6 shadow-xs outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30';

/** A labelled settings row: label on the left, control and hint on the right. */
export function Field({ label, htmlFor, hint, children }: { label: string; htmlFor?: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="grid gap-1.5 sm:grid-cols-[96px_1fr] sm:items-start sm:gap-4">
      <label htmlFor={htmlFor} className="pt-2 text-sm font-medium">
        {label}
      </label>
      <div className="flex min-w-0 flex-col gap-1.5">
        {children}
        {hint && <div className="text-xs leading-5 text-muted-foreground">{hint}</div>}
      </div>
    </div>
  );
}
