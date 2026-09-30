const PARK_MS = 10 * 60 * 1000;
const parkedUntil = new Map<string, number>();

export function isProviderOpen(id: string) {
  return Date.now() >= (parkedUntil.get(id) ?? 0);
}

export function parkProvider(id: string, ms = PARK_MS) {
  parkedUntil.set(id, Date.now() + ms);
}

export function shouldParkProvider(status?: number | null, body?: string | null) {
  if (status === 401 || status === 402 || status === 403 || status === 410) return true;
  if (status === 429 && /quota|limit: 0|billing|rate-limits/i.test(body ?? "")) return true;
  if (!body) return false;
  return /insufficient credit|deprecated|no longer supported|payment required|forbidden|not supported by provider|non-serverless|third-party data sharing|user is locked/i.test(
    body
  );
}
