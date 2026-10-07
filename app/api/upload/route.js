import { toFile } from "openai";
import { openai } from "@/lib/openai";

const MAX_SIZE = 32 * 1024 * 1024; // OpenAI accepts PDFs up to 32 MB

// v1: the browser sends a PDF. We upload it to OpenAI's Files API once,
// and give the browser back the file's id so later questions can point to it.
export async function POST(request) {
  const form = await request.formData();
  const file = form.get("file");

  if (!file || file.type !== "application/pdf") {
    return Response.json({ error: "Please choose a PDF file" }, { status: 400 });
  }
  if (file.size > MAX_SIZE) {
    return Response.json({ error: "The PDF must be smaller than 32 MB" }, { status: 400 });
  }

  try {
    const bytes = Buffer.from(await file.arrayBuffer());
    const uploaded = await openai.files.create({
      file: await toFile(bytes, file.name, { type: "application/pdf" }),
      purpose: "user_data",
      // OpenAI deletes the file automatically after 24 hours.
      expires_after: { anchor: "created_at", seconds: 24 * 60 * 60 },
    });

    return Response.json({ fileId: uploaded.id, filename: file.name });
  } catch (error) {
    console.error(error);
    return Response.json({ error: "Uploading to OpenAI failed" }, { status: 500 });
  }
}
