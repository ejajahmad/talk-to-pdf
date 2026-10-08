import { createHash } from "node:crypto";
import { openai } from "./openai.js";
import { MODELS } from "./models.js";

// UPLOAD DEDUP
// Uploading the same PDF twice used to create a NEW fileId. A new fileId means a prompt-cache miss,
// so the whole PDF gets processed and billed at full price again.
// Now we remember every PDF by a fingerprint of its bytes (a SHA-256 hash), and reuse its fileId.
//
// This lives in the server's memory. We keep the Map on `globalThis` so every API route shares the
// same one. In production, keep this in your database (and per user, if users shouldn't share files).
if (!globalThis.knownPdfs) globalThis.knownPdfs = new Map(); // hash -> { fileId, tokens, vectorStoreId, uploadedAt }
const knownPdfs = globalThis.knownPdfs;

const MAX_AGE = 23 * 60 * 60 * 1000; // files expire after 24 hours, so stop reusing them a bit before

export function fingerprint(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

export function findPdf(hash) {
  const known = knownPdfs.get(hash);
  if (known && Date.now() - known.uploadedAt < MAX_AGE) return known;
  return null;
}

export function rememberPdf(hash, fileId, tokens) {
  knownPdfs.set(hash, { fileId, tokens, vectorStoreId: null, uploadedAt: Date.now() });
}

// Remember the search index too, so a re-upload doesn't have to index the PDF again.
export function rememberIndex(fileId, vectorStoreId) {
  for (const known of knownPdfs.values()) {
    if (known.fileId === fileId) known.vectorStoreId = vectorStoreId;
  }
}

// How many input tokens will this PDF add to EVERY question (in Full PDF mode)?
// OpenAI's token-counting endpoint tells us without generating an answer.
export async function countPdfTokens(fileId) {
  try {
    const result = await openai.responses.inputTokens.count({
      model: MODELS[0].id,
      input: [{ role: "user", content: [{ type: "input_file", file_id: fileId }] }],
    });
    return result.input_tokens;
  } catch (error) {
    console.error("Counting tokens failed:", error.message);
    return null;
  }
}
