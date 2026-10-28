'use client'
import Link from 'next/link'
export default function ProjectError({reset}:{reset:()=>void}){return <main className="min-h-screen bg-slate-50 p-8 text-slate-900"><h1 className="text-2xl font-bold">Unable to load projects</h1><p className="my-4">Check your connection and try again. Your original video remains on your device.</p><button onClick={reset} className="mr-5 rounded-lg bg-blue-600 px-4 py-2 text-white">Try again</button><Link href="/editor" className="text-blue-600">Open guest editor</Link></main>}
