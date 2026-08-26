import { NextResponse } from "next/server";
import { getAccounts, getCompanies, getProjects, notionConnected } from "@/lib/notion";
import { resolveOpenRouter, openRouterHeaders } from "@/lib/ai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Reads a photographed receipt, bill, bank slip or transfer confirmation and
// pulls structured fields out of it.
//
// Two deliberate limits:
//   * It writes NOTHING to Notion. Extraction fills in a form the person
//     confirms. A model misreading "1,850" as "1850.00" should cost a glance,
//     not a corrupted ledger.
//   * Matching to an existing company/account/project happens HERE, in code,
//     against the real record list — not in the prompt. The model suggests a
//     name; exact-and-then-fuzzy matching decides which record that is, so a
//     hallucinated company can never invent a relation.

const CATEGORIES = ["Subscription", "Software", "Fuel", "Salary", "Rent", "Donation", "Other"];

const EXTRACTION_PROMPT = `You are reading a photograph or scan of a payment document: a shop receipt,
a utility bill, a bank deposit/transfer slip, an invoice, or a card terminal printout.

Extract what is ACTUALLY VISIBLE. Omit any key you cannot read — never guess.

Return ONLY this JSON object, no code fence and no commentary:
{
  "vendor": "merchant, biller or payee name as printed",
  "amount": 1234.56,
  "currency": "LKR | USD | EUR | GBP | INR | AUD — the currency actually shown",
  "date": "YYYY-MM-DD",
  "category": "one of: Subscription, Software, Fuel, Salary, Rent, Donation, Other",
  "paymentMethod": "Cash | Card | Bank Transfer | Cheque | Online | Other",
  "referenceNumber": "receipt/invoice/transaction/slip reference as printed",
  "taxAmount": 0,
  "subtotal": 0,
  "accountHint": "bank or card name/last-4 if the slip shows which account paid",
  "lineItems": [{"description": "…", "quantity": 1, "amount": 0}],
  "documentType": "receipt | bill | bank-slip | invoice | other",
  "confidence": "high | medium | low",
  "notes": "anything important that doesn't fit above, e.g. 'handwritten total, partly obscured'"
}

Rules for amount: the TOTAL actually paid, as a plain number — no currency symbol,
no thousands separators. If the slip shows a subtotal, tax and total, "amount" is
the total. If the image is too blurry to read the total with confidence, still give
your best reading but set "confidence" to "low".`;

/** Loose name match against real records, so the model can suggest but not invent. */
function matchByName<T extends { id: string; name: string }>(rows: T[], hint?: string): T | undefined {
  if (!hint) return undefined;
  const needle = hint.trim().toLowerCase();
  if (!needle) return undefined;
  const exact = rows.find((r) => r.name.toLowerCase() === needle);
  if (exact) return exact;
  return rows.find(
    (r) => r.name.toLowerCase().includes(needle) || needle.includes(r.name.toLowerCase())
  );
}

export async function POST(req: Request) {
  const ai = await resolveOpenRouter("vision");
  if (!ai.apiKey) {
    return NextResponse.json(
      { error: "No OpenRouter key set — add one on the Settings page to enable slip scanning." },
      { status: 400 }
    );
  }

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
  }
  if (file.size > 8 * 1024 * 1024) {
    return NextResponse.json({ error: "That image is over 8MB — take a smaller photo or compress it." }, { status: 400 });
  }

  const base64 = Buffer.from(await file.arrayBuffer()).toString("base64");
  const mime = file.type || "image/jpeg";

  let extracted: Record<string, any>;
  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: openRouterHeaders(ai.apiKey, "Orex OS Slip Scan"),
      body: JSON.stringify({
        model: ai.model,
        max_tokens: 1200,
        temperature: 0,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: EXTRACTION_PROMPT },
              { type: "image_url", image_url: { url: `data:${mime};base64,${base64}` } },
            ],
          },
        ],
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      return NextResponse.json(
        { error: data?.error?.message || `OpenRouter request failed (${res.status})` },
        { status: 502 }
      );
    }

    const raw: string = data?.choices?.[0]?.message?.content ?? "";
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) {
      return NextResponse.json({ error: "Couldn't read a result from that image.", raw: raw.slice(0, 300) }, { status: 502 });
    }
    extracted = JSON.parse(match[0]);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Slip scan failed" },
      { status: 502 }
    );
  }

  // Normalise the loose bits the model gets wrong most often.
  if (typeof extracted.amount === "string") {
    const n = Number(String(extracted.amount).replace(/[^0-9.\-]/g, ""));
    extracted.amount = Number.isFinite(n) ? n : undefined;
  }
  if (extracted.category && !CATEGORIES.includes(extracted.category)) extracted.category = "Other";
  if (extracted.date && !/^\d{4}-\d{2}-\d{2}$/.test(String(extracted.date))) delete extracted.date;

  // Resolve suggestions against records that actually exist.
  const matched: { companyId?: string; companyName?: string; accountId?: string; accountName?: string; projectId?: string; projectName?: string } = {};
  if (await notionConnected()) {
    try {
      const [companies, accounts, projects] = await Promise.all([getCompanies(), getAccounts(), getProjects()]);
      const vendorHint = String(extracted.vendor || "");
      const company = matchByName(companies, vendorHint);
      if (company) {
        matched.companyId = company.id;
        matched.companyName = company.name;
      }
      const account = matchByName(accounts, String(extracted.accountHint || ""));
      if (account) {
        matched.accountId = account.id;
        matched.accountName = account.name;
      }
      const project = matchByName(projects, vendorHint);
      if (project) {
        matched.projectId = project.id;
        matched.projectName = project.name;
      }
    } catch {
      // Matching is a convenience. A Notion hiccup must not fail the scan.
    }
  }

  return NextResponse.json({ extracted, matched });
}
