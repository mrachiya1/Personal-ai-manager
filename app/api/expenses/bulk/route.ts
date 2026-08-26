import { NextResponse } from "next/server";
import { createExpense, notionConnected } from "@/lib/notion";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Saves a reviewed batch of scanned slips to Notion.
 *
 * Rows are written SEQUENTIALLY and reported INDIVIDUALLY. Notion rate-limits
 * at roughly three requests a second, and — more importantly — a partial
 * failure here has to be legible: if slip 4 of 9 has a bad company relation,
 * the person needs to know that slips 1-3 and 5-9 landed and only that one
 * needs another go. An all-or-nothing response would either lose good rows or
 * silently double-write them on retry.
 */
export async function POST(req: Request) {
  if (!(await notionConnected())) {
    return NextResponse.json({ error: "Connect your Notion workspace first." }, { status: 400 });
  }

  let rows: any[];
  try {
    const body = await req.json();
    rows = Array.isArray(body?.expenses) ? body.expenses : [];
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (rows.length === 0) {
    return NextResponse.json({ error: "Nothing to save" }, { status: 400 });
  }
  if (rows.length > 40) {
    return NextResponse.json({ error: "Save at most 40 slips at a time." }, { status: 400 });
  }

  const results: { index: number; ok: boolean; error?: string }[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const name = String(row?.name || "").trim();
    const amount = Number(row?.amount);

    if (!name || !Number.isFinite(amount)) {
      results.push({ index: i, ok: false, error: "Needs a name and a numeric amount" });
      continue;
    }

    try {
      await createExpense({
        name,
        category: row.category || "Other",
        amount,
        currency: row.currency || "LKR",
        vendor: row.vendor || undefined,
        date: row.date || undefined,
        recurring: Boolean(row.recurring),
        companyId: row.companyId || undefined,
        accountId: row.accountId || undefined,
        notes: row.notes || undefined,
      });
      results.push({ index: i, ok: true });
    } catch (err) {
      results.push({ index: i, ok: false, error: err instanceof Error ? err.message : "Save failed" });
    }

    // Stay under Notion's ~3 req/s ceiling on longer batches.
    if (i < rows.length - 1) await new Promise((r) => setTimeout(r, 340));
  }

  const saved = results.filter((r) => r.ok).length;
  return NextResponse.json({ saved, failed: results.length - saved, results });
}
