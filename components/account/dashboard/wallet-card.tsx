"use client";
import {useEffect,useState} from "react";
import Link from "next/link";
import {ArrowRight,Clock3,CreditCard,RefreshCw,TriangleAlert,WalletCards} from "lucide-react";
import {billingClient} from "@/lib/billing/client";
import {formatNairaFromKobo,type WalletSnapshot} from "@/lib/billing/model";

export function DashboardWalletCard(){
  const [wallet,setWallet]=useState<WalletSnapshot>();const[loading,setLoading]=useState(true),[error,setError]=useState("");const[reload,setReload]=useState(0);
  useEffect(()=>{let current=true;void billingClient.wallet().then(data=>{if(current)setWallet(data)}).catch(cause=>{if(current){setWallet(undefined);setError(cause instanceof Error?cause.message:"Wallet unavailable")}}).finally(()=>{if(current)setLoading(false)});return()=>{current=false}},[reload]);
  const retry=()=>{setLoading(true);setError("");setWallet(undefined);setReload(value=>value+1)};
  const insufficient=wallet!==undefined&&wallet.availableCredits<5,paymentsEnabled=process.env.NEXT_PUBLIC_FLUTTERWAVE_TEST_ENABLED==="true";
  return <section aria-labelledby="dashboard-wallet-heading" className="mt-6 overflow-hidden rounded-2xl border border-blue-200 bg-white shadow-[0_8px_28px_rgba(21,93,252,.08)]">
    <div className="grid gap-5 p-5 sm:p-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
      <div className="min-w-0"><div className="flex items-center gap-3"><span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-[#155DFC]"><WalletCards className="size-5"/></span><div><p className="text-[10px] font-semibold uppercase tracking-[.14em] text-[#155DFC]">Pay as you go</p><h2 id="dashboard-wallet-heading" className="mt-1 text-lg font-semibold">My Credit Wallet</h2></div></div>
        {loading?<div className="mt-5 grid grid-cols-2 gap-3 sm:max-w-lg sm:grid-cols-3" aria-label="Loading wallet"><span className="h-16 animate-pulse rounded-xl bg-slate-100"/><span className="h-16 animate-pulse rounded-xl bg-slate-100"/><span className="h-16 animate-pulse rounded-xl bg-slate-100"/></div>:error||!wallet?<div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"><TriangleAlert className="size-4 shrink-0"/><span className="min-w-0 flex-1">Wallet balance is unavailable. No balance has been assumed.</span><button onClick={retry} className="inline-flex items-center gap-1 font-semibold text-blue-700"><RefreshCw className="size-3.5"/>Retry</button></div>:<div className="mt-5 grid grid-cols-2 gap-3 sm:max-w-2xl sm:grid-cols-3"><Metric label="Available" value={`${wallet.availableCredits} credits`} note={formatNairaFromKobo(wallet.availableCredits*1000)}/><Metric label="Reserved" value={`${wallet.reservedCredits} credits`} note="Awaiting verification"/><Metric label="Basic export" value="5 credits" note="₦50 per success"/></div>}
        {insufficient&&<p className="mt-3 flex items-center gap-2 text-xs font-medium text-amber-700"><TriangleAlert className="size-3.5"/>You need at least 5 credits for a basic export.</p>}
        {!paymentsEnabled&&<p className="mt-3 text-xs text-slate-500">Credit purchases are currently disabled. Flutterwave remains in Test Mode.</p>}
      </div>
      <div className="grid grid-cols-2 gap-2 sm:flex lg:flex-col"><Link href="/wallet#top-up-options" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-[#155DFC] px-4 text-xs font-semibold text-white hover:bg-blue-700"><CreditCard className="size-4"/>Buy Credits</Link><Link href="/wallet#transaction-history" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-slate-200 px-4 text-xs font-semibold text-slate-700 hover:border-blue-300 hover:text-blue-700"><Clock3 className="size-4"/>History<ArrowRight className="size-3.5"/></Link></div>
    </div>
  </section>
}
function Metric({label,value,note}:{label:string;value:string;note:string}){return <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3"><p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">{label}</p><p className="mt-1.5 text-base font-semibold text-slate-950">{value}</p><p className="mt-1 text-[10px] text-slate-500">{note}</p></div>}
