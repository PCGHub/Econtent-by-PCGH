import { ProjectsPage } from "@/components/account-ui";
import { requireAccount } from "@/lib/supabase/server";
export default async function Page() {
  await requireAccount("/projects");
  return <ProjectsPage />;
}

export const dynamic = "force-dynamic";
