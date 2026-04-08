export async function apiPost(path: string, body: unknown): Promise<{ ok: boolean; status: number; text: string }> {
  const r = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await r.text();
  return { ok: r.ok, status: r.status, text };
}
