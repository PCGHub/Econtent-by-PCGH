"use client";
import { useEffect, useState } from "react";
import { CircleDollarSign, Clock3, RefreshCw, ShieldCheck, WalletCards } from "lucide-react";
import { billingClient } from "@/lib/billing/client";
import { formatNairaFromKobo, TOP_UPS_KOBO, type WalletSnapshot } from "@/lib/billing/model";

const stateStyle: Record<string, string> = {
  settled: "bg-emerald-50 text-emerald-700",
  verified: "bg-emerald-50 text-emerald-700",
  pending: "bg-amber-50 text-amber-700",
  reserved: "bg-blue-50 text-blue-700",
  verification_pending: "bg-blue-50 text-blue-700",
  refunded: "bg-violet-50 text-violet-700",
  released: "bg-slate-100 text-slate-700",
  failed: "bg-rose-50 text-rose-700",
};

export function CreditWallet() {
  const [data, setData] = useState<WalletSnapshot>();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const load = () => {
    setLoading(true); setError("");
    void billingClient.wallet().then(setData).catch((cause) =>
      setError(cause instanceof Error ? cause.message : "Wallet unavailable"),
    ).finally(() => setLoading(false));
  };
  useEffect(() => {
    let current = true;
    void billingClient.wallet().then((snapshot) => { if (current) setData(snapshot); }).catch((cause) => {
      if (current) setError(cause instanceof Error ? cause.message : "Wallet unavailable");
    }).finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, []);
  const aiSpent = data?.ledger.filter((entry) => {
    const metadata = entry.metadata as Record<string, unknown> | undefined;
    const pricing = metadata?.pricing as { features?: Array<{ key?: string }> } | undefined;
    return pricing?.features?.some((feature) => feature.key && feature.key !== "basic_export");
  }).reduce((sum, entry) => sum + Math.max(0, -Number(entry.available_delta ?? 0)), 0) ?? 0;
  return <main className="mx-auto min-h-[calc(100dvh-72px)] max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div><p className="text-xs font-semibold uppercase tracking-[.14em] text-blue-600">Pay as you go</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">Credit wallet</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">One credit is ₦10. Editing, trimming, uploading and previewing remain free. Charges require a verified successful export.</p></div>
      <button type="button" disabled className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-55">Buy Credits</button>
    </div>
    <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"><strong>Payments are not active.</strong> The provider is intentionally unconfigured, so no real money can be collected.</p>
    {error && <div className="mt-5 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800" role="alert">{error}<button onClick={load} className="ml-3 underline">Retry</button></div>}
    <section aria-label="Wallet balance" className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {[{label:"Available credits",value:loading?"—":String(data?.availableCredits ?? 0),note:formatNairaFromKobo((data?.availableCredits ?? 0)*1000),icon:WalletCards},
        {label:"Reserved credits",value:loading?"—":String(data?.reservedCredits ?? 0),note:"Held during export verification",icon:Clock3},
        {label:"AI credits spent",value:loading?"—":String(aiSpent),note:"Estimated AI usage",icon:CircleDollarSign},
        {label:"Ledger security",value:"Server",note:"Atomic and auditable",icon:ShieldCheck}].map(({label,value,note,icon:Icon})=><article key={label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><Icon className="size-5 text-blue-600"/><p className="mt-4 text-xs font-medium text-slate-500">{label}</p><p className="mt-2 text-3xl font-bold">{value}</p><p className="mt-2 text-xs text-slate-500">{note}</p></article>)}
    </section>
    <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-5">
      <h2 className="font-bold">Top-up options</h2><p className="mt-1 text-xs text-slate-500">No promotional bonuses. Checkout remains disabled until a Nigerian gateway is selected and approved.</p>
      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">{TOP_UPS_KOBO.map(kobo=><button key={kobo} disabled className="rounded-xl border border-slate-200 p-4 text-left disabled:opacity-60"><strong className="block">{formatNairaFromKobo(kobo)}</strong><span className="mt-1 block text-xs text-slate-500">{kobo/1000} credits</span></button>)}</div>
    </section>
    <section className="mt-8 grid gap-6 xl:grid-cols-2">
      <History title="Transactions" rows={data?.payments ?? []} empty="No payment transactions yet." />
      <History title="Export history" rows={data?.exports ?? []} empty="No billed exports yet." />
    </section>
    <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex items-center justify-between"><h2 className="font-bold">Immutable credit ledger</h2><button type="button" onClick={load} disabled={loading} className="rounded-lg p-2 text-slate-500" aria-label="Refresh wallet"><RefreshCw className={`size-4 ${loading?"animate-spin":""}`}/></button></div>
      <History rows={data?.ledger ?? []} empty="No credit movements yet." />
    </section>
  </main>;
}

function History({ title, rows, empty }: { title?: string; rows: Array<Record<string, unknown>>; empty: string }) {
  return <div className={title ? "rounded-2xl border border-slate-200 bg-white p-5" : "mt-3"}>{title && <h2 className="font-bold">{title}</h2>}
    {!rows.length ? <p className="mt-4 text-sm text-slate-500">{empty}</p> : <div className="mt-4 space-y-3">{rows.slice(0,20).map((row,index)=>{
      const state=String(row.status ?? row.state ?? row.entry_type ?? "recorded");
      const credits=Number(row.credits ?? row.quoted_credits ?? row.available_delta ?? 0);
      return <article key={String(row.id ?? index)} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-100 p-3 text-sm"><div><p className="font-semibold">{String(row.description ?? row.gateway ?? row.feature_keys ?? "Credit activity")}</p><p className="mt-1 text-xs text-slate-500">{row.created_at ? new Date(String(row.created_at)).toLocaleString() : ""}</p></div><div className="text-right"><p className="font-bold">{credits > 0 ? "+" : ""}{credits} credits</p><span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${stateStyle[state] ?? "bg-slate-100 text-slate-700"}`}>{state.replaceAll("_"," ")}</span></div></article>;
    })}</div>}
  </div>;
}

