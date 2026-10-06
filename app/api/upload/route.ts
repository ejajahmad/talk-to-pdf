import { toFile } from "openai";
import { openai } from "@/lib/openai";
import { createDocToken } from "@/lib/doc-token";

export const runtime = "nodejs";

const MAX_BYTES = 32 * 1024 * 1024; // OpenAI's per-request limit for file inputs

export async function POST(req: Request) {
  const form = await req.formData();
  const file = form.get("file");

  if (!(file instanceof File)) {
    return Response.json({ error: "No file uploaded" }, { status: 400 });
  }
  if (file.type !== "application/pdf") {
    return Response.json({ error: "Only PDF files are supported" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return Response.json({ error: "PDF must be under 32 MB" }, { status: 400 });
  }

  try {
    // Upload once to the Files API; every chat turn then references it by id
    // instead of re-sending the whole PDF.
    const uploaded = await openai.files.create({
      file: await toFile(Buffer.from(await file.arrayBuffer()), file.name, {
        type: "application/pdf",
      }),
      purpose: "user_data",
      expires_after: { anchor: "created_at", seconds: 60 * 60 * 24 }, // auto-delete after 24h
    });

    return Response.json({
      token: createDocToken(uploaded.id, file.name),
      filename: file.name,
    });
  } catch (err) {
    console.error(err);
    return Response.json({ error: "Upload to OpenAI failed" }, { status: 502 });
  }
}
