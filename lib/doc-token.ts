import { createHmac, timingSafeEqual } from "node:crypto";

// Files uploaded to the OpenAI Files API are visible to your whole project,
// so the browser must never be able to pick an arbitrary file_id.
// We hand the browser a signed token instead: file_id + filename + HMAC.
// The chat route only accepts tokens it signed itself.

const secret = () => {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 16) throw new Error("Set SESSION_SECRET (16+ chars) in .env.local");
  return s;
};

const sign = (payload: string) =>
  createHmac("sha256", secret()).update(payload).digest("base64url");

export function createDocToken(fileId: string, filename: string): string {
  const payload = Buffer.from(JSON.stringify({ fileId, filename })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function readDocToken(token: string): { fileId: string; filename: string } | null {
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const expected = Buffer.from(sign(payload));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    return JSON.parse(Buffer.from(payload, "base64url").toString());
  } catch {
    return null;
  }
}
