import "server-only";
import { createClient } from "@supabase/supabase-js";
import { supabaseConfig } from "@/lib/supabase/config";
import type { Database } from "@/lib/supabase/database.types";

export function billingAdmin() {
  const config = supabaseConfig();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!config || !key || (!key.startsWith("ey") && !key.startsWith("sb_secret_"))) return null;
  return createClient<Database>(config.url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function paymentCollectionEnabled() {
  return process.env.ECONTENT_PAYMENT_COLLECTION_ENABLED === "flutterwave-test" && process.env.FLUTTERWAVE_MODE === "test";
}

export function exportBillingEnabled() {
  return process.env.ECONTENT_EXPORT_BILLING_ENABLED === "approved-live";
}

