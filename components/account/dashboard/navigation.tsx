"use client";
import { useEffect, useRef, useState, type RefObject } from "react";
import Image from "next/image";
import { usePathname } from "next/navigation";
import Link from "next/link";
import {
  Bell,
  CheckCheck,
  Clapperboard,
  Film,
  FolderKanban,
  LibraryBig,
  Layers3,
  LayoutDashboard,
  LogOut,
  Mic2,
  WandSparkles,
  ScanFace,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Settings,
  Scissors,
  Subtitles,
  Type,
  X,
  ArrowUpRight,
} from "lucide-react";
import type { User } from "@supabase/supabase-js";
import { cn } from "@/lib/utils";
export const DASHBOARD_TOOLS = [
  {
    name: "Video Editor",
    href: "/video-editor",
    icon: Film,
    description: "Arrange video, text and audio.",
    color: "bg-blue-50 text-[#155DFC]",
  },
  {
    name: "Video Cutter",
    href: "/editor",
    icon: Scissors,
    description: "Fast cuts and precise trims.",
    color: "bg-sky-50 text-sky-700",
  },
  {
    name: "Overlay Studio",
    href: "/overlay-studio",
    icon: Layers3,
    description: "Layer video, images and text.",
    color: "bg-indigo-50 text-indigo-700",
  },
  {
    name: "Cinematic Titles",
    href: "/titles-studio",
    icon: Type,
    description: "Animated titles and credits.",
    color: "bg-violet-50 text-violet-700",
  },
  {
    name: "Transcription",
    href: "/transcription-studio",
    icon: Subtitles,
    description: "Transcripts and subtitle tools.",
    color: "bg-teal-50 text-teal-700",
  },
];
const groups = [
  {
    name: "Workspace",
    items: [
      { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
      { name: "My Projects", href: "/projects", icon: FolderKanban },
      { name: "My Library", href: "/library", icon: LibraryBig },
    ],
  },
  { name: "Creative Tools", items: DASHBOARD_TOOLS },
  {
    name: "AI Studio",
    items: [
      { name: "AI Voice-over", href: "/ai-voiceover", icon: Mic2 },
      { name: "Automatic Highlights", href: "/ai-highlights", icon: WandSparkles },
      { name: "Background Remover", href: "/ai-background", icon: ScanFace },
    ],
  },
  {
    name: "Account",
    items: [{ name: "Settings", href: "/settings", icon: Settings }],
  },
];
export function DashboardSidebar({
  collapsed,
  toggle,
  drawer,
  close,
  opener,
}: {
  collapsed: boolean;
  toggle: () => void;
  drawer: boolean;
  close: () => void;
  opener: RefObject<HTMLButtonElement | null>;
}) {
  const pathname = usePathname();
  const panel = useRef<HTMLElement>(null),
    closeButton = useRef<HTMLButtonElement>(null),
    collapse = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!drawer) return;
    const openerElement = opener.current,
      collapseElement = collapse.current;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButton.current?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
        return;
      }
      if (e.key !== "Tab") return;
      const items = Array.from(
          panel.current?.querySelectorAll<HTMLElement>(
            "a[href],button:not([disabled])",
          ) ?? [],
        ).filter((n) => n.getClientRects().length),
        first = items[0],
        last = items.at(-1);
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", key);
      if (openerElement?.getClientRects().length) openerElement.focus();
      else collapseElement?.focus();
    };
  }, [drawer, close, opener]);
  return (
    <>
      {drawer && (
        <button
          type="button"
          tabIndex={-1}
          onClick={close}
          className="fixed inset-0 z-40 bg-slate-950/40 backdrop-blur-[2px] lg:hidden"
          aria-label="Close navigation backdrop"
        />
      )}
      <aside
        ref={panel}
        id="dashboard-sidebar"
        aria-label="Dashboard navigation"
        role={drawer ? "dialog" : undefined}
        aria-modal={drawer ? true : undefined}
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-[264px] flex-col overflow-y-auto border-r border-slate-200 bg-white transition-[width,transform] duration-200 motion-reduce:transition-none lg:translate-x-0",
          collapsed ? "lg:w-[72px]" : "lg:w-56",
          drawer ? "flex translate-x-0" : "hidden -translate-x-full lg:flex",
        )}
      >
        <div
          className={cn(
            "flex h-[72px] shrink-0 items-center justify-between border-b border-slate-100 px-5",
            collapsed && "lg:px-[19px]",
          )}
        >
          <Link
            href="/dashboard"
            onClick={close}
            aria-label="Econtent by PCGH dashboard"
            className="flex items-center gap-2.5 rounded-lg"
          >
            <Image
              src="/pcgh-logo.webp"
              width={34}
              height={34}
              alt="PCGH logo"
              priority
              className="shrink-0 rounded-lg"
            />
            <span className={cn(collapsed && "lg:sr-only")}>
              <strong className="block text-[15px] font-bold tracking-tight">
                econtent
              </strong>
              <span className="mt-0.5 block text-[9px] font-semibold uppercase tracking-[.17em] text-[#155DFC]">
                by PCGH
              </span>
            </span>
          </Link>
          <button
            type="button"
            ref={closeButton}
            aria-label="Close navigation"
            onClick={close}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 lg:hidden"
          >
            <X className="size-5" />
          </button>
        </div>
        <div className="flex-1 px-3 py-5">
          {groups.map((group, i) => (
            <nav
              key={group.name}
              aria-label={group.name}
              className={cn(i > 0 && "mt-6")}
            >
              <h2
                className={cn(
                  "mb-2 px-3 text-[10px] font-semibold uppercase tracking-[.13em] text-slate-500",
                  collapsed && "lg:sr-only",
                )}
              >
                {group.name}
              </h2>
              <div className="space-y-1">
                {group.items.map(({ name, href, icon: Icon }) => (
                  <Link
                    key={href}
                    href={href}
                    onClick={close}
                    aria-label={name}
                    aria-current={pathname === href || (href === "/projects" && pathname.startsWith("/projects/")) ? "page" : undefined}
                    title={name}
                    className={cn(
                      "flex min-h-10 items-center gap-3 rounded-lg px-3 text-[13px] font-medium transition-colors",
                      (pathname === href || (href === "/projects" && pathname.startsWith("/projects/")))
                        ? "bg-blue-50 text-[#155DFC] ring-1 ring-inset ring-blue-100"
                        : "text-slate-600 hover:bg-slate-50 hover:text-slate-950",
                      collapsed && "lg:justify-center lg:px-0",
                    )}
                  >
                    <Icon aria-hidden="true" className="size-[17px] shrink-0" />
                    <span className={cn(collapsed && "lg:sr-only")}>
                      {name}
                    </span>
                  </Link>
                ))}
              </div>
            </nav>
          ))}
        </div>
        <div className="shrink-0 border-t border-slate-100 p-3">
          <button
            ref={collapse}
            type="button"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-expanded={!collapsed}
            aria-controls="dashboard-sidebar"
            onClick={toggle}
            className="hidden min-h-10 w-full items-center justify-center gap-2 rounded-lg text-xs font-medium text-slate-500 hover:bg-slate-50 lg:flex"
          >
            {collapsed ? (
              <PanelLeftOpen className="size-[17px]" aria-hidden="true" />
            ) : (
              <PanelLeftClose className="size-[17px]" aria-hidden="true" />
            )}
            <span className={cn(collapsed && "lg:sr-only")}>
              Collapse sidebar
            </span>
          </button>
          <p
            className={cn(
              "flex items-center justify-center gap-1.5 py-2 text-[10px] text-slate-500",
              collapsed && "lg:sr-only",
            )}
          >
            <Clapperboard className="size-3" aria-hidden="true" />
            Your media stays on your device
          </p>
        </div>
      </aside>
    </>
  );
}
export function DashboardHeader({
  user,
  name,
  drawer,
  setDrawer,
  opener,
  search,
  setSearch,
  onSearchSubmit,
  attention,
  available,
  onAttention,
  onRetry,
  onSignOut,
  signingOut,
}: {
  user: User | null;
  name: string;
  drawer: boolean;
  setDrawer: (value: boolean) => void;
  opener: RefObject<HTMLButtonElement | null>;
  search: string;
  setSearch: (s: string) => void;
  onSearchSubmit: () => void;
  attention: number;
  available: boolean;
  onAttention: () => void;
  onRetry: () => void;
  onSignOut: () => void;
  signingOut: boolean;
}) {
  const [open, setOpen] = useState<"account" | "updates" | null>(null),
    panel = useRef<HTMLDivElement>(null),
    searchInput = useRef<HTMLInputElement>(null),
    accountButton = useRef<HTMLButtonElement>(null),
    updatesButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const shortcut = (e: KeyboardEvent) => {
      if (!drawer && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchInput.current?.focus();
      }
    };
    document.addEventListener("keydown", shortcut);
    return () => document.removeEventListener("keydown", shortcut);
  }, [drawer]);
  useEffect(() => {
    if (!open) return;
    const outside = (e: PointerEvent) => {
      if (!panel.current?.contains(e.target as Node)) setOpen(null);
    };
    const escape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(null);
        (open === "account" ? accountButton : updatesButton).current?.focus();
      }
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);
  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex h-[72px] max-w-[1440px] items-center gap-3 px-4 sm:px-6 lg:px-8">
        <button
          ref={opener}
          type="button"
          aria-label="Open navigation"
          aria-expanded={drawer}
          aria-controls="dashboard-sidebar"
          onClick={() => setDrawer(true)}
          className="flex size-10 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 lg:hidden"
        >
          <Menu className="size-5" />
        </button>
        <div className="mr-5 hidden text-xs text-slate-500 xl:block">
          Workspace <span className="mx-2 text-slate-300">/</span>
          <span className="font-medium text-slate-900">Overview</span>
        </div>
        <form
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            onSearchSubmit();
          }}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-100 sm:max-w-md"
        >
          <Search
            aria-hidden="true"
            className="size-4 shrink-0 text-slate-400"
          />
          <input
            ref={searchInput}
            aria-label="Search projects"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search your projects…"
            className="h-10 min-w-0 flex-1 bg-transparent text-xs text-slate-900 placeholder:text-slate-500 focus-visible:!outline-none sm:text-sm"
          />
          {search ? (
            <button
              type="button"
              aria-label="Clear search"
              className="rounded p-1 text-slate-500"
              onClick={() => {
                setSearch("");
                searchInput.current?.focus();
              }}
            >
              <X className="size-3.5" />
            </button>
          ) : (
            <kbd className="hidden rounded border border-slate-200 px-1.5 text-[10px] text-slate-500 xl:inline">
              ⌘ / Ctrl K
            </kbd>
          )}
        </form>
        <div
          ref={panel}
          className="relative ml-auto flex shrink-0 items-center gap-2"
        >
          <button
            ref={updatesButton}
            type="button"
            aria-label="Notifications"
            aria-expanded={open === "updates"}
            aria-controls="dashboard-updates"
            onClick={() => setOpen((v) => (v === "updates" ? null : "updates"))}
            className="relative flex size-10 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
          >
            <Bell aria-hidden="true" className="size-[18px]" />
            {available && attention > 0 && (
              <span className="absolute right-2 top-2 size-1.5 rounded-full bg-rose-500">
                <span className="sr-only">Projects need attention</span>
              </span>
            )}
          </button>
          <span className="mx-1 h-6 border-l border-slate-200" />
          <button
            ref={accountButton}
            type="button"
            aria-label="Account menu"
            aria-expanded={open === "account"}
            aria-controls="dashboard-account"
            onClick={() => setOpen((v) => (v === "account" ? null : "account"))}
            className="flex size-9 items-center justify-center rounded-full bg-blue-50 text-sm font-semibold text-[#155DFC] ring-1 ring-inset ring-blue-200"
          >
            {name.slice(0, 1).toUpperCase()}
          </button>
          {open === "updates" && (
            <section
              id="dashboard-updates"
              aria-label="Workspace updates"
              className="absolute right-0 top-12 w-[min(300px,calc(100vw-32px))] rounded-xl border border-slate-200 bg-white p-4 shadow-lg"
            >
              <h2 className="text-sm font-semibold">Workspace updates</h2>
              <p className="mt-2 text-xs leading-5 text-slate-500">
                {!available
                  ? "Load your projects to see their saved status."
                  : attention
                    ? `${attention} saved ${attention === 1 ? "project needs" : "projects need"} attention. Review settings and reconnect local media to try again.`
                    : "No failed projects in your current list."}
              </p>
              {available && attention > 0 ? (
                <button
                  type="button"
                  onClick={() => {
                    setOpen(null);
                    onAttention();
                  }}
                  className="mt-3 inline-flex min-h-9 items-center gap-1 text-xs font-semibold text-[#155DFC]"
                >
                  Review projects <ArrowUpRight className="size-3" />
                </button>
              ) : !available ? (
                <button
                  type="button"
                  onClick={() => {
                    setOpen(null);
                    onRetry();
                  }}
                  className="mt-3 text-xs font-semibold text-[#155DFC]"
                >
                  Reload projects
                </button>
              ) : (
                <p className="mt-3 flex items-center gap-1.5 text-xs text-emerald-800">
                  <CheckCheck className="size-4" />
                  Based on saved project status
                </p>
              )}
            </section>
          )}
          {open === "account" && (
            <section
              id="dashboard-account"
              aria-label="Your account"
              className="absolute right-0 top-12 w-[min(256px,calc(100vw-32px))] rounded-xl border border-slate-200 bg-white p-2 shadow-lg"
            >
              <div className="border-b border-slate-100 px-3 py-2">
                <p className="truncate text-sm font-semibold">{name}</p>
                <p className="mt-1 truncate text-xs text-slate-500">
                  {user?.email}
                </p>
              </div>
              <Link
                href="/settings"
                onClick={() => setOpen(null)}
                className="mt-1 flex min-h-10 items-center gap-2 rounded-lg px-3 text-xs font-medium text-slate-600 hover:bg-slate-50"
              >
                <Settings className="size-4" aria-hidden="true" />
                Account settings
              </Link>
              <button
                type="button"
                disabled={signingOut}
                onClick={() => {
                  setOpen(null);
                  onSignOut();
                }}
                className="flex min-h-10 w-full items-center gap-2 rounded-lg px-3 text-left text-xs font-medium text-rose-800 hover:bg-rose-50 disabled:opacity-60"
              >
                <LogOut className="size-4" aria-hidden="true" />
                {signingOut ? "Signing out…" : "Sign out"}
              </button>
            </section>
          )}
        </div>
      </div>
    </header>
  );
}
