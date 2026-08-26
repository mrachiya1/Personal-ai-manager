// Encryption for the handful of secrets this app stores on a user's behalf —
// principally their Notion integration token, which grants read/write access
// to their entire workspace and therefore must never sit in the database as
// plain text.
//
// AES-256-GCM, with the key derived from AUTH_SECRET (the same secret Auth.js
// signs sessions with, so there is only one secret to manage). Ciphertext is
// stored as  v1.<iv>.<authTag>.<data>  — all base64url — so the format can be
// versioned later without a migration guessing game.

import crypto from "crypto";

const PREFIX = "v1";

function keyMaterial(): Buffer | null {
  const secret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
  if (!secret) return null;
  // A KDF rather than raw bytes, so AUTH_SECRET can be any length/charset.
  return crypto.createHash("sha256").update(`orex-secretbox:${secret}`).digest();
}

/** True when secrets can actually be encrypted. Surfaced on Settings as a warning. */
export function encryptionAvailable(): boolean {
  return keyMaterial() !== null;
}

export function encryptSecret(plain: string): string {
  const key = keyMaterial();
  if (!key) {
    // Local development with no AUTH_SECRET set. Storing plaintext is the
    // honest behaviour here — it is clearly marked, and the alternative
    // (silently dropping the value) would be worse.
    return `plain.${Buffer.from(plain, "utf8").toString("base64url")}`;
  }
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [PREFIX, iv.toString("base64url"), tag.toString("base64url"), data.toString("base64url")].join(".");
}

export function decryptSecret(stored: string | undefined | null): string | undefined {
  if (!stored) return undefined;

  if (stored.startsWith("plain.")) {
    try {
      return Buffer.from(stored.slice(6), "base64url").toString("utf8");
    } catch {
      return undefined;
    }
  }

  const parts = stored.split(".");
  if (parts.length !== 4 || parts[0] !== PREFIX) {
    // Not something this module wrote — most likely a value pasted straight
    // into the database by hand. Return it as-is rather than losing it.
    return stored;
  }

  const key = keyMaterial();
  if (!key) return undefined;

  try {
    const [, ivB64, tagB64, dataB64] = parts;
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(ivB64, "base64url"));
    decipher.setAuthTag(Buffer.from(tagB64, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(dataB64, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    // Wrong key (AUTH_SECRET was rotated) or tampered ciphertext. Treating
    // this as "not connected" is correct — the user reconnects Notion.
    return undefined;
  }
}

/** Shows the shape of a secret without revealing it: "ntn_••••••4f2a". */
export function maskSecret(value: string | undefined): string {
  if (!value) return "";
  if (value.length <= 8) return "••••••••";
  return `${value.slice(0, 4)}${"•".repeat(6)}${value.slice(-4)}`;
}
