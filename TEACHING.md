# Teaching notes: v7, big PDFs (the token problem, and RAG)

**The idea in one sentence:** sending the whole document with every question stops working when
documents get big, so measure the cost up front and, when needed, *search* the document (RAG)
instead of sending all of it.

## What to teach

### 1. Show the problem, with numbers
- Upload `demo/acme-annual-book.pdf` (200 pages). The bar above the chat says:
  **⚠️ This PDF adds 109,887 tokens to every question.**
- Ask "Who owns Project Falcon?" in **Full PDF** mode. Look at the meter: ~110k input tokens for a
  one-line answer.
- **Caching discounts tokens but doesn't remove them.** They still take seconds to process, and they
  still count toward your **rate limit** (tokens per minute). At 110k per question, a 500k tokens-per-minute
  limit allows about **4 questions per minute for all your users together**. Throughput breaks
  before your budget does.

### 2. Make cost visible *before* it happens
- `lib/doc-cache.js` → `countPdfTokens()` uses OpenAI's token-counting endpoint at upload time, without
  generating an answer.
- `components/ModeBar.js` turns that number into a warning. "Why is my bill so high?" becomes a
  message on screen.

### 3. Upload dedup (`lib/doc-cache.js`)
- Re-uploading the same PDF used to create a **new** `fileId`, which meant a guaranteed cache miss.
- Now we fingerprint the bytes (SHA-256) and reuse the `fileId` and the search index. Demo: click
  "New PDF", upload the same book again. It's instant, and it remembers the RAG index.

### 4. RAG (retrieval-augmented generation)
- Click **RAG**. The first time, the app builds a search index (~10–20 seconds).
- Ask "Who owns Project Falcon?" again. A chip shows 🔎 *Searched "…" → 8 passages from p. 87, 88, …*
  and the meter shows **~6k tokens instead of ~110k**.
- **Walk through the code, in this order:**
  1. `app/api/index/route.js`: read the page texts → build the index → return a signed `indexToken`.
  2. `lib/pdf-text.js`: PDF.js gives us the text of each page.
  3. `lib/rag.js` → `addPageStamps()`: **the key trick.** The index cuts text into chunks, and a chunk
     doesn't know its page, so the v3 citations would silently break. We stamp `[p. N]` on every
     paragraph, so every chunk carries its page number.
  4. `lib/rag.js` → `createIndex()`: upload the stamped text, create a vector store, wait until it's ready.
  5. `lib/agent.js`: in RAG mode, **no PDF** in the input, `file_search` added to the tools, and
     `RAG_PROMPT` added to the instructions.

### 5. Measure the quality cost, don't guess
- `npm run eval -- --big --mode rag` runs the *same* cases as full mode. The `book-not-in-doc` case
  ("When does the **Paris** office lease end?") is the trap: search always returns *something*
  (the Lisbon passage), and the model must still say "not found".
- Compare `npm run stats`: average tokens per question for full vs RAG.

## Pitfalls in this version (what RAG costs you)

- **RAG only sees what the search found.** A retrieval miss means a wrong or "not found" answer.
  Questions that need the *whole* document ("summarise this", "how many times is X mentioned?")
  get worse.
- **Text only.** Charts, images, layout and scanned pages are invisible to RAG. Scanned PDFs have no
  text at all, so the index route refuses them. Full PDF mode still wins there.
- **An extra round trip.** The search step can make time-to-first-word *slower* than full mode, even
  though it's far cheaper.
- **RAG has its own bills.** OpenAI charges per `file_search` call and for vector storage (the index
  deletes itself after one idle day). Set `FILE_SEARCH_PRICE` in `lib/models.js` to include it in the meter.
- **Key facts still uses the whole PDF**, even in RAG mode, because extraction needs everything.
- **The cache is in memory.** Restart the server and dedup forgets everything. In production, store it
  in a database, per user.
- **Tool loops multiply context.** In full mode, every tool step re-sends the PDF. One calculator call
  on the book costs ~220k tokens.

## Wrap-up: when do you need RAG?

| | Full PDF (long context) | RAG (search) |
|---|---|---|
| Best for | One document, up to a few hundred pages | Huge documents, or many documents (a wiki, all your tickets) |
| Quality | Sees everything, including tables, charts and layout | Only sees what the search found |
| Setup | Nothing | Indexing, and keeping the index in sync |
| Cost per question | High (mostly cached) | Low |

**Start with long context. Add RAG when you hit the limits:** cost, rate limits, the 32 MB file limit, or many documents.

## Where to go next (homework ideas)

1. **Accounts and saved chats:** add login, store `{ userId, fileId, messages }` in a database, and
   replace the signed token with a database lookup scoped to the user.
2. **Deploy to Vercel:** request bodies are capped at ~4.5 MB, so upload big PDFs straight from the
   browser to storage. Move the rate limiter and dedup cache to Redis, and send logs to a log service.
3. **Run the evals in CI** on every pull request that touches `lib/prompt.js`, `lib/tools.js` or `lib/models.js`.
4. **Hybrid mode:** use RAG to find the right pages, then send only *those pages* as a small PDF, so
   the model can still see their charts and layout.
