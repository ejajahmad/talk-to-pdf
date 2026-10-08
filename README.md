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
| `v5-structured-tools` | "Key facts" table, calculator and go-to-page tools | Structured outputs, tool calling (agents) |
| `v6-production` | Secure tokens, limits, logs, feedback, evals | Safety, evals, observability |
| **`v7-big-pdfs`** ← you are here | Token count per PDF, upload dedup, RAG mode | Cost at scale, RAG |

## Files in this step

```bash
npm run eval -- --big --mode rag             # every case, RAG mode (cheap)
npm run eval -- --only book --mode full      # the 200-page book, whole PDF every time (expensive!)
npm run stats                                # now also compares Full PDF vs RAG
```

New in this step:

| File | What it does |
|---|---|
| `lib/doc-cache.js` | **Dedup:** remembers each PDF by a hash of its bytes, so a re-upload reuses its `fileId` (and index). Also **counts the PDF's tokens** at upload |
| `components/ModeBar.js` | Shows "this PDF adds N tokens to every question" *before* the first question, and switches **Full PDF / RAG** |
| `lib/pdf-text.js` | Reads the text of every page with PDF.js |
| `lib/rag.js` | Stamps `[p. N]` on every paragraph, builds the search index (vector store), and defines the `file_search` tool |
| `app/api/index/route.js` | Builds the index for one PDF and returns a signed `indexToken` |
| `lib/agent.js` | Now has a `mode`: `"full"` sends the whole PDF, `"rag"` sends no PDF and gives the model the search tool |
| `demo/acme-annual-book.pdf` | A 200-page PDF (~110k tokens) with a few facts hidden on known pages |
| `scripts/eval.js` | `--mode full\|rag` and `--big` (the book cases) |

Measured on `demo/acme-annual-book.pdf` with gpt-5.5:

| | Full PDF | RAG |
|---|---|---|
| Input tokens per question | **~110,000** | **~5,000–10,000** |
| Eval cases passed | 16/16 | 16/16 |
| Sees charts, scans, layout | ✅ | ❌ text only |
| Setup per PDF | none | ~10–20 s of indexing |
