const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  process.env.API_BASE_URL ||
  'http://localhost:4000';

export type Platform = 'youtube' | 'tiktok';

function withBaseHeaders(init?: RequestInit): RequestInit {
  return {
    ...init,
    headers: {
      'content-type': 'application/json',
      'x-terms-accepted': 'true',
      ...(init?.headers || {})
    },
    cache: 'no-store'
  };
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, withBaseHeaders(init));

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || `Request failed (${response.status})`);
  }

  if (response.status === 204) {
    return {} as T;
  }

  return response.json() as Promise<T>;
}

export async function apiBlob(path: string, init?: RequestInit): Promise<Blob> {
  const response = await fetch(`${API_BASE}${path}`, withBaseHeaders(init));
  if (!response.ok) {
    const payload = await response.json().catch(async () => ({ error: await response.text() }));
    throw new Error(payload.error || `Request failed (${response.status})`);
  }

  return response.blob();
}
