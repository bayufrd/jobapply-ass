// Helper to safely parse JSON for profile fields
export function parseProfileJson(value?: string | null): unknown[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed;
    if (typeof parsed === 'object' && parsed !== null) return [parsed];
    if (typeof parsed === 'string') return [parsed];
    return [];
  } catch {
    return [];
  }
}
