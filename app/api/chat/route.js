import { openai } from "@/lib/openai";
import { findModel, calculateCost } from "@/lib/models";
import { TOOLS, runTool } from "@/lib/tools";

// The system prompt: answer only from the PDF, cite a page for every claim, and use the tools.
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

Tools
- For any arithmetic (totals, differences, percentages, growth), call the calculate tool. Never do math in your head.
- When the user asks to see, show or open something, call go_to_page with the page, then answer briefly.

Style
- Be concise. Use short paragraphs or bullet points when it helps.`;

const MAX_STEPS = 5; // safety net: the tool loop can never run forever

// The browser sends the WHOLE conversation every time:
//   messages = [{ role: "user", content: "..." }, { role: "assistant", content: "..." }, ...]
// We stream back one JSON object per line ("JSON lines"):
//   {"type":"text","text":"..."}               a piece of the answer
//   {"type":"tool","name","args","output"}     v5: a tool the model called, and its result
//   {"type":"usage", ...}                      tokens, cache, speed and cost, once at the end
//   {"type":"error","message":"..."}           if something goes wrong halfway
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

  const encoder = new TextEncoder();
  const abortController = new AbortController(); // lets the Stop button cancel the OpenAI requests
  let stopped = false;

  const body = new ReadableStream({
    async start(controller) {
      // Send one JSON object as one line.
      function send(data) {
        controller.enqueue(encoder.encode(JSON.stringify(data) + "\n"));
      }

      const startTime = Date.now();
      let firstWordTime = null;
      const totals = { inputTokens: 0, cachedTokens: 0, outputTokens: 0, reasoningTokens: 0, cost: 0 };

      try {
        // THE AGENT LOOP
        // 1. Call the model.
        // 2. If it asks for tools, run them, add the results to the input, and go back to 1.
        // 3. If it just answers with text, we're done.
        for (let step = 1; step <= MAX_STEPS; step++) {
          const stream = await openai.responses.create(
            {
              model: model.id,
              instructions: SYSTEM_PROMPT,
              input,
              tools: TOOLS,
              // On the last step, tools are switched off, so the model has to answer.
              tool_choice: step === MAX_STEPS ? "none" : "auto",
              stream: true,
              prompt_cache_key: fileId,
            },
            { signal: abortController.signal },
          );

          let response = null; // the complete response, from the last event
          let stepText = "";
          for await (const event of stream) {
            if (event.type === "response.output_text.delta") {
              if (firstWordTime === null) firstWordTime = Date.now();
              stepText += event.delta;
              send({ type: "text", text: event.delta });
            }
            if (event.type === "response.completed") {
              response = event.response;
            }
          }

          // Add this step's tokens and cost to the totals.
          const usage = response.usage;
          totals.inputTokens += usage.input_tokens;
          totals.cachedTokens += usage.input_tokens_details.cached_tokens;
          totals.outputTokens += usage.output_tokens;
          totals.reasoningTokens += usage.output_tokens_details.reasoning_tokens;
          const stepCost = calculateCost(model, usage);
          totals.cost = stepCost === null ? null : totals.cost + stepCost;

          // Did the model ask for any tools?
          const toolCalls = response.output.filter((item) => item.type === "function_call");
          if (toolCalls.length === 0) break; // no: that was the final answer

          // Text before a tool call ("Let me calculate that.") gets its own paragraph.
          if (stepText !== "") send({ type: "text", text: "\n\n" });

          // Give the model back everything it just produced (including the tool calls)...
          input.push(...response.output);
          // ...plus one result for each tool call, matched by call_id.
          for (const call of toolCalls) {
            const args = JSON.parse(call.arguments);
            const output = runTool(call.name, args);
            send({ type: "tool", name: call.name, args, output });
            input.push({ type: "function_call_output", call_id: call.call_id, output });
          }
        }

        const stats = {
          model: model.id,
          ...totals,
          secondsToFirstWord: firstWordTime ? (firstWordTime - startTime) / 1000 : null,
          totalSeconds: (Date.now() - startTime) / 1000,
        };
        console.log("usage", stats);
        send({ type: "usage", ...stats });
      } catch (error) {
        if (!stopped) {
          console.error(error);
          send({ type: "error", message: "The AI request failed. Please try again." });
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
