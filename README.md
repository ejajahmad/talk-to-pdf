# Talk to PDF — Next.js + OpenAI API

Upload a PDF, ask questions, get streamed answers with inline page references.
Frontend and backend both live in one Next.js (App Router) app.

## Run it

```bash
npm install
cp .env.example .env.local   # then fill in OPENAI_API_KEY and SESSION_SECRET
npm run dev                  # http://localhost:3000
```

## How it works

```
Browser                         Next.js server                     OpenAI API
───────                         ──────────────                     ──────────
choose PDF ──POST /api/upload──▶ validate (PDF, <32 MB)
                                 files.create() ─────────────────▶ stores PDF → file_id
           ◀── signed token ──── sign {file_id, name} with HMAC

ask question ─POST /api/chat───▶ verify token
  (token + chat history)         build input:
                                   turn 1 = [input_file(file_id), question]
                                   later turns = plain text
                                 responses.stream() ─────────────▶ reads PDF (text + page images)
           ◀── NDJSON stream ─── text deltas ◀───────────────────── streams answer
```

| File | What it does |
|---|---|
| `app/page.tsx` | Upload screen + chat UI; reads the NDJSON stream |
| `app/api/upload/route.ts` | Uploads the PDF to the OpenAI **Files API** (auto-expires after 24h) |
| `app/api/chat/route.ts` | Sends the conversation to the Responses API with the PDF attached, streams back text |
| `lib/doc-token.ts` | Signs/verifies the token so users can't reference other people's files |
| `lib/openai.ts` | Shared SDK client + model name |

### Key decisions

- **No chunking or vector DB.** The model reads the PDF natively — extracted text *and* an image
  of each page — so charts, tables and scans work. Limit: 32 MB of files per request.
- **Files API** — upload once, reference by `file_id` each turn instead of re-sending megabytes.
- **Prompt caching** — OpenAI caches long identical prompt prefixes automatically. The PDF is
  always first, so follow-ups are cheaper. Check the `usage` log in your terminal:
  `input_tokens_details.cached_tokens` should be large on the 2nd question onwards.
- **Page references** — the system prompt asks the model to cite pages inline, e.g. "(p. 4)".
- **Security** — Files API files are project-wide, so the browser never sees a raw `file_id`,
  only an HMAC-signed token. The API key stays server-side.

## Going further

1. **Persist chats** — save `{userId, fileId, messages}` in Postgres (e.g. Supabase/Neon) and add
   auth (NextAuth/Clerk). Replace the signed token with a DB lookup scoped to the user.
2. **Show the PDF beside the chat** — render it with `react-pdf` and make "(p. 4)" references
   jump to that page.
3. **Big PDFs or many PDFs** (textbooks, a whole library) → use OpenAI vector stores with the
   `file_search` tool, or roll your own RAG with pgvector.
4. **Deploying on Vercel** — serverless functions cap request bodies at ~4.5 MB. For larger PDFs,
   upload from the browser to storage (Vercel Blob / S3 presigned URL) first, then have
   `/api/upload` fetch it server-side and push it to the Files API.
5. **Rate-limit** `/api/chat` (e.g. Upstash Ratelimit) before you share it publicly.

Docs: [File inputs](https://platform.openai.com/docs/guides/pdf-files) ·
[Files API](https://platform.openai.com/docs/api-reference/files) ·
[Responses API](https://platform.openai.com/docs/api-reference/responses) ·
[Prompt caching](https://platform.openai.com/docs/guides/prompt-caching)
