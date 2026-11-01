import { CreatorDashboard } from "@/components/account/creator-dashboard";
import { requireAccount } from "@/lib/supabase/server";
export default async function Page() {
  await requireAccount("/dashboard");
  return <CreatorDashboard />;
}

export const dynamic = "force-dynamic";
