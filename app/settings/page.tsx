import { SettingsPage } from "@/components/account-ui";
import { requireAccount } from "@/lib/supabase/server";
export default async function Page() {
  await requireAccount("/settings");
  return <SettingsPage />;
}

export const dynamic = "force-dynamic";
