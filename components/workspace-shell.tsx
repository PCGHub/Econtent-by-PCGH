'use client'

import Link from 'next/link'
import {usePathname} from 'next/navigation'
import {useEffect, useId, useRef, useState, useSyncExternalStore, type ReactNode} from 'react'
import {Clapperboard, Film, FolderKanban, LayoutDashboard, Menu, PanelLeftClose, PanelLeftOpen, Settings, Sparkles, Subtitles, UserCircle, X} from 'lucide-react'
import {useAccount} from '@/components/account/provider'
import {cn} from '@/lib/utils'

// Selectively integrated from v0 8ff08dc. Processing and account routes stay intact.
const navigation = [
  {label:'Dashboard', href:'/dashboard', icon:LayoutDashboard},
  {label:'Video Cutter', href:'/editor', icon:Film},
  {label:'Overlay Studio', href:'/overlay-studio', icon:Clapperboard},
  {label:'Cinematic Titles', href:'/titles-studio', icon:Sparkles},
  {label:'Transcription', href:'/transcription-studio', icon:Subtitles},
  {label:'My projects', href:'/projects', icon:FolderKanban},
  {label:'Settings', href:'/settings', icon:Settings},
]
const query = '(min-width: 1024px)'
const subscribe = (notify:()=>void) => {
  const media=window.matchMedia(query)
  media.addEventListener('change',notify)
  return ()=>media.removeEventListener('change',notify)
}
const desktopSnapshot = () => window.matchMedia(query).matches
const serverSnapshot = () => false
const focusable = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex="0"]'

function Brand() {
  return <Link href="/dashboard" className="flex min-w-0 items-center gap-2.5" aria-label="Econtent dashboard">
    <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm"><Clapperboard aria-hidden="true" className="size-5"/></span>
    <span><span className="block text-[15px] font-bold leading-none">econtent</span><span className="mt-1 block text-[9px] font-semibold uppercase tracking-[.2em] text-slate-500">by PCGH</span></span>
  </Link>
}

