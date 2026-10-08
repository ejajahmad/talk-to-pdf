import { toFile } from "openai";
import { openai } from "./openai.js";

// RAG = Retrieval-Augmented Generation.
//
// Instead of sending the whole PDF with every question, we put its text into a search index
// (an OpenAI "vector store") ONCE. Then, for each question, the model calls the built-in
// file_search tool, which returns only the few passages that match. A question then costs a few
// thousand tokens instead of 100,000+.
//
// The catch: the index cuts the text into chunks, and a chunk doesn't know which page it came
// from. That would break our clickable citations. So before indexing, we stamp "[p. N]" in front
// of every paragraph. Whatever chunk the search returns, its page number comes with it.

// Extra instructions for RAG mode, added after the normal system prompt.
export const RAG_PROMPT = `

Search mode
- You do NOT have the whole document. Use the file_search tool to find the passages you need.
  If the first results don't answer the question, search again with different words.
- Every passage starts with its page, like "[p. 12] ...". Use those numbers for your citations.
- If the search finds nothing relevant, say "I couldn't find that in the document". Don't guess.`;

// Turns ["text of page 1", "text of page 2", ...] into one text with a page stamp on every paragraph:
//   [p. 1] First paragraph of page 1...
//   [p. 1] Second paragraph of page 1...
//   [p. 2] First paragraph of page 2...
export function addPageStamps(pages) {
  const paragraphs = [];

  for (let i = 0; i < pages.length; i++) {
    const pageNumber = i + 1;
    const lines = pages[i].split("\n");

    // Join lines into paragraphs of about 500 characters.
    let paragraph = "";
    for (const line of lines) {
      if (line.trim() === "") continue;
      paragraph += line.trim() + " ";
      if (paragraph.length > 500) {
        paragraphs.push(`[p. ${pageNumber}] ${paragraph.trim()}`);
        paragraph = "";
      }
    }
    if (paragraph !== "") paragraphs.push(`[p. ${pageNumber}] ${paragraph.trim()}`);
  }

  return paragraphs.join("\n\n");
}

// Builds the search index for one PDF and waits until it's ready. Returns the vector store id.
export async function createIndex(pages, filename) {
  // 1. Upload the stamped text as a file.
  const text = addPageStamps(pages);
  const file = await openai.files.create({
    file: await toFile(Buffer.from(text), filename + ".txt", { type: "text/plain" }),
    purpose: "assistants",
    expires_after: { anchor: "created_at", seconds: 24 * 60 * 60 },
  });

  // 2. Create an empty vector store. Storage costs money, so it deletes itself after 1 idle day.
  const vectorStore = await openai.vectorStores.create({
    name: filename,
    expires_after: { anchor: "last_active_at", days: 1 },
  });

  // 3. Add the file. OpenAI cuts it into chunks and indexes them. "AndPoll" waits until it's done.
  const result = await openai.vectorStores.files.createAndPoll(vectorStore.id, {
    file_id: file.id,
    // Small chunks: more precise search results, and fewer tokens per question.
    chunking_strategy: { type: "static", static: { max_chunk_size_tokens: 400, chunk_overlap_tokens: 100 } },
  });
  if (result.status !== "completed") {
    throw new Error("Indexing failed: " + result.status);
  }

  return vectorStore.id;
}

// The built-in file_search tool, pointed at one PDF's index.
export function fileSearchTool(vectorStoreId) {
  return {
    type: "file_search",
    vector_store_ids: [vectorStoreId],
    max_num_results: 8, // passages per search. More = better recall, but more tokens.
  };
}

// Which pages do these search results come from? Reads the "[p. N]" stamps.
export function pagesInResults(results) {
  const pages = [];
  for (const result of results) {
    for (const match of result.text.matchAll(/\[p\. (\d+)\]/g)) {
      const page = Number(match[1]);
      if (!pages.includes(page)) pages.push(page);
    }
  }
  return pages.sort((a, b) => a - b);
}
