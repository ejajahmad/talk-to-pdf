import { readToken, createToken } from "@/lib/doc-token";
import { readPageTexts } from "@/lib/pdf-text";
import { createIndex } from "@/lib/rag";
import { rememberIndex } from "@/lib/doc-cache";
import { friendlyError } from "@/lib/guardrails";
import { isRateLimited, tooManyRequests, getIp } from "@/lib/rate-limit";
import { logEvent, hashIp } from "@/lib/log";

// v7: builds the RAG search index for a PDF.
// The browser sends the PDF again (it still has it) together with its token.
// We answer with an indexToken: a signed vector store id, so the browser can't use other people's indexes.
export async function POST(request) {
  if (isRateLimited(request, "index", 5, 60)) return tooManyRequests(); // 5 indexes per hour

  const form = await request.formData();
  const fileId = readToken(form.get("token"));
  const file = form.get("file");

  if (!fileId) {
    return Response.json({ error: "Invalid document. Please upload the PDF again." }, { status: 401 });
  }
  if (!file) {
    return Response.json({ error: "Missing PDF" }, { status: 400 });
  }

  try {
    // 1. Read the text of every page.
    const pages = await readPageTexts(Buffer.from(await file.arrayBuffer()));
    const totalCharacters = pages.join("").trim().length;
    if (totalCharacters < 20) {
      return Response.json(
        { error: "This PDF has no text (it looks scanned), so RAG can't search it. Use Full PDF mode." },
        { status: 400 },
      );
    }

    // 2. Put the page-stamped text in a vector store.
    const startTime = Date.now();
    const vectorStoreId = await createIndex(pages, file.name);
    rememberIndex(fileId, vectorStoreId);

    await logEvent({
      type: "index",
      file: fileId,
      pages: pages.length,
      seconds: (Date.now() - startTime) / 1000,
      user: hashIp(getIp(request)),
    });
    return Response.json({ indexToken: createToken(vectorStoreId) });
  } catch (error) {
    console.error(error);
    return Response.json({ error: friendlyError(error) }, { status: 500 });
  }
}
