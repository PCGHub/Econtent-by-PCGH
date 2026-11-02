import Link from "next/link";
import { WorkspaceShell } from "@/components/workspace-shell";
export const metadata = { title: "Automatic Highlights | Econtent by PCGH" };
export default function Page(){return <WorkspaceShell><div className="mx-auto max-w-4xl px-5 py-12"><p className="text-xs font-semibold uppercase tracking-widest text-blue-600">AI Studio</p><h1 className="mt-3 text-3xl font-semibold">Automatic Highlights</h1><p className="mt-4 text-slate-600">Planned: analyze a longer video, suggest short clips, and let you approve every selection before export. AI analysis is not enabled yet.</p><Link className="mt-6 inline-block font-semibold text-blue-600 underline" href="/video-editor">Open Video Editor</Link></div></WorkspaceShell>}
