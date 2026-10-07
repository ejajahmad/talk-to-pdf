import { openai, MODEL } from "@/lib/openai";

// v1: one question about an uploaded PDF. Still no memory between questions.
export async function POST(request) {
  const { fileId, question } = await request.json();

  if (!fileId) {
    return Response.json({ error: "Upload a PDF first" }, { status: 400 });
  }
  if (!question || question.trim() === "") {
    return Response.json({ error: "Please type a question" }, { status: 400 });
  }

  try {
    const response = await openai.responses.create({
      model: MODEL,
      instructions: "Answer questions about the attached PDF. If the answer isn't in it, say so.",
      // A message can hold several parts: here, the PDF and then the question.
      input: [
        {
          role: "user",
          content: [
            // The model gets the text of every page AND an image of every page,
            // so tables, charts and scanned pages work too.
            { type: "input_file", file_id: fileId },
            { type: "input_text", text: question },
          ],
        },
      ],
    });

    return Response.json({ answer: response.output_text });
  } catch (error) {
    console.error(error);
    return Response.json({ error: "The AI request failed" }, { status: 500 });
  }
}
