export function safeJsonParse<T>(
  value: unknown,
  fallback: T,
  context?: string,
): T {
  if (typeof value !== "string") return fallback;

  const trimmed = value.trim();
  if (!trimmed) return fallback;

  try {
    return JSON.parse(trimmed) as T;
  } catch {
    void context;
    return fallback;
  }
}
