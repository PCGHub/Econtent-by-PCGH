import { createClient } from "@supabase/supabase-js";
import { cleanupMedia } from "./cleanup.ts";
// Gateway JWT verification remains enabled. No caller-supplied targets or paths.
Deno.serve(async (req: Request) => {
  if (req.method !== "POST")
    return new Response("POST required", { status: 405 });
  const client = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  try {
    const result = await cleanupMedia(client);
    return Response.json(result, {
      status: result.failed ? 503 : 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return Response.json(
      {
        error:
          "Cleanup unavailable. Retrying will preserve unreleased storage accounting.",
      },
      { status: 503 },
    );
  }
});
