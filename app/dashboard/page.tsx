import { DashboardPage } from "@/components/account-ui";
import { requireAccount } from "@/lib/supabase/server";
export default async function Page() {
  await requireAccount("/dashboard");
  return <DashboardPage />;
}

export const dynamic = "force-dynamic";
