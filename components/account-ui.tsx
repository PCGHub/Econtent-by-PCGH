"use client";
import Link from "next/link";
import { Clapperboard, ShieldCheck } from "lucide-react";
export { AuthForm } from "./account/auth-form";
export { DashboardPage, ProjectsPage, SettingsPage } from "./account/workspace";
export function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2.5">
      <span className="flex size-9 items-center justify-center rounded-xl bg-[#2563eb] text-white">
        <Clapperboard className="size-5" />
      </span>
      <span>
        <strong className="block text-[15px] leading-none tracking-tight text-[#0f172a]">
          econtent
        </strong>
        <small className="mt-1 block text-[9px] font-bold uppercase tracking-[.2em] text-slate-500">
          by PCGH
        </small>
      </span>
    </Link>
  );
}

export function AuthLayout({
  children,
  eyebrow,
  title,
  copy,
}: {
  children: React.ReactNode;
  eyebrow: string;
  title: string;
  copy: string;
}) {
  return (
    <main className="grid min-h-screen bg-white lg:grid-cols-[.9fr_1.1fr]">
      <section className="hidden bg-[#0f172a] p-10 text-white lg:flex lg:flex-col lg:justify-between">
        <Logo />
        <div className="max-w-md">
          <p className="text-sm font-semibold uppercase tracking-[.18em] text-blue-300">
            {eyebrow}
          </p>
          <h1 className="mt-5 text-5xl font-bold leading-tight tracking-[-.04em]">
            {title}
          </h1>
          <p className="mt-5 text-lg leading-8 text-slate-300">{copy}</p>
          <div className="mt-10 flex items-center gap-3 text-sm text-slate-300">
            <ShieldCheck className="size-5 text-blue-300" /> Your files stay in
            your control.
          </div>
        </div>
        <p className="text-sm text-slate-400">© 2026 PCGH</p>
      </section>
      <section className="flex items-center justify-center p-5 sm:p-10">
        <div className="w-full max-w-md">
          <div className="mb-10 lg:hidden">
            <Logo />
          </div>
          {children}
        </div>
      </section>
    </main>
  );
}
