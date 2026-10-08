import { openai } from "./openai.js";
import { calculateCost } from "./models.js";
import { SYSTEM_PROMPT } from "./prompt.js";
import { TOOLS, runTool } from "./tools.js";

const MAX_STEPS = 5; // safety net: the tool loop can never run forever

// The agent loop, moved out of the chat route so that the app AND the evals run the same code.
//
//   model      one of the MODELS from lib/models.js
//   fileId     the PDF to answer from
//   messages   [{ role: "user" | "assistant", content }]
//   signal     lets the caller stop everything (the Stop button)
//   onText     called with each new piece of answer text
//   onTool     called after each tool call
//
// Returns { text, toolCalls, stats } once the answer is complete.
export async function runAgent({ model, fileId, messages, signal, onText = () => {}, onTool = () => {} }) {
  // The model has no memory, so we rebuild the conversation for it every time.
  // The PDF goes into the FIRST user message, so the start of every request is identical (caching).
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
  let firstWordTime = null;
  let text = "";
  const toolCalls = [];
  const totals = { inputTokens: 0, cachedTokens: 0, outputTokens: 0, reasoningTokens: 0, cost: 0 };

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
        tool_choice: step === MAX_STEPS ? "none" : "auto", // last step: tools off, so it must answer
        stream: true,
        prompt_cache_key: fileId,
      },
      { signal },
    );

    let response = null;
    let stepText = "";
    for await (const event of stream) {
      if (event.type === "response.output_text.delta") {
        if (firstWordTime === null) firstWordTime = Date.now();
        stepText += event.delta;
        text += event.delta;
        onText(event.delta);
      }
      if (event.type === "response.completed") {
        response = event.response;
      }
    }

    const usage = response.usage;
    totals.inputTokens += usage.input_tokens;
    totals.cachedTokens += usage.input_tokens_details.cached_tokens;
    totals.outputTokens += usage.output_tokens;
    totals.reasoningTokens += usage.output_tokens_details.reasoning_tokens;
    const stepCost = calculateCost(model, usage);
    totals.cost = stepCost === null ? null : totals.cost + stepCost;

    const calls = response.output.filter((item) => item.type === "function_call");
    if (calls.length === 0) break; // no tools requested: that was the final answer

    if (stepText !== "") {
      text += "\n\n";
      onText("\n\n");
    }

    input.push(...response.output);
    for (const call of calls) {
      const args = JSON.parse(call.arguments);
      const output = runTool(call.name, args);
      const toolCall = { name: call.name, args, output };
      toolCalls.push(toolCall);
      onTool(toolCall);
      input.push({ type: "function_call_output", call_id: call.call_id, output });
    }
  }

  const stats = {
    model: model.id,
    ...totals,
    secondsToFirstWord: firstWordTime ? (firstWordTime - startTime) / 1000 : null,
    totalSeconds: (Date.now() - startTime) / 1000,
  };
  return { text, toolCalls, stats };
}
