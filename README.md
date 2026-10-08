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
| **`v6-production`** ← you are here | Secure tokens, limits, logs, feedback, evals | Safety, evals, observability |
| `v7-big-pdfs` | Token count per PDF, upload dedup, RAG mode | Cost at scale, RAG |

## Files in this step

```bash
npm run eval                            # run evals/cases.json through the real pipeline
npm run eval -- --model gpt-5-mini      # same tests, another model
npm run eval -- --only injection        # only the prompt-injection cases
npm run stats                           # usage, cost, speed and 👍/👎 from logs/events.jsonl
```

New in this step:

| File | What it does |
|---|---|
| `lib/doc-token.js` | Signs the `fileId`, so the browser gets a token it can't forge instead of a raw id |
| `lib/guardrails.js` | Limits on chat length and question length, and friendly error messages |
| `lib/rate-limit.js` | At most N requests per IP address per few minutes, on every route |
| `lib/log.js` | Writes one JSON line per event to `logs/events.jsonl` |
| `lib/prompt.js` | The system prompt, now with a **Security** section against prompt injection |
| `lib/agent.js` | The agent loop, moved out of the chat route so the app **and** the evals use the same code |
| `app/api/feedback/route.js` | Saves 👍/👎, linked to the answer by `requestId` |
| `components/AnswerActions.js` | Copy · 👍 · 👎 under each answer |
| `evals/cases.json`, `scripts/eval.js` | 11 automatic tests: facts, citations, refusals, tool use, LLM-as-judge, prompt injection |
| `scripts/stats.js` | A small terminal dashboard over the logs |
| `demo/injection.pdf` | An invoice with hidden white text that tries to hijack the AI |
| `scripts/make-demo-pdfs.js` | Rebuilds the demo PDFs. A helper, not part of the lesson |

From earlier steps:

| File | What it does |
|---|---|
| `app/api/upload/route.js` | Checks the file really is a PDF, uploads it, and returns a signed token |
| `app/api/chat/route.js` | Rate limit → check the token → check the messages → run the agent → stream → log |
| `app/api/extract/route.js` | Key facts with structured outputs |
| `app/page.js` | The whole UI: upload screen, viewer, chat, key facts |
| `lib/tools.js` | The `calculate` and `go_to_page` tools |
| `lib/models.js` | The model list, prices and `calculateCost()` |
| `lib/read-json-lines.js` | Reads the JSON-lines stream in the browser |
| `components/*` | The answer with citations, tool chips, usage meter, facts table, and PDF viewer |
