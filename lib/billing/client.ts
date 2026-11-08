import type { ExportQuote, WalletSnapshot } from "./model";

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    cache: "no-store",
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const payload = (await response.json().catch(() => ({}))) as { error?: string } & T;
  if (!response.ok) throw new Error(payload.error || `Billing request failed (${response.status})`);
  return payload;
}

export const billingClient = {
  wallet: () => request<WalletSnapshot>("/api/billing/wallet"),
  quote: (durationSeconds: number, featureKeys = ["basic_export"]) =>
    request<ExportQuote>("/api/billing/quote", {
      method: "POST",
      body: JSON.stringify({ durationSeconds, featureKeys }),
    }),
  reserve: (input: {
    clientRequestId: string;
    durationSeconds: number;
    featureKeys?: string[];
    projectId?: string;
  }) => request<{ exportId: string; state: string; reservedCredits: number; amountKobo: number }>(
    "/api/billing/exports/reserve",
    { method: "POST", body: JSON.stringify(input) },
  ),
  candidate: (input: { exportId: string; sha256: string; sizeBytes: number; durationMs: number }) =>
    request<{ exportId: string; state: string; settled: boolean; message: string }>(
      "/api/billing/exports/candidate",
      { method: "POST", body: JSON.stringify(input) },
    ),
  cancel: (exportId: string) => request<{ exportId: string; state: string; message: string }>(
    "/api/billing/exports/cancel",
    { method: "POST", body: JSON.stringify({ exportId }) },
  ),
};

