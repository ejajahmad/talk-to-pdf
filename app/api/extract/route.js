import { openai } from "@/lib/openai";
import { findModel, calculateCost } from "@/lib/models";

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
  const { fileId, modelId } = await request.json();
  const model = findModel(modelId);

  if (!fileId) {
    return Response.json({ error: "Upload a PDF first" }, { status: 400 });
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
    return Response.json({ ...facts, cost: calculateCost(model, response.usage) });
  } catch (error) {
    console.error(error);
    return Response.json({ error: "Extracting the facts failed" }, { status: 500 });
  }
}
