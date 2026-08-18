/** Typed fetch helper — avoids HTML login redirects breaking JSON.parse. */
export async function apiFetch<T = unknown>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init);
  const contentType = response.headers.get("content-type") ?? "";

  if (!contentType.includes("application/json")) {
    if (response.status === 401) {
      throw new Error("Session expired. Please sign in again.");
    }
    throw new Error(`Unexpected response (${response.status}). Restart the dev server and try again.`);
  }

  const data = (await response.json()) as T & { error?: string };
  if (!response.ok) {
    throw new Error(data.error || `Request failed (${response.status}).`);
  }
  return data;
}
