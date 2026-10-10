import { openai } from "@/lib/openai";
import { MODELS } from "@/lib/models";
import { isRateLimited, tooManyRequests } from "@/lib/rate-limit";

// v8: three follow-up questions to click after each answer.
// A small, cheap call: the fast model, no PDF, just the last question and answer.
// Structured outputs make sure we always get back exactly { questions: [...] }.
const SCHEMA = {
  type: "object",
  properties: {
    questions: {
      type: "array",
      description: "Exactly 3 short follow-up questions (under 10 words each) the user might ask next",
      items: { type: "string" },
    },
  },
  required: ["questions"],
  additionalProperties: false,
};

export async function POST(request) {
  if (isRateLimited(request, "followups", 30, 10)) return tooManyRequests();

  const { question, answer } = await request.json();
  if (typeof question !== "string" || typeof answer !== "string") {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }

  try {
    const fastModel = MODELS[MODELS.length - 1]; // the last model on the list is the cheap one
    const response = await openai.responses.create({
      model: fastModel.id,
      instructions:
        "Suggest follow-up questions a user could ask about their PDF, based on this exchange. " +
        "They must be answerable from the same document. Write them in the user's voice.",
      input: `Question: ${question.slice(0, 2000)}\n\nAnswer: ${answer.slice(0, 6000)}`,
      text: { format: { type: "json_schema", name: "follow_ups", schema: SCHEMA, strict: true } },
    });
    const { questions } = JSON.parse(response.output_text);
    return Response.json({ questions: questions.slice(0, 3) });
  } catch (error) {
    console.error(error);
    return Response.json({ questions: [] }); // follow-ups are a nice-to-have: fail quietly
  }
}