/** One shell per workspace root. Drawer/collapse state never changes the children subtree. */
export function WorkspaceShell({children}:{children:ReactNode}) {
  const pathname=usePathname()
  const id=useId(),panelId=id+'-sidebar',titleId=id+'-navigation',contentId=id+'-content'
  const {user,loading}=useAccount()
  const desktop=useSyncExternalStore(subscribe,desktopSnapshot,serverSnapshot)
  const [collapsed,setCollapsed]=useState(false)
  const [drawerPath,setDrawerPath]=useState<string|null>(null)
  const modal=!desktop&&drawerPath===pathname
  const panel=useRef<HTMLElement>(null),opener=useRef<HTMLButtonElement>(null),closeButton=useRef<HTMLButtonElement>(null),collapseButton=useRef<HTMLButtonElement>(null)
  const name=typeof user?.user_metadata.display_name==='string'&&user.user_metadata.display_name.trim()?user.user_metadata.display_name:'Your account'

  useEffect(()=>{
    if(!modal)return
    const previous=document.body.style.overflow
    const trigger=opener.current,desktopTrigger=collapseButton.current
    document.body.style.overflow='hidden'
    closeButton.current?.focus()
    return ()=>{
      document.body.style.overflow=previous
      if(trigger?.isConnected&&trigger.getClientRects().length)trigger.focus()
      else desktopTrigger?.focus()
    }
  },[modal])

  return <div data-testid="workspace-shell" className="min-h-screen bg-slate-50 text-slate-950 [--workspace-sticky-offset:4.5rem]">
    <a href={'#'+contentId} className="sr-only z-[80] rounded-lg bg-white p-3 text-blue-700 focus:fixed focus:left-3 focus:top-3 focus:not-sr-only" inert={modal}>Skip to workspace content</a>
    <header inert={modal} className="sticky top-0 z-30 flex min-h-16 items-center justify-between gap-2 border-b border-slate-200 bg-white/95 px-4 py-2 backdrop-blur md:px-6" data-testid="workspace-header">
      <div className="flex min-w-0 items-center gap-3">
        <button ref={opener} type="button" aria-label="Open workspace navigation" aria-expanded={modal} aria-controls={panelId} onClick={()=>setDrawerPath(pathname)} className="rounded-lg p-3 text-slate-500 hover:bg-slate-100 lg:hidden"><Menu aria-hidden="true" className="size-5"/></button>
        <Brand/>
        <span className="ml-3 hidden border-l border-slate-200 pl-4 text-sm font-medium text-slate-500 md:block">Creative workspace</span>
      </div>
      <Link href={user?'/settings':'/login?next='+encodeURIComponent(pathname)} aria-label={user?'Account settings':loading?'Account loading':'Sign in'} className="flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-lg px-2 text-sm font-medium text-slate-600 hover:bg-slate-100">
        <UserCircle aria-hidden="true" className="size-5"/><span className="hidden max-w-44 truncate sm:inline">{loading?'Account…':user?name:'Sign in'}</span>
      </Link>
    </header>
    <div className="flex min-h-[calc(100vh-4rem)]">
      {modal&&<button type="button" tabIndex={-1} aria-label="Close workspace navigation backdrop" onClick={()=>setDrawerPath(null)} className="fixed inset-0 z-50 bg-slate-950/40 lg:hidden"/>}
      <aside ref={panel} id={panelId} role={modal?'dialog':undefined} aria-modal={modal?true:undefined} aria-labelledby={modal?titleId:undefined} inert={!desktop&&!modal}
        className={cn('fixed inset-y-0 left-0 z-[60] flex w-72 shrink-0 flex-col border-r border-slate-200 bg-white transition-[width,transform] motion-reduce:transition-none lg:sticky lg:top-16 lg:z-20 lg:h-[calc(100vh-4rem)] lg:translate-x-0 lg:visible',modal?'visible translate-x-0':'invisible -translate-x-full',collapsed&&'lg:w-20')}
        onKeyDown={event=>{
          if(!modal)return
          if(event.key==='Escape'){event.preventDefault();event.stopPropagation();setDrawerPath(null);return}
          if(event.key!=='Tab')return
          const items=Array.from(panel.current?.querySelectorAll<HTMLElement>(focusable)??[]).filter(item=>item.getClientRects().length)
          const first=items[0],last=items.at(-1)
          if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus()}
          else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus()}
        }}>
        <div className="flex min-h-16 items-center justify-between gap-2 border-b border-slate-100 p-3">
          <h2 id={titleId} className={cn('px-3 text-xs font-bold uppercase tracking-wider text-slate-500',collapsed&&'lg:sr-only')}>Workspace navigation</h2>
          <button ref={closeButton} type="button" aria-label="Close workspace navigation" onClick={()=>setDrawerPath(null)} className="rounded-lg p-3 text-slate-500 hover:bg-slate-100 lg:hidden"><X aria-hidden="true" className="size-5"/></button>
          <button ref={collapseButton} type="button" aria-label={collapsed?'Expand sidebar':'Collapse sidebar'} aria-expanded={!collapsed} aria-controls={panelId} onClick={()=>setCollapsed(value=>!value)} className="hidden rounded-lg p-3 text-slate-500 hover:bg-slate-100 lg:block">{collapsed?<PanelLeftOpen aria-hidden="true" className="size-5"/>:<PanelLeftClose aria-hidden="true" className="size-5"/>}</button>
        </div>
        <nav aria-label="Workspace navigation" className="flex flex-1 flex-col gap-1 overflow-y-auto p-3">
          {navigation.map(({label,href,icon:Icon})=>{
            const active=pathname===href||(href==='/projects'&&pathname.startsWith('/projects/'))||(href==='/editor'&&pathname==='/')
            return <Link key={href} href={href} aria-label={label} aria-current={active?'page':undefined} title={collapsed?label:undefined} onClick={event=>{if(!event.defaultPrevented)setDrawerPath(null)}} className={cn('flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors',active?'bg-blue-50 text-blue-600':'text-slate-600 hover:bg-slate-50 hover:text-slate-950',collapsed&&'lg:justify-center lg:px-0')}>
              <Icon aria-hidden="true" className="size-4 shrink-0"/><span className={cn('truncate',collapsed&&'lg:sr-only')}>{label}</span>
            </Link>
          })}
          <div className="my-4 border-t border-slate-100"/>
          {([{label:'Transcription',icon:Subtitles}]).map(({label,icon:Icon})=><span key={label} role="link" aria-disabled="true" aria-label={label+' coming soon'} title={label+' · coming soon'} className={cn('flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm text-slate-400',collapsed&&'lg:justify-center lg:px-0')}>
            <Icon aria-hidden="true" className="size-4 shrink-0"/><span className={cn('truncate',collapsed&&'lg:sr-only')}>{label}</span><span className={cn('ml-auto rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] font-semibold',collapsed&&'lg:hidden')}>Soon</span>
          </span>)}
        </nav>
        <div className={cn('border-t border-slate-100 p-4 text-xs text-slate-500',collapsed&&'lg:sr-only')}>
          {loading?'Loading account…':user?<><p className="truncate font-semibold text-slate-700">{name}</p><p className="mt-1">Your private workspace</p></>:<><p className="font-semibold text-slate-700">Guest workspace</p><p className="mt-1">Local editing stays free. Sign in to save drafts.</p></>}
        </div>
      </aside>
      <div id={contentId} data-testid="workspace-content" tabIndex={-1} inert={modal} className="min-w-0 flex-1">{children}</div>
    </div>
  </div>
}
