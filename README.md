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
| **`v3-citations-viewer`** ← you are here | PDF viewer and clickable page citations | Hallucination, grounding, trust |
| `v4-cost-caching` | Token and cost meter, model picker | Tokens, prompt caching, model choice |
| `v5-structured-tools` | "Key facts" table, calculator and go-to-page tools | Structured outputs, tool calling (agents) |
| `v6-production` | Secure tokens, limits, logs, feedback, evals | Safety, evals, observability |
| `v7-big-pdfs` | Token count per PDF, upload dedup, RAG mode | Cost at scale, RAG |

## Files in this step

| File | What it does |
|---|---|
| `app/page.js` | The chat, plus the PDF viewer next to it. Clicking a citation calls `goToPage()` |
| `app/api/chat/route.js` | A stricter **grounding prompt**: answer only from the PDF and cite every claim as `(p. 4)` |
| `components/AssistantMessage.js` | Renders markdown and turns `(p. 4)` citations into buttons |
| `components/PdfViewer.js` | The browser's own PDF viewer in an `<iframe>`, opened at `#page=N` |
| `app/api/upload/route.js` | Uploads the PDF to OpenAI's Files API and returns its `fileId` |
| `lib/openai.js` | The OpenAI client. Only the server uses it, so the API key stays secret |

> The viewer uses the browser's built-in PDF viewer. Jumping to a page works in Chrome, Edge and
> Firefox. Safari shows the PDF but may ignore `#page=`, so demo in Chrome.
