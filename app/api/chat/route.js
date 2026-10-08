import { randomUUID } from "node:crypto";
import { findModel } from "@/lib/models";
import { readToken } from "@/lib/doc-token";
import { runAgent } from "@/lib/agent";
import { checkMessages, friendlyError } from "@/lib/guardrails";
import { isRateLimited, tooManyRequests, getIp } from "@/lib/rate-limit";
import { logEvent, hashIp } from "@/lib/log";

// The browser sends { token, messages, modelId }.
// We stream back one JSON object per line ("JSON lines"):
//   {"type":"text","text":"..."}               a piece of the answer
//   {"type":"tool","name","args","output"}     a tool the model called, and its result
//   {"type":"usage","requestId", ...}          tokens, cache, speed and cost, once at the end
//   {"type":"error","message":"..."}           if something goes wrong halfway
export async function POST(request) {
  // v6: guardrails first. Every check here runs BEFORE we spend money on the AI.
  if (isRateLimited(request, "chat", 20, 10)) return tooManyRequests(); // 20 questions per 10 minutes

  const { token, messages, modelId } = await request.json();
  const model = findModel(modelId);

  const fileId = readToken(token);
  if (!fileId) {
    return Response.json({ error: "Invalid document. Please upload the PDF again." }, { status: 401 });
  }
  const problem = checkMessages(messages);
  if (problem) {
    return Response.json({ error: problem }, { status: 400 });
  }

  // A unique id for this answer. It links the log line to any 👍/👎 the user gives later.
  const requestId = randomUUID();
  const logInfo = { type: "chat", requestId, user: hashIp(getIp(request)), file: fileId, model: model.id };

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
          fileId,
          messages,
          signal: abortController.signal,
          onText: (text) => send({ type: "text", text }),
          onTool: (toolCall) => send({ type: "tool", ...toolCall }),
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
