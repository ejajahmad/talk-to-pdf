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
| **`v4-cost-caching`** ← you are here | Token and cost meter, model picker | Tokens, prompt caching, model choice |
| `v5-structured-tools` | "Key facts" table, calculator and go-to-page tools | Structured outputs, tool calling (agents) |
| `v6-production` | Secure tokens, limits, logs, feedback, evals | Safety, evals, observability |
| `v7-big-pdfs` | Token count per PDF, upload dedup, RAG mode | Cost at scale, RAG |

## Files in this step

> **Before you demo:** fill in the prices (US dollars per 1 million tokens) in `lib/models.js` from
> [openai.com/api/pricing](https://openai.com/api/pricing), and check that your account can use the
> model ids listed there. Without prices, the meter shows tokens and timings but no $ amount.

| File | What it does |
|---|---|
| `lib/models.js` | The list of models users can pick, their prices, and `calculateCost()` |
| `app/api/chat/route.js` | Checks the chosen model, sets `prompt_cache_key`, and streams **JSON lines**: text pieces, then one `usage` event |
| `lib/read-json-lines.js` | Reads the JSON-lines stream in the browser, one event at a time |
| `components/UsageMeta.js` | The meter line under each answer: tokens, % cached, speed, cost |
| `app/page.js` | Model picker in the header, and a running total for the chat |
| `components/AssistantMessage.js` | Renders markdown and turns `(p. 4)` citations into buttons |
| `components/PdfViewer.js` | The browser's own PDF viewer in an `<iframe>`, opened at `#page=N` |
| `app/api/upload/route.js` | Uploads the PDF to OpenAI's Files API and returns its `fileId` |

> The viewer uses the browser's built-in PDF viewer. Jumping to a page works in Chrome, Edge and
> Firefox. Safari shows the PDF but may ignore `#page=`, so demo in Chrome.
