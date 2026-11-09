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
  const testPayments = process.env.NEXT_PUBLIC_FLUTTERWAVE_TEST_ENABLED === "true";
  const [data, setData] = useState<WalletSnapshot>();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [checkoutAmount,setCheckoutAmount]=useState<number>();
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
  const balanceValue=loading?"—":data?String(data.availableCredits):"Unavailable",balanceNote=loading?"Loading balance…":data?formatNairaFromKobo(data.availableCredits*1000):"No balance loaded";
  const buy=async(amountKobo:number)=>{setCheckoutAmount(amountKobo);setError("");try{const result=await billingClient.createTopUp(amountKobo);window.location.assign(result.checkoutUrl)}catch(cause){setError(cause instanceof Error?cause.message:"Could not start Test Mode checkout");setCheckoutAmount(undefined)}};
  return <main className="mx-auto min-h-[calc(100dvh-72px)] max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div><p className="text-xs font-semibold uppercase tracking-[.14em] text-blue-600">Pay as you go</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">Credit wallet</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">One credit is ₦10. Editing, trimming, uploading and previewing remain free. Charges require a verified successful export.</p></div>
      <a href="#top-up-options" className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white">Buy Credits</a>
    </div>
    <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"><strong>{testPayments?"Flutterwave Test Mode":"Payments are not active"}.</strong> {testPayments?"Only Flutterwave test cards are accepted. No real money is collected.":"Configure Preview Test Mode to exercise checkout without real money."}</p>
    {error && <div className="mt-5 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800" role="alert">{error}<button onClick={load} className="ml-3 underline">Retry</button></div>}
    {data&&data.availableCredits<5&&<p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Insufficient balance for a basic export. You need 5 credits (₦50).</p>}
    <section aria-label="Wallet balance" className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {[{label:"Available credits",value:balanceValue,note:balanceNote,icon:WalletCards},
        {label:"Reserved credits",value:loading?"—":data?String(data.reservedCredits):"Unavailable",note:data?"Held during export verification":"No reservation data loaded",icon:Clock3},
        {label:"AI credits spent",value:loading?"—":data?String(aiSpent):"Unavailable",note:data?"Estimated AI usage":"No ledger data loaded",icon:CircleDollarSign},
        {label:"Ledger security",value:"Server",note:"Atomic and auditable",icon:ShieldCheck}].map(({label,value,note,icon:Icon})=><article key={label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><Icon className="size-5 text-blue-600"/><p className="mt-4 text-xs font-medium text-slate-500">{label}</p><p className="mt-2 text-3xl font-bold">{value}</p><p className="mt-2 text-xs text-slate-500">{note}</p></article>)}
    </section>
    <section id="top-up-options" className="mt-8 rounded-2xl border border-slate-200 bg-white p-5">
      <h2 className="font-bold">Top-up options</h2><p className="mt-1 text-xs text-slate-500">No promotional bonuses. {testPayments?"Checkout opens Flutterwave Test Mode.":"Test checkout is disabled in this environment."}</p>
      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">{TOP_UPS_KOBO.map(kobo=><button key={kobo} disabled={!testPayments||checkoutAmount!==undefined} onClick={()=>void buy(kobo)} className="rounded-xl border border-slate-200 p-4 text-left disabled:opacity-60"><strong className="block">{formatNairaFromKobo(kobo)}</strong><span className="mt-1 block text-xs text-slate-500">{checkoutAmount===kobo?"Opening test checkout…":`${kobo/1000} credits`}</span></button>)}</div>
    </section>
    <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-5"><h2 className="font-bold">Current export and AI pricing</h2><p className="mt-1 text-xs text-slate-500">Basic export is 5 credits (₦50). AI prices are configurable estimates until provider costs are verified.</p>
      {loading?<p className="mt-4 text-sm text-slate-500">Loading current server pricing…</p>:!data?<p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Pricing is unavailable because the wallet service could not be loaded.</p>:<div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{data.pricing.map(price=>{const duration=price.credits_per_started_minute>0?` + ${price.credits_per_started_minute}/started minute`:"";return <article key={price.feature_key} className="rounded-xl border border-slate-100 bg-slate-50 p-3"><div className="flex items-start justify-between gap-2"><h3 className="text-sm font-semibold">{price.display_name}</h3>{price.estimate_only&&<span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800">Estimate</span>}</div><p className="mt-2 text-lg font-bold text-blue-700">{price.fixed_credits||price.minimum_credits} credits</p><p className="mt-1 text-xs text-slate-500">{formatNairaFromKobo((price.fixed_credits||price.minimum_credits)*1000)}{duration}</p></article>})}</div>}
    </section>
    <section id="transaction-history" className="mt-8 grid scroll-mt-24 gap-6 xl:grid-cols-2">
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

