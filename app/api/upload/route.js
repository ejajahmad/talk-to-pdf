import { toFile } from "openai";
import { openai } from "@/lib/openai";
import { createToken } from "@/lib/doc-token";
import { isRateLimited, tooManyRequests, getIp } from "@/lib/rate-limit";
import { logEvent, hashIp } from "@/lib/log";
import { fingerprint, findPdf, rememberPdf, countPdfTokens } from "@/lib/doc-cache";

const MAX_SIZE = 32 * 1024 * 1024; // OpenAI accepts PDFs up to 32 MB

export async function POST(request) {
  if (isRateLimited(request, "upload", 10, 60)) return tooManyRequests(); // 10 uploads per hour

  const form = await request.formData();
  const file = form.get("file");

  if (!file || file.type !== "application/pdf") {
    return Response.json({ error: "Please choose a PDF file" }, { status: 400 });
  }
  if (file.size > MAX_SIZE) {
    return Response.json({ error: "The PDF must be smaller than 32 MB" }, { status: 400 });
  }

  // v6: don't trust the browser's file.type. A real PDF file always starts with "%PDF-".
  const bytes = Buffer.from(await file.arrayBuffer());
  if (bytes.subarray(0, 5).toString() !== "%PDF-") {
    return Response.json({ error: "That file isn't a real PDF" }, { status: 400 });
  }

  // v7: seen this exact PDF before? Reuse its fileId (and search index), so the prompt cache still works.
  const hash = fingerprint(bytes);
  const known = findPdf(hash);
  if (known) {
    await logEvent({ type: "upload", file: known.fileId, reused: true, user: hashIp(getIp(request)) });
    return Response.json({
      token: createToken(known.fileId),
      indexToken: known.vectorStoreId ? createToken(known.vectorStoreId) : null,
      filename: file.name,
      tokens: known.tokens,
    });
  }

  try {
    const uploaded = await openai.files.create({
      file: await toFile(bytes, file.name, { type: "application/pdf" }),
      purpose: "user_data",
      // OpenAI deletes the file automatically after 24 hours.
      expires_after: { anchor: "created_at", seconds: 24 * 60 * 60 },
    });

    // v7: measure the problem up front. How many tokens will this PDF add to every question?
    const tokens = await countPdfTokens(uploaded.id);
    rememberPdf(hash, uploaded.id, tokens);

    await logEvent({ type: "upload", file: uploaded.id, bytes: file.size, tokens, user: hashIp(getIp(request)) });

    // The browser gets a signed token, never the raw fileId.
    return Response.json({ token: createToken(uploaded.id), indexToken: null, filename: file.name, tokens });
  } catch (error) {
    console.error(error);
    return Response.json({ error: "Uploading to OpenAI failed" }, { status: 500 });
  }
}
