"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Menu, UserCircle } from "lucide-react";
import { useAccount } from "@/components/account/provider";
import { DashboardSidebar } from "@/components/account/dashboard/navigation";
import { cn } from "@/lib/utils";

export function WorkspaceShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { user, loading } = useAccount();
  const [collapsed, setCollapsed] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const opener = useRef<HTMLButtonElement>(null);
  useEffect(() => { setDrawer(false); }, [pathname]);
  useEffect(() => {
    try { setCollapsed(localStorage.getItem("econtent-dashboard-collapsed") === "true"); } catch {}
  }, []);
  const toggle = () => {
    setCollapsed(value => {
      try { localStorage.setItem("econtent-dashboard-collapsed", String(!value)); } catch {}
      return !value;
    });
  };
  const name = typeof user?.user_metadata?.display_name === "string" && user.user_metadata.display_name.trim()
    ? user.user_metadata.display_name : user?.email?.split("@")[0] || "Your account";
  return <div data-testid="workspace-shell" className="min-h-dvh bg-slate-50 text-slate-950">
    <a href="#workspace-content" className="sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[80] focus:not-sr-only focus:rounded-lg focus:bg-white focus:p-3">Skip to workspace content</a>
    <DashboardSidebar collapsed={collapsed} toggle={toggle} drawer={drawer} close={() => setDrawer(false)} opener={opener}/>
    <div inert={drawer} className={cn("min-w-0 transition-[margin] duration-200 motion-reduce:transition-none", collapsed ? "lg:ml-[72px]" : "lg:ml-56")}>
      <header className="sticky top-0 z-30 flex h-[72px] items-center justify-between gap-3 border-b border-slate-200 bg-white/95 px-4 backdrop-blur sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <button ref={opener} type="button" aria-label="Open navigation" aria-expanded={drawer} aria-controls="dashboard-sidebar" onClick={() => setDrawer(true)} className="flex size-10 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 lg:hidden"><Menu className="size-5" aria-hidden="true"/></button>
          <span className="truncate text-sm font-medium text-slate-600">Workspace <span className="mx-2 text-slate-300">/</span><span className="text-slate-900">{pathname.startsWith("/projects") ? "My Projects" : pathname === "/video-editor" ? "Video Editor" : pathname === "/editor" ? "Video Cutter" : pathname === "/overlay-studio" ? "Overlay Studio" : pathname === "/titles-studio" ? "Cinematic Titles" : pathname === "/transcription-studio" ? "Transcription" : pathname === "/settings" ? "Settings" : "Creative Studio"}</span></span>
        </div>
        <Link href={user ? "/settings" : "/login?next=" + encodeURIComponent(pathname)} className="flex min-h-10 items-center gap-2 rounded-lg px-2 text-sm text-slate-600 hover:bg-slate-100"><UserCircle className="size-5" aria-hidden="true"/><span className="hidden max-w-36 truncate sm:inline">{loading ? "Account…" : user ? name : "Sign in"}</span></Link>
      </header>
      <main id="workspace-content" tabIndex={-1} data-testid="workspace-content" className="min-w-0 outline-none">{children}</main>
    </div>
  </div>;
}
