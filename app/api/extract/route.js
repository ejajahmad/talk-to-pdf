import { openai } from "@/lib/openai";
import { findModel, calculateCost } from "@/lib/models";
import { readToken } from "@/lib/doc-token";
import { friendlyError } from "@/lib/guardrails";
import { isRateLimited, tooManyRequests, getIp } from "@/lib/rate-limit";
import { logEvent, hashIp } from "@/lib/log";

// Structured outputs: instead of free text, the model MUST reply with JSON in exactly this shape.
// With strict: true, OpenAI guarantees it, so the browser can draw a table without any guessing.
const FACTS_SCHEMA = {
  type: "object",
  properties: {
    document_type: { type: "string", description: "e.g. contract, invoice, research paper, report" },
    summary: { type: "string", description: "One or two sentences" },
    facts: {
      type: "array",
      description: "The most important facts, in document order. At most 15.",
      items: {
        type: "object",
        properties: {
          category: {
            type: "string",
            enum: ["date", "deadline", "amount", "metric", "person", "organization", "obligation", "other"],
          },
          label: { type: "string", description: "What this fact is, e.g. 'Contract start date'" },
          value: { type: "string", description: "Exactly as written in the document" },
          page: { type: "integer", description: "Page position in the PDF file, starting at 1" },
        },
        required: ["category", "label", "value", "page"],
        additionalProperties: false,
      },
    },
  },
  required: ["document_type", "summary", "facts"],
  additionalProperties: false,
};

export async function POST(request) {
  if (isRateLimited(request, "extract", 10, 10)) return tooManyRequests(); // 10 per 10 minutes

  const { token, modelId } = await request.json();
  const model = findModel(modelId);

  const fileId = readToken(token);
  if (!fileId) {
    return Response.json({ error: "Invalid document. Please upload the PDF again." }, { status: 401 });
  }

  try {
    const response = await openai.responses.create({
      model: model.id,
      instructions:
        "Extract the key facts from the attached PDF. Only include facts stated in it. Copy values exactly.",
      input: [{ role: "user", content: [{ type: "input_file", file_id: fileId }] }],
      text: {
        format: { type: "json_schema", name: "key_facts", schema: FACTS_SCHEMA, strict: true },
      },
    });

    // The answer is a JSON string that matches FACTS_SCHEMA.
    const facts = JSON.parse(response.output_text);
    const cost = calculateCost(model, response.usage);
    await logEvent({
      type: "extract",
      user: hashIp(getIp(request)),
      file: fileId,
      model: model.id,
      facts: facts.facts.length,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      cost,
    });
    return Response.json({ ...facts, cost });
  } catch (error) {
    console.error(error);
    await logEvent({ type: "extract", model: model.id, outcome: "error", error: error.message });
    return Response.json({ error: friendlyError(error) }, { status: 500 });
  }
}
