import { requireAccount } from "@/lib/supabase/server";
import { WorkspaceShell } from "@/components/workspace-shell";
import { LibraryWorkspace } from "@/components/library/library-workspace";
export const dynamic = "force-dynamic";
export default async function LibraryPage() { await requireAccount("/library"); return <WorkspaceShell><LibraryWorkspace/></WorkspaceShell>; }
