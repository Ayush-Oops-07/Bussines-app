import { useAuthStore } from "../store/auth-store";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "/api/backend";

interface RequestOptions extends RequestInit {
  params?: Record<string, string | number | undefined>;
}

export async function apiClient<T>(
  endpoint: string,
  options: RequestOptions = {}
): Promise<T> {
  const { params, headers, ...restOptions } = options;

  // Build URL with query params
  let url = `${API_BASE_URL}${endpoint}`;
  if (params) {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, val]) => {
      if (val !== undefined && val !== null) {
        searchParams.append(key, String(val));
      }
    });
    const qs = searchParams.toString();
    if (qs) {
      url += `?${qs}`;
    }
  }

  // Build headers
  const finalHeaders = new Headers(headers);
  if (!finalHeaders.has("Content-Type") && !(restOptions.body instanceof FormData)) {
    finalHeaders.set("Content-Type", "application/json");
  }

  // Get token from store
  const token = useAuthStore.getState().token;
  if (token) {
    finalHeaders.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(url, {
    ...restOptions,
    headers: finalHeaders,
  });

  if (!response.ok) {
    let errorDetail = "An error occurred";
    try {
      const errorJson = await response.json();
      errorDetail = errorJson.message || errorJson.detail || errorJson.error || response.statusText;
    } catch {
      errorDetail = response.statusText;
    }

    // Auto-logout on 401 Unauthorized
    if (response.status === 401) {
      useAuthStore.getState().logout();
    }

    throw new Error(errorDetail);
  }

  // Return empty object for empty responses
  if (response.status === 204) {
    return {} as T;
  }

  const data = await response.json();
  if (data && typeof data === "object" && "success" in data && "data" in data) {
    return data.data as T;
  }
  return data as T;
}
