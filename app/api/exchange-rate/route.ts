import { NextResponse } from "next/server";
import { getUsdToLkrRate } from "@/lib/exchangeRate";

export async function GET() {
  try {
    const rate = await getUsdToLkrRate();
    return NextResponse.json({ usdToLkr: rate });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Failed to fetch exchange rate" }, { status: 502 });
  }
}
