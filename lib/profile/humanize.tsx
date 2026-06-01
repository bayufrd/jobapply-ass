import React from "react";

/**
 * Humanize a camelCase or snake_case key into a readable label.
 */
export function humanizeKey(key: string): string {
  return key
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .replace(/\b([a-z])/g, (m) => m.toUpperCase())
    .trim();
}

/**
 * Renders a flexible object as a description list.
 */
export function renderFlexibleObject(obj: unknown): React.ReactElement {
  if (typeof obj !== 'object' || obj === null) return <></>;
  
  return (
    <dl className="grid grid-cols-1 gap-1 text-xs">
      {Object.entries(obj as Record<string, unknown>).map(([k, v]) => (
        <div key={k} className="flex gap-2">
          <dt className="min-w-[100px] font-medium text-slate-400">{humanizeKey(k)}</dt>
          <dd className="text-slate-200">
            {typeof v === 'string' || typeof v === 'number'
              ? String(v)
              : Array.isArray(v)
                ? v.join(', ')
                : typeof v === 'object' && v !== null
                  ? JSON.stringify(v)
                  : String(v)}
          </dd>
        </div>
      ))}
    </dl>
  );
}
