export const CREDIT_VALUE_KOBO = 1000;
export const TOP_UPS_KOBO = [50_000, 100_000, 200_000, 500_000] as const;

export type PricingFeature = {
  feature_key: string;
  display_name: string;
  fixed_credits: number;
  credits_per_started_minute: number;
  minimum_credits: number;
  provider_key: string | null;
  provider_cost_estimate_kobo: number | null;
  estimate_only: boolean;
  version: number;
};

export type ExportQuote = {
  creditValueKobo: number;
  durationSeconds: number;
  totalCredits: number;
  totalAmountKobo: number;
  features: Array<{
    key: string;
    name: string;
    version: number;
    credits: number;
    estimateOnly: boolean;
    provider: string | null;
    providerCostEstimateKobo: number | null;
  }>;
};

export type WalletSnapshot = {
  availableCredits: number;
  reservedCredits: number;
  nairaPerCredit: number;
  availableNaira: number;
  ledger: Array<Record<string, unknown>>;
  payments: Array<Record<string, unknown>>;
  exports: Array<Record<string, unknown>>;
  pricing: PricingFeature[];
};

export function formatNairaFromKobo(kobo: number) {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(kobo / 100);
}

export function calculateQuote(
  durationSeconds: number,
  features: PricingFeature[],
): ExportQuote {
  if (!Number.isInteger(durationSeconds) || durationSeconds < 1 || durationSeconds > 86_400)
    throw new Error("Export duration must be between 1 second and 24 hours");
  const keys = new Set(features.map((feature) => feature.feature_key));
  if (!keys.has("basic_export") || keys.size !== features.length || features.length === 0)
    throw new Error("A quote requires unique features including basic_export");
  const startedMinutes = Math.ceil(durationSeconds / 60);
  const priced = features.map((feature) => ({
    key: feature.feature_key,
    name: feature.display_name,
    version: feature.version,
    credits: Math.max(
      feature.minimum_credits,
      feature.fixed_credits + feature.credits_per_started_minute * startedMinutes,
    ),
    estimateOnly: feature.estimate_only,
    provider: feature.provider_key,
    providerCostEstimateKobo: feature.provider_cost_estimate_kobo,
  }));
  const totalCredits = priced.reduce((sum, feature) => sum + feature.credits, 0);
  return {
    creditValueKobo: CREDIT_VALUE_KOBO,
    durationSeconds,
    totalCredits,
    totalAmountKobo: totalCredits * CREDIT_VALUE_KOBO,
    features: priced,
  };
}

