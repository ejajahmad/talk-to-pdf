import type OpenAI from "openai";
import { openai, MODEL } from "@/lib/openai";
import { readDocToken } from "@/lib/doc-token";

export const runtime = "nodejs";

type ChatTurn = { role: "user" | "assistant"; content: string };

const SYSTEM_PROMPT = `You are a helpful assistant that answers questions about the PDF the user has shared.
- Base your answers on the document. If the answer isn't in it, say so plainly.
- Be concise. Use short paragraphs or bullet points when it helps.
- When you quote or rely on a specific part of the document, cite the page inline, e.g. "(p. 4)".`;

export async function POST(req: Request) {
  const { token, messages } = (await req.json()) as { token: string; messages: ChatTurn[] };

  const doc = readDocToken(token ?? "");
  if (!doc) return Response.json({ error: "Invalid document token" }, { status: 401 });
  if (!Array.isArray(messages) || messages.length === 0) {
    return Response.json({ error: "No messages" }, { status: 400 });
  }

  // Build the conversation. The PDF goes in the FIRST user turn, before the text.
  // Keeping that prefix identical on every request lets OpenAI's automatic prompt
  // caching reuse the processed document on follow-up questions.
  const input: OpenAI.Responses.ResponseInputItem[] = messages.map((m, i) =>
    i === 0
      ? {
          role: "user",
          content: [
            { type: "input_file", file_id: doc.fileId },
            { type: "input_text", text: m.content },
          ],
        }
      : { role: m.role, content: m.content }
  );

  const stream = openai.responses.stream({
    model: MODEL,
    instructions: SYSTEM_PROMPT,
    input,
    max_output_tokens: 4096,
  });

  // Stream newline-delimited JSON to the browser:
  //   {"type":"text","text":"..."}   — answer text as it's generated
  //   {"type":"error","message":"..."}
  const encoder = new TextEncoder();
  const body = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) => controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
      try {
        for await (const event of stream) {
          if (event.type === "response.output_text.delta") {
            send({ type: "text", text: event.delta });
          }
        }
        const final = await stream.finalResponse();
        // Handy while developing: input_tokens_details.cached_tokens should be large on follow-ups.
        console.log("usage", final.usage);
      } catch (err) {
        console.error(err);
        send({ type: "error", message: err instanceof Error ? err.message : "Something went wrong" });
      } finally {
        controller.close();
      }
    },
    cancel() {
      stream.abort();
    },
  });

  return new Response(body, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" },
  });
}
