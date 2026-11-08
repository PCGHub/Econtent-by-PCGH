import { NextResponse } from "next/server";
import { billingAccount, billingBody, billingError, BillingApiError } from "@/lib/billing/api";

export async function POST(request: Request) {
  try {
    const { client } = await billingAccount();
    const body = await billingBody(request);
    if (typeof body.exportId !== "string" || !/^[0-9a-f-]{36}$/i.test(body.exportId))
      throw new BillingApiError(400, "Invalid export id");
    const { data, error } = await client.rpc("request_export_cancellation", { export_id: body.exportId });
    if (error) throw error;
    return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return billingError(error); }
}

