import { openai, MODEL } from "@/lib/openai";

const SYSTEM_PROMPT = `You are a helpful assistant that answers questions about the PDF the user has shared.
- Base your answers on the document. If the answer isn't in it, say so plainly.
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
