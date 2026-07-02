const API_BASE = "http://localhost:4000";

type ApiOptions = {
    method?: string;
    body?: unknown;
};

export async function api<T>(path: string, options: ApiOptions = {}): Promise<T> {
    const res = await fetch(`${API_BASE}${path}`, {
        method: options.method ?? "GET",
        headers: { "Content-Type": "application/json" },
        credentials: "include", // send and receive session cookie
        body: options.body ? JSON.stringify(options.body) : undefined,
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
        // Error message for incorrect request
        throw new Error(data.error ?? "Request failed");
    }

    return data as T;
}
