import { randomUUID } from "node:crypto";
import { findModel } from "@/lib/models";
import { readToken } from "@/lib/doc-token";
import { runAgent } from "@/lib/agent";
import { checkMessages, friendlyError } from "@/lib/guardrails";
import { isRateLimited, tooManyRequests, getIp } from "@/lib/rate-limit";
import { logEvent, hashIp } from "@/lib/log";

const MAX_DOCS = 3; // every PDF goes into every question, so more PDFs = more tokens

// The browser sends { tokens, docNames, messages, modelId, mode, indexToken, simple }.
// v8: `tokens` is a list, so you can chat with up to 3 PDFs at once (Full PDF mode only).
// We stream back one JSON object per line ("JSON lines"):
//   {"type":"text","text":"..."}               a piece of the answer
//   {"type":"tool","name","args","output"}     a tool the model called, and its result
//   {"type":"prompt","instructions","input"}   v8: what we sent the model, for the "Show prompt" drawer
//   {"type":"usage","requestId", ...}          tokens, cache, speed and cost, once at the end
//   {"type":"error","message":"..."}           if something goes wrong halfway
export async function POST(request) {
  // v6: guardrails first. Every check here runs BEFORE we spend money on the AI.
  if (isRateLimited(request, "chat", 20, 10)) return tooManyRequests(); // 20 questions per 10 minutes

  const data = await request.json();
  const { messages, modelId, indexToken } = data;
  const model = findModel(modelId);
  const simple = data.simple === true;

  if (!Array.isArray(data.tokens) || data.tokens.length === 0 || data.tokens.length > MAX_DOCS) {
    return Response.json({ error: `Chat with 1 to ${MAX_DOCS} PDFs at a time.` }, { status: 400 });
  }
  const fileIds = data.tokens.map(readToken);
  if (fileIds.includes(null)) {
    return Response.json({ error: "Invalid document. Please upload the PDF again." }, { status: 401 });
  }
  // Names only label the files for the model. Keep them short: they come from the browser.
  const docNames = fileIds.map((id, n) => String(data.docNames?.[n] || "").slice(0, 100));
  // v7: "full" unless the browser asks for "rag". RAG searches one PDF's index, so it needs exactly one PDF.
  const mode = data.mode === "rag" && fileIds.length === 1 ? "rag" : "full";

  // v7: in RAG mode we also need the search index, which comes as its own signed token.
  let vectorStoreId = null;
  if (mode === "rag") {
    vectorStoreId = readToken(indexToken);
    if (!vectorStoreId) {
      return Response.json({ error: "This PDF isn't indexed yet. Click RAG to index it." }, { status: 400 });
    }
  }

  const problem = checkMessages(messages);
  if (problem) {
    return Response.json({ error: problem }, { status: 400 });
  }

  // A unique id for this answer. It links the log line to any 👍/👎 the user gives later.
  const requestId = randomUUID();
  const logInfo = {
    type: "chat",
    requestId,
    user: hashIp(getIp(request)),
    file: fileIds.join(","),
    model: model.id,
    mode,
    simple,
  };

  const encoder = new TextEncoder();
  const abortController = new AbortController();
  let stopped = false;

  const body = new ReadableStream({
    async start(controller) {
      function send(data) {
        controller.enqueue(encoder.encode(JSON.stringify(data) + "\n"));
      }

      try {
        const result = await runAgent({
          model,
          fileIds,
          docNames,
          messages,
          mode,
          vectorStoreId,
          simple,
          signal: abortController.signal,
          onText: (text) => send({ type: "text", text }),
          onTool: (toolCall) => send({ type: "tool", ...toolCall }),
          onPrompt: (prompt) => send({ type: "prompt", ...prompt }),
        });
        send({ type: "usage", requestId, ...result.stats });
        await logEvent({ ...logInfo, ...result.stats, tools: result.toolCalls.map((call) => call.name) });
      } catch (error) {
        if (stopped) {
          await logEvent({ ...logInfo, outcome: "stopped" });
        } else {
          console.error(error);
          send({ type: "error", message: friendlyError(error) });
          await logEvent({ ...logInfo, outcome: "error", error: error.message });
        }
      }
      if (!stopped) controller.close();
    },
    // Called when the browser stops reading (Stop button or closed tab).
    cancel() {
      stopped = true;
      abortController.abort();
    },
  });

  return new Response(body, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8" } });
}
