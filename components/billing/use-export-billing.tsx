"use client";
import { useRef, useState, type ReactNode } from "react";
import { billingClient } from "@/lib/billing/client";
import { formatNairaFromKobo, type ExportQuote } from "@/lib/billing/model";

type Reservation = { exportId: string | null; active: boolean };
type Pending = {
  durationSeconds: number;
  featureKeys: string[];
  projectId?: string;
  resolve: (value: Reservation | null) => void;
};

export function useExportBilling() {
  const active = process.env.NEXT_PUBLIC_EXPORT_BILLING_ENABLED === "approved-live";
  const [pending, setPending] = useState<Pending>();
  const [quote, setQuote] = useState<ExportQuote>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const requestRef = useRef<string | undefined>(undefined);

  const request = async (durationSeconds: number, featureKeys = ["basic_export"], projectId?: string) => {
    if (!active) return { exportId: null, active: false } satisfies Reservation;
    setError(""); setQuote(undefined); requestRef.current = crypto.randomUUID();
    return new Promise<Reservation | null>((resolve) => {
      const next = { durationSeconds: Math.max(1, Math.ceil(durationSeconds)), featureKeys, projectId, resolve };
      setPending(next);
      void billingClient.quote(next.durationSeconds, featureKeys).then(setQuote).catch((cause) =>
        setError(cause instanceof Error ? cause.message : "Could not load export price"),
      );
    });
  };
  const close = () => { pending?.resolve(null); setPending(undefined); setQuote(undefined); setError(""); };
  const confirm = async () => {
    if (!pending || !quote || busy || !requestRef.current) return;
    setBusy(true); setError("");
    try {
      const result = await billingClient.reserve({ clientRequestId: requestRef.current,
        durationSeconds: pending.durationSeconds, featureKeys: pending.featureKeys, projectId: pending.projectId });
      pending.resolve({ exportId: result.exportId, active: true });
      setPending(undefined); setQuote(undefined);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not reserve credits"); }
    finally { setBusy(false); }
  };
  const candidate = async (reservation: Reservation, blob: Blob, durationSeconds: number) => {
    if (!reservation.exportId) return { settled: false, inactive: true, message: "Billing is not active." };
    const bytes = await blob.arrayBuffer();
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    const sha256 = Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join("");
    return billingClient.candidate({ exportId: reservation.exportId, sha256, sizeBytes: blob.size,
      durationMs: Math.max(1, Math.round(durationSeconds * 1000)) });
  };
  const cancel = async (reservation: Reservation | null) => {
    if (reservation?.exportId) await billingClient.cancel(reservation.exportId).catch(() => undefined);
  };
  const dialog: ReactNode = pending ? <div className="fixed inset-0 z-[120] grid place-items-center bg-slate-950/55 p-4" role="presentation">
    <section role="dialog" aria-modal="true" aria-labelledby="export-cost-title" className="w-full max-w-md rounded-2xl bg-white p-6 text-slate-950 shadow-2xl">
      <h2 id="export-cost-title" className="text-xl font-bold">Confirm export cost</h2>
      <p className="mt-2 text-sm text-slate-600">Editing and previewing are free. Credits are reserved before processing and settled only after trusted verification.</p>
      {!quote && !error && <p className="mt-5 text-sm" role="status">Loading current server price…</p>}
      {quote && <><div className="mt-5 space-y-2">{quote.features.map(feature=><div key={feature.key} className="flex justify-between gap-3 text-sm"><span>{feature.name}{feature.estimateOnly ? " · estimate" : ""}</span><strong>{feature.credits} credits</strong></div>)}</div>
        <div className="mt-5 flex items-end justify-between border-t border-slate-200 pt-4"><div><p className="text-xs text-slate-500">Total</p><p className="text-2xl font-bold">{quote.totalCredits} credits</p></div><strong>{formatNairaFromKobo(quote.totalAmountKobo)}</strong></div></>}
      {error && <p className="mt-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-800" role="alert">{error}</p>}
      <div className="mt-6 flex justify-end gap-3"><button type="button" disabled={busy} onClick={close} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold">Cancel</button><button type="button" disabled={!quote||busy} onClick={()=>void confirm()} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy?"Reserving…":"Reserve and export"}</button></div>
    </section>
  </div> : null;
  return { active, request, candidate, cancel, dialog };
}

