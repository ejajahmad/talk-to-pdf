import { openai, MODEL } from "@/lib/openai";

// v0: the smallest possible AI feature.
// The browser sends { text, question }. We send both to the model and return its answer.
export async function POST(request) {
  const { text, question } = await request.json();

  if (!question || question.trim() === "") {
    return Response.json({ error: "Please type a question" }, { status: 400 });
  }

  try {
    const response = await openai.responses.create({
      model: MODEL,
      // "instructions" is the system prompt: rules the model should follow.
      instructions: "Answer the question using only the text provided. If the answer isn't there, say so.",
      // "input" is what the user gives the model: the text and the question.
      input: `Text:\n${text}\n\nQuestion: ${question}`,
    });

    return Response.json({ answer: response.output_text });
  } catch (error) {
    console.error(error);
    return Response.json({ error: "The AI request failed" }, { status: 500 });
  }
}
