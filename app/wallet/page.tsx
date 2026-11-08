import { requireAccount } from "@/lib/supabase/server";
import { WorkspaceShell } from "@/components/workspace-shell";
import { CreditWallet } from "@/components/account/credit-wallet";

export const dynamic = "force-dynamic";
export default async function WalletPage() {
  await requireAccount("/wallet");
  return <WorkspaceShell><CreditWallet /></WorkspaceShell>;
}

