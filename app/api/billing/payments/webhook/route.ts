import { NextResponse } from "next/server";
import { configuredPaymentProvider } from "@/lib/billing/payment-provider";
import { paymentCollectionEnabled } from "@/lib/billing/server";

export async function POST(request: Request) {
  const provider = configuredPaymentProvider();
  if (!paymentCollectionEnabled() || !provider)
    return NextResponse.json({ error: "Payment collection is not activated" }, { status: 503 });
  // The future adapter must verify the raw signed webhook and then independently
  // confirm its reference with the gateway before an idempotent service-role RPC.
  await provider.verifyWebhook(request);
  return NextResponse.json({ error: "Gateway persistence is not activated" }, { status: 503 });
}

