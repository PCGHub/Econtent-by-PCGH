import { billingAccount, billingBody, billingError, BillingApiError } from "@/lib/billing/api";
import { configuredPaymentProvider } from "@/lib/billing/payment-provider";
import { paymentCollectionEnabled } from "@/lib/billing/server";
import { TOP_UPS_KOBO } from "@/lib/billing/model";

export async function POST(request: Request) {
  try {
    await billingAccount();
    await billingBody(request);
    if (!paymentCollectionEnabled() || !configuredPaymentProvider())
      throw new BillingApiError(503, "Credit purchases are prepared but not activated");
    // A reviewed gateway adapter will create a pending payment server-side here.
    // No browser callback may credit the wallet.
    void TOP_UPS_KOBO;
    throw new BillingApiError(503, "Payment provider is not configured");
  } catch (error) { return billingError(error); }
}

