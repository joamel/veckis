import { useAuth } from '@clerk/clerk-expo';

const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';

export function useApiClient() {
  const { getToken } = useAuth();

  async function request<T>(
    path: string,
    options: RequestInit = {},
  ): Promise<T> {
    const token = await getToken();
    const res = await fetch(`${BASE_URL}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        ...options.headers,
      },
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error ?? `HTTP ${res.status}`);
    }

    return res.json() as Promise<T>;
  }

  return { request };
}
