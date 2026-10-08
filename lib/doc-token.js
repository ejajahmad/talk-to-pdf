import { createHmac } from "node:crypto";

// Every file you upload to OpenAI can be read by anyone who has your API key, and our server
// has the key. So if the browser could send ANY fileId, a user could read other people's PDFs.
//
// Instead, we give the browser a SIGNED token: "file-abc123.<signature>".
// Only our server knows SESSION_SECRET, so only our server can make a valid signature.
// When a token comes back, we check the signature before we trust the fileId inside it.

function signature(value) {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error("Set SESSION_SECRET (16+ characters) in .env.local");
  }
  return createHmac("sha256", secret).update(value).digest("hex");
}

// "file-abc123" -> "file-abc123.9f86d08..."
export function createToken(value) {
  return value + "." + signature(value);
}

// "file-abc123.9f86d08..." -> "file-abc123", or null if the signature is wrong.
export function readToken(token) {
  const [value, givenSignature] = String(token).split(".");
  if (!value || !givenSignature) return null;
  // (A production app would compare with crypto.timingSafeEqual, which takes the same time
  // whether the strings match or not.)
  if (givenSignature !== signature(value)) return null;
  return value;
}
