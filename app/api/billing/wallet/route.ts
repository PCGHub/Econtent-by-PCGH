import { NextResponse } from "next/server";
import { billingAccount, billingError } from "@/lib/billing/api";

export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const { client } = await billingAccount();
    const { data, error } = await client.rpc("credit_wallet_snapshot");
    if (error) throw error;
    return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return billingError(error); }
}

