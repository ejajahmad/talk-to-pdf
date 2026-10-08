# Talk to PDF: build an AI product step by step

A small Next.js app (JavaScript, App Router) built up across git branches for a webinar.
Each branch adds one idea on top of the one before, so you can `git checkout` any step and run it.

```bash
npm install
cp .env.example .env.local   # then paste your OpenAI API key into it
npm run dev                  # open http://localhost:3000
```

Every branch has a **[TEACHING.md](TEACHING.md)** with what to teach, the problems that version
still has, and what the next branch fixes.

## Roadmap

| Branch | What it adds | Main idea |
|---|---|---|
| `v0-hello-llm` | Paste text, ask a question | API keys stay on the server, instructions, no memory |
| `v1-upload-pdf` | Upload a PDF, ask one question about it | Files API, the model reads PDFs |
| `v2-chat-streaming` | Chat history, streaming answers, Stop button | Context, streaming, AI UX |
| `v3-citations-viewer` | PDF viewer and clickable page citations | Hallucination, grounding, trust |
| `v4-cost-caching` | Token and cost meter, model picker | Tokens, prompt caching, model choice |
| **`v5-structured-tools`** ← you are here | "Key facts" table, calculator and go-to-page tools | Structured outputs, tool calling (agents) |
| `v6-production` | Secure tokens, limits, logs, feedback, evals | Safety, evals, observability |
| `v7-big-pdfs` | Token count per PDF, upload dedup, RAG mode | Cost at scale, RAG |

## Files in this step

| File | What it does |
|---|---|
| `app/api/extract/route.js` | **Structured outputs.** A JSON schema with `strict: true`, so the model must reply with `{ document_type, summary, facts[] }` |
| `components/FactsCard.js` | Draws that JSON as a table. Each fact links to its page |
| `lib/tools.js` | **Tool calling.** The tool definitions (`calculate`, `go_to_page`) and the code that runs them |
| `app/api/chat/route.js` | **The agent loop.** Call the model, run the tools it asks for, send back the results, repeat (5 steps max) |
| `components/ToolCalls.js` | Shows each tool call above the answer, e.g. 🧮 `(4.20-3.56)/3.56*100` = **17.98** |
| `app/page.js` | The "Key facts" button, and scrolls the viewer when the model calls `go_to_page` |
| `lib/models.js` | The list of models users can pick, their prices, and `calculateCost()` |
| `lib/read-json-lines.js` | Reads the JSON-lines stream in the browser, one event at a time |
| `components/UsageMeta.js` | The meter line under each answer: tokens, % cached, speed, cost |
| `components/AssistantMessage.js` | Renders markdown and turns `(p. 4)` citations into buttons |
| `components/PdfViewer.js` | The browser's own PDF viewer in an `<iframe>`, opened at `#page=N` |
| `app/api/upload/route.js` | Uploads the PDF to OpenAI's Files API and returns its `fileId` |

```
              ┌───────────────────────────────────────────────┐
question ───▶ │ model ── plain text? ──▶ stream it, done       │
              │   │                                            │
              │   └── "call calculate({ expression })" ────────┤
              │         our server runs it, sends the result ──┘  (repeat, 5 steps max)
              └────────────────────────────────────────────────
```
