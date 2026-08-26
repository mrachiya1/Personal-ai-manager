import { NextResponse } from "next/server";
import { getPayments, getProjects, markPaymentPaid } from "@/lib/notion";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const [payments, projects] = await Promise.all([getPayments(), getProjects()]);
    const payment = payments.find((p) => p.id === id);
    if (!payment) return NextResponse.json({ error: "Payment not found" }, { status: 404 });
    const companyId = payment.projectId ? projects.find((p) => p.id === payment.projectId)?.companyId : undefined;
    await markPaymentPaid(id, { label: payment.label, amount: payment.amount, companyId });
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Failed to mark paid" }, { status: 502 });
  }
}
