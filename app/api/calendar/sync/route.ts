import { NextResponse } from "next/server";
import { createCalendarEvent, isGoogleCalendarConnected } from "@/lib/googleCalendar";

export async function POST(req: Request) {
  if (!isGoogleCalendarConnected()) {
    return NextResponse.json(
      {
        error:
          "Google Calendar isn't set up yet — add your service account details on the Settings page (or GOOGLE_SERVICE_ACCOUNT_EMAIL / GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY / GOOGLE_CALENDAR_ID in .env.local).",
      },
      { status: 400 }
    );
  }
  const body = await req.json();
  if (!body?.summary || !body?.date) {
    return NextResponse.json({ error: "summary and date are required" }, { status: 400 });
  }
  const result = await createCalendarEvent(body);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 502 });
  return NextResponse.json({ ok: true, htmlLink: result.htmlLink });
}
