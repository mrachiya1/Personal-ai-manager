// A stand-in Google — the token endpoint and the Calendar v3 events API.
//
// The real thing is unreachable from this sandbox and always has been, which
// is exactly why this exists. Everything about the integration that lives on
// OUR side of the wire can be checked here: that the JWT is assembled and
// signed correctly (this server verifies the signature with the public key
// rather than waving it through), that the bearer token is presented on every
// call, that events carry the tag that makes a re-push idempotent, and that
// deletes precede creates so a crash mid-way never leaves a doubled day.
//
// What it deliberately cannot prove is anything only Google knows: that the
// calendar was really shared with the service account, that the API is
// enabled, quota, the exact error strings. Those stay listed as unproven in
// lib/googleCalendar.ts. A stand-in that pretended otherwise would be worse
// than none.
//
//   node qa/fake-google.mjs 5302 <path-to-public-key.pem>

import http from "http";
import crypto from "crypto";
import fs from "fs";

const port = Number(process.argv[2] || 5302);
const publicKeyPath = process.argv[3];
const publicKey = publicKeyPath ? fs.readFileSync(publicKeyPath, "utf8") : null;

let nextId = 1;
/** id -> event */
const events = new Map();
/** Every request, so a test can assert on order as well as outcome. */
const log = [];

const TOKEN = "fake-google-access-token";

function b64urlToBuf(s) {
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

/** The half of the handshake a stand-in CAN actually check. */
function verifyAssertion(assertion) {
  const parts = String(assertion || "").split(".");
  if (parts.length !== 3) return { ok: false, why: "not three JWT segments" };
  let claims;
  try {
    claims = JSON.parse(b64urlToBuf(parts[1]).toString("utf8"));
  } catch {
    return { ok: false, why: "claims are not JSON" };
  }
  if (!claims.iss) return { ok: false, why: "no iss (service account email)" };
  if (claims.aud !== "https://oauth2.googleapis.com/token") return { ok: false, why: `wrong aud: ${claims.aud}` };
  if (!String(claims.scope || "").includes("auth/calendar")) return { ok: false, why: `wrong scope: ${claims.scope}` };
  const now = Math.floor(Date.now() / 1000);
  if (!(claims.exp > now)) return { ok: false, why: "already expired" };
  if (claims.exp - claims.iat > 3600) return { ok: false, why: "lifetime over one hour" };

  if (publicKey) {
    const ok = crypto
      .createVerify("RSA-SHA256")
      .update(`${parts[0]}.${parts[1]}`)
      .verify(publicKey, b64urlToBuf(parts[2]));
    if (!ok) return { ok: false, why: "signature does not verify" };
  }
  return { ok: true, claims };
}

function send(res, status, body) {
  const text = JSON.stringify(body);
  res.writeHead(status, { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(text) });
  res.end(text);
}

function readBody(req) {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => resolve(data));
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${port}`);
  const body = await readBody(req);
  log.push({ method: req.method, path: url.pathname, at: Date.now() });

  /* ---------- the token exchange ---------- */
  if (url.pathname === "/token" && req.method === "POST") {
    const form = new URLSearchParams(body);
    if (form.get("grant_type") !== "urn:ietf:params:oauth:grant-type:jwt-bearer") {
      return send(res, 400, { error: "unsupported_grant_type" });
    }
    const check = verifyAssertion(form.get("assertion"));
    if (!check.ok) return send(res, 400, { error: "invalid_grant", error_description: check.why });
    return send(res, 200, { access_token: TOKEN, expires_in: 3600, token_type: "Bearer" });
  }

  /* ---------- everything else needs the bearer token ---------- */
  const auth = req.headers.authorization || "";
  if (!auth.startsWith("Bearer ")) {
    return send(res, 401, { error: { message: "Login Required" } });
  }
  if (auth.slice(7) !== TOKEN) {
    return send(res, 401, { error: { message: "Invalid Credentials" } });
  }

  /* ---------- /calendars/{id}/events ---------- */
  const m = /^\/calendars\/([^/]+)\/events(?:\/(.+))?$/.exec(url.pathname);
  if (!m) return send(res, 404, { error: { message: `no such path ${url.pathname}` } });
  const eventId = m[2] ? decodeURIComponent(m[2]) : null;

  if (req.method === "GET" && !eventId) {
    const timeMin = url.searchParams.get("timeMin");
    const timeMax = url.searchParams.get("timeMax");
    const items = [...events.values()]
      .filter((e) => {
        if (!timeMin || !timeMax) return true;
        const s = e.start.dateTime || `${e.start.date}T00:00:00Z`;
        return s >= timeMin && s < timeMax;
      })
      .sort((a, b) => (a.start.dateTime || a.start.date).localeCompare(b.start.dateTime || b.start.date));
    return send(res, 200, { items });
  }

  if (req.method === "POST" && !eventId) {
    let payload;
    try {
      payload = JSON.parse(body);
    } catch {
      return send(res, 400, { error: { message: "body is not JSON" } });
    }
    if (!payload.summary) return send(res, 400, { error: { message: "Missing summary" } });
    if (!payload.start || !payload.end) return send(res, 400, { error: { message: "Missing start or end" } });
    const s = payload.start.dateTime || payload.start.date;
    const e = payload.end.dateTime || payload.end.date;
    if (!(e > s)) return send(res, 400, { error: { message: `The end must be after the start (${s} -> ${e})` } });

    const id = `ev${nextId++}`;
    const event = { id, htmlLink: `https://calendar.google.com/event?eid=${id}`, ...payload };
    events.set(id, event);
    return send(res, 200, event);
  }

  if (req.method === "DELETE" && eventId) {
    if (!events.has(eventId)) return send(res, 410, { error: { message: "Resource has been deleted" } });
    events.delete(eventId);
    res.writeHead(204);
    return res.end();
  }

  return send(res, 405, { error: { message: `${req.method} not supported here` } });
});

/* A side door for the tests: what is on the calendar, and in what order it
   was asked for. Not part of the Google API — deliberately on a path Google
   does not use, so nothing in the app could reach it by accident. */
server.on("request", () => {});
const realHandler = server.listeners("request")[0];
server.removeAllListeners("request");
server.on("request", (req, res) => {
  const url = new URL(req.url, `http://localhost:${port}`);
  if (url.pathname === "/__state") {
    const text = JSON.stringify({ events: [...events.values()], log });
    res.writeHead(200, { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(text) });
    return res.end(text);
  }
  if (url.pathname === "/__seed" && req.method === "POST") {
    let data = "";
    req.on("data", (c) => (data += c));
    return req.on("end", () => {
      const seeded = JSON.parse(data || "[]");
      for (const e of seeded) {
        const id = `seed${nextId++}`;
        events.set(id, { id, htmlLink: `https://calendar.google.com/event?eid=${id}`, ...e });
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, count: events.size }));
    });
  }
  if (url.pathname === "/__reset" && req.method === "POST") {
    events.clear();
    log.length = 0;
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ ok: true }));
  }
  return realHandler(req, res);
});

server.listen(port, () => console.log(`stand-in Google on :${port}${publicKey ? " (verifying signatures)" : ""}`));
