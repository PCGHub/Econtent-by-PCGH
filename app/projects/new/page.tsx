import { NewProject } from "@/components/account/workspace";
import { requireAccount } from "@/lib/supabase/server";
export default async function Page() {
  await requireAccount("/projects/new");
  return <NewProject />;
}

export const dynamic = "force-dynamic";
