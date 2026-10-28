import "server-only";
import type {Database} from "./database.types";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { supabaseConfig } from "./config";
export async function serverSupabase() {
  const config = supabaseConfig();
  if (!config) return null;
  const store = await cookies();
  return createServerClient<Database>(config.url, config.key, {
    cookies: {
      getAll: () => store.getAll(),
      setAll(values) {
        try {
          values.forEach(({ name, value, options }) =>
            store.set(name, value, options),
          );
        } catch {
          /* Server Components cannot write cookies; proxy handles refresh. */
        }
      },
    },
  });
}
export async function requireAccount(next = "/dashboard") {
  const client = await serverSupabase();
  if (!client)
    redirect("/login?unavailable=1&next=" + encodeURIComponent(next));
  const {
    data: { user },
    error,
  } = await client.auth.getUser();
  if (error || !user || !user.email_confirmed_at)
    redirect("/login?next=" + encodeURIComponent(next));
  return { client, user };
}
