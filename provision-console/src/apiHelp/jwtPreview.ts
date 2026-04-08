/** Best-effort JWT payload decode in the browser (same shape as provision API). */
export function decodeJwtPayload(jwt: string): Record<string, unknown> | null {
  const t = jwt.trim();
  if (!t) return null;
  const parts = t.split(".");
  if (parts.length !== 3) return null;
  try {
    const payload = parts[1];
    const pad = 4 - (payload.length % 4);
    const b64 = payload + (pad < 4 ? "=".repeat(pad) : "");
    const json = atob(b64.replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function jwtRealmFromIss(jwt: string): string {
  const p = decodeJwtPayload(jwt);
  const iss = p?.iss;
  if (typeof iss !== "string" || !iss.trim()) return "";
  const segs = iss.split("/");
  return String(segs[segs.length - 1] || "").trim();
}

export function jwtSubPreview(jwt: string, max = 64): string {
  const p = decodeJwtPayload(jwt);
  const sub = p?.sub;
  if (typeof sub !== "string" || !sub.trim()) return "YOUR_JWT_SUB";
  return sub.length > max ? sub.slice(0, max) : sub;
}
