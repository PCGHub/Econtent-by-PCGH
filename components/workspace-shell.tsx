'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import {
  Archive,
  ChevronRight,
  Clapperboard,
  Film,
  FolderKanban,
  LayoutDashboard,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  Sparkles,
  Subtitles,
  UserCircle,
  X,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const primaryNavigation = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { label: 'Video Cutter', href: '/', icon: Film },
  { label: 'Overlay Studio', href: '/overlay-studio', icon: Clapperboard },
  { label: 'Cinematic Titles', href: '/titles-studio', icon: Sparkles, soon: true },
  { label: 'Transcription', href: '/transcription-studio', icon: Subtitles },
  { label: 'My Projects', href: '/projects', icon: FolderKanban },
]

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/dashboard" className={cn('flex min-w-0 items-center gap-2.5', compact && 'justify-center')} aria-label="Econtent dashboard">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-[#2563eb] text-white shadow-sm shadow-blue-600/20">
        <Clapperboard aria-hidden="true" className="size-5" />
      </span>
      {!compact && <span className="min-w-0"><span className="block truncate text-[15px] font-bold leading-none tracking-tight text-slate-950 dark:text-white">econtent</span><span className="mt-1 block text-[9px] font-semibold uppercase tracking-[0.2em] text-slate-500">by PCGH</span></span>}
    </Link>
  )
}

export function WorkspaceShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <div className="min-h-screen bg-slate-50 text-slate-950 dark:bg-slate-950 dark:text-white">
      <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-slate-200 bg-white/95 px-4 backdrop-blur md:px-6 dark:border-slate-800 dark:bg-slate-950/95">
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => setMobileOpen(true)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 md:hidden dark:hover:bg-slate-800" aria-label="Open workspace navigation"><Menu className="size-5" /></button>
          <div className="hidden md:block"><Brand compact={collapsed} /></div>
          <div className="hidden h-6 w-px bg-slate-200 md:block dark:bg-slate-800" />
          <span className="hidden text-sm font-medium text-slate-500 md:block">Creative workspace</span>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/projects" className="hidden rounded-lg px-3 py-2 text-sm font-medium text-slate-500 hover:bg-slate-100 sm:block dark:hover:bg-slate-800">My projects</Link>
          <Link href="/settings" className="flex items-center gap-2 rounded-lg px-2 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"><UserCircle className="size-5" /><span className="hidden lg:inline">Alex Morgan</span></Link>
        </div>
      </header>

      <div className="flex min-h-[calc(100vh-4rem)]">
        {mobileOpen && <button type="button" onClick={() => setMobileOpen(false)} className="fixed inset-0 z-30 bg-slate-950/40 md:hidden" aria-label="Close workspace navigation" />}
        <aside className={cn('fixed inset-y-0 left-0 z-40 flex w-72 flex-col border-r border-slate-200 bg-white pt-16 transition-transform md:sticky md:top-16 md:z-20 md:h-[calc(100vh-4rem)] md:translate-x-0 md:pt-0 dark:border-slate-800 dark:bg-slate-950', mobileOpen ? 'translate-x-0' : '-translate-x-full', collapsed && 'md:w-[76px]')}>
          <div className="flex items-center justify-between border-b border-slate-100 p-3 dark:border-slate-800">
            <div className={cn('min-w-0', collapsed && 'md:hidden')}><Brand /></div>
            <button type="button" onClick={() => setMobileOpen(false)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 md:hidden dark:hover:bg-slate-800" aria-label="Close navigation"><X className="size-5" /></button>
            <button type="button" onClick={() => setCollapsed(!collapsed)} className="hidden rounded-lg p-2 text-slate-500 hover:bg-slate-100 md:block dark:hover:bg-slate-800" aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>{collapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}</button>
          </div>
          <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-3" aria-label="Workspace navigation">
            <div className="mb-2 px-3 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Workspace</div>
            {primaryNavigation.map(({ label, href, icon: Icon, soon }) => {
              const active = href === '/' ? pathname === '/' : pathname.startsWith(href)
              return <Link key={label} href={href} onClick={() => setMobileOpen(false)} aria-current={active ? 'page' : undefined} className={cn('group flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors', active ? 'bg-blue-50 text-[#2563eb] dark:bg-blue-500/15 dark:text-blue-300' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-950 dark:text-slate-400 dark:hover:bg-slate-900 dark:hover:text-white', collapsed && 'md:justify-center md:px-0')}>
                <Icon className="size-4 shrink-0" />
                <span className={cn('truncate', collapsed && 'md:hidden')}>{label}</span>
                {soon && !collapsed && <span className="ml-auto rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] font-semibold text-slate-400 dark:bg-slate-800">Soon</span>}
              </Link>
            })}
            <div className="my-4 border-t border-slate-100 dark:border-slate-800" />
            <div className="mb-2 px-3 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Account</div>
            <Link href="/settings" onClick={() => setMobileOpen(false)} className={cn('flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium text-slate-600 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-slate-900', collapsed && 'md:justify-center md:px-0')}><Settings className="size-4 shrink-0" /><span className={cn(collapsed && 'md:hidden')}>Settings</span></Link>
            <Link href="/projects" onClick={() => setMobileOpen(false)} className={cn('flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium text-slate-600 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-slate-900', collapsed && 'md:justify-center md:px-0')}><Archive className="size-4 shrink-0" /><span className={cn(collapsed && 'md:hidden')}>Saved drafts</span></Link>
          </nav>
          <div className={cn('border-t border-slate-100 p-3 dark:border-slate-800', collapsed && 'md:flex md:justify-center')}><Link href="/settings" className={cn('flex items-center gap-3 rounded-xl bg-slate-50 p-3 dark:bg-slate-900', collapsed && 'md:bg-transparent md:p-0')}><UserCircle className="size-7 shrink-0 text-slate-400" /><span className={cn('min-w-0', collapsed && 'md:hidden')}><span className="block truncate text-sm font-semibold">Alex Morgan</span><span className="block truncate text-xs text-slate-500">Free workspace</span></span><ChevronRight className={cn('ml-auto size-4 text-slate-400', collapsed && 'md:hidden')} /></Link></div>
        </aside>
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  )
}
