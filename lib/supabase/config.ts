export function supabaseConfig(): { url: string; key: string } | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim(),
    key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!url || !key) return null;
  try {
    const parsed = new URL(url);
    const local = ["localhost", "127.0.0.1"].includes(parsed.hostname);
    if (
      (parsed.protocol !== "https:" &&
        !(local && parsed.protocol === "http:")) ||
      parsed.username ||
      parsed.password ||
      parsed.pathname !== "/"
    )
      return null;
    if (key.startsWith("sb_secret_")) return null;
    if (!key.startsWith("sb_publishable_")) {
      // Local Supabase currently emits an anon JWT. Reject service-role and malformed JWTs.
      const part = key.split(".")[1];
      if (!part) return null;
      const data = JSON.parse(atob(part.replace(/-/g, "+").replace(/_/g, "/")));
      if (data.role !== "anon") return null;
    }
    return { url: parsed.origin, key };
  } catch {
    return null;
  }
}
