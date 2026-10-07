import { openai, MODEL } from "@/lib/openai";

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

// v2: a chat. The browser sends the WHOLE conversation every time:
//   messages = [{ role: "user", content: "..." }, { role: "assistant", content: "..." }, ...]
// and we stream the answer back as plain text, a few words at a time.
export async function POST(request) {
  const { fileId, messages } = await request.json();

  if (!fileId || !messages || messages.length === 0) {
    return Response.json({ error: "Missing PDF or messages" }, { status: 400 });
  }

  // The model has no memory, so we rebuild the conversation for it every time.
  // The PDF goes into the FIRST user message, right before the first question.
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

  // stream: true means OpenAI sends the answer in small pieces as it writes it.
  let stream;
  try {
    stream = await openai.responses.create({
      model: MODEL,
      instructions: SYSTEM_PROMPT,
      input,
      stream: true,
    });
  } catch (error) {
    console.error(error);
    return Response.json({ error: "The AI request failed" }, { status: 500 });
  }

  // Pass each piece of text on to the browser as soon as it arrives.
  const encoder = new TextEncoder();
  const body = new ReadableStream({
    async start(controller) {
      try {
        for await (const event of stream) {
          if (event.type === "response.output_text.delta") {
            controller.enqueue(encoder.encode(event.delta));
          }
        }
      } catch (error) {
        console.error(error);
      }
      try {
        controller.close();
      } catch {
        // Already closed, because the browser went away.
      }
    },
    // Called when the browser stops reading (Stop button or closed tab).
    // Stop the OpenAI request too, so we stop paying for words nobody reads.
    cancel() {
      stream.controller.abort();
    },
  });

  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
