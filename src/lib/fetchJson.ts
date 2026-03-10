export async function fetchJson<T = unknown>(res: Response): Promise<T> {
  const text = await res.text();
  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    if (text.trimStart().startsWith("<!")) {
      throw new Error(
        `Server returned HTML instead of JSON (${res.status}). Check the API route/server logs.`
      );
    }
    throw new Error(`Unexpected response (${res.status}): ${text.slice(0, 120)}`);
  }
  return JSON.parse(text) as T;
}

