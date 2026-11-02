import Link from "next/link";
import { WorkspaceShell } from "@/components/workspace-shell";
export const metadata = { title: "Background Remover | Econtent by PCGH" };
export default function Page(){return <WorkspaceShell><div className="mx-auto max-w-4xl px-5 py-12"><p className="text-xs font-semibold uppercase tracking-widest text-blue-600">AI Studio</p><h1 className="mt-3 text-3xl font-semibold">Background Remover / Changer</h1><p className="mt-4 text-slate-600">Planned: isolate subjects in video, replace backgrounds, review masking quality, and export the result. Video background processing is not enabled yet.</p><Link className="mt-6 inline-block font-semibold text-blue-600 underline" href="/video-editor">Open Video Editor</Link></div></WorkspaceShell>}
