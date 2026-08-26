import { NextResponse } from "next/server";
import { createIncome, updatePayment } from "@/lib/notion";

export async function POST(req: Request) {
  const body = await req.json();
  if (!body?.name || body?.amount === undefined || !body?.source) {
    return NextResponse.json({ error: "name, source and amount are required" }, { status: 400 });
  }
  try {
    await createIncome(body);
    // The Income <-> Payment relation itself syncs both ways automatically
    // (it's a Notion dual relation) — but Status/Paid Date on the Payment
    // side need an explicit update so it moves out of Overdue/Pending.
    if (body.linkedPaymentId) {
      await updatePayment(body.linkedPaymentId, {
        status: "Paid",
        paidDate: body.date || new Date().toISOString().slice(0, 10),
      });
    }
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Failed to log income" }, { status: 502 });
  }
}
