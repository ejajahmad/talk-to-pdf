import { openai } from "@/lib/openai";
import { findModel, calculateCost } from "@/lib/models";

// v3: a stricter prompt. Answer only from the PDF, and cite a page for every claim,
// so the user can click the citation and check it.
const SYSTEM_PROMPT = `You are a helpful assistant that answers questions about the PDF the user has shared.

Grounding
- Answer ONLY from the document. Do not use outside knowledge to fill gaps.
- If the document doesn't contain the answer, say "I couldn't find that in the document".
- Never guess numbers, names or dates. Copy them exactly as written.

Citations
- After every fact, cite the page it came from in exactly this format: (p. 4)
- For facts from several pages, cite each page separately: (p. 2) (p. 7)
- Page numbers mean the page's position in the PDF file, starting at 1. Ignore page numbers
  printed on the page itself, such as "Page 12" or "iv".

Style
- Be concise. Use short paragraphs or bullet points when it helps.`;

// The browser sends the WHOLE conversation every time:
//   messages = [{ role: "user", content: "..." }, { role: "assistant", content: "..." }, ...]
// v4: we stream back one JSON object per line ("JSON lines"):
//   {"type":"text","text":"..."}     a piece of the answer
//   {"type":"usage", ...}            tokens, cache, speed and cost, once at the end
//   {"type":"error","message":"..."} if something goes wrong halfway
export async function POST(request) {
  const { fileId, messages, modelId } = await request.json();
  const model = findModel(modelId); // only models from our list

  if (!fileId || !messages || messages.length === 0) {
    return Response.json({ error: "Missing PDF or messages" }, { status: 400 });
  }

  // The model has no memory, so we rebuild the conversation for it every time.
  // The PDF goes into the FIRST user message, right before the first question.
  // That keeps the start of every request identical (instructions + PDF), which is
  // exactly what prompt caching needs: follow-up questions reuse the already-read PDF.
  const input = [];
  for (let i = 0; i < messages.length; i++) {
    const message = messages[i];
    if (i === 0) {
      input.push({
        role: "user",
        content: [
          { type: "input_file", file_id: fileId },
          { type: "input_text", text: message.content },
        ],
      });
    } else {
      input.push({ role: message.role, content: message.content });
    }
  }

  const startTime = Date.now();
  let stream;
  try {
    stream = await openai.responses.create({
      model: model.id,
      instructions: SYSTEM_PROMPT,
      input,
      stream: true,
      // Questions about the same PDF share a cache key, so they land on the same cache.
      prompt_cache_key: fileId,
    });
  } catch (error) {
    console.error(error);
    return Response.json({ error: "The AI request failed" }, { status: 500 });
  }

  const encoder = new TextEncoder();
  let stopped = false;
  const body = new ReadableStream({
    async start(controller) {
      // Send one JSON object as one line.
      function send(data) {
        controller.enqueue(encoder.encode(JSON.stringify(data) + "\n"));
      }

      let firstWordTime = null;
      try {
        for await (const event of stream) {
          if (event.type === "response.output_text.delta") {
            if (firstWordTime === null) firstWordTime = Date.now();
            send({ type: "text", text: event.delta });
          }

          // The last event has the token counts for the whole answer.
          if (event.type === "response.completed") {
            const usage = event.response.usage;
            const stats = {
              model: model.id,
              inputTokens: usage.input_tokens,
              cachedTokens: usage.input_tokens_details.cached_tokens,
              outputTokens: usage.output_tokens,
              reasoningTokens: usage.output_tokens_details.reasoning_tokens,
              secondsToFirstWord: firstWordTime ? (firstWordTime - startTime) / 1000 : null,
              totalSeconds: (Date.now() - startTime) / 1000,
              cost: calculateCost(model, usage),
            };
            console.log("usage", stats);
            send({ type: "usage", ...stats });
          }
        }
      } catch (error) {
        if (!stopped) {
          console.error(error);
          send({ type: "error", message: "The AI request failed. Please try again." });
        }
      }
      if (!stopped) controller.close();
    },
    // Called when the browser stops reading (Stop button or closed tab).
    // Stop the OpenAI request too, so we stop paying for words nobody reads.
    cancel() {
      stopped = true;
      stream.controller.abort();
    },
  });

  return new Response(body, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8" } });
}
