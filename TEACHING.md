# Teaching notes: v4, cost, caching and model choice

**The idea in one sentence:** tokens are the unit of cost and speed, so measure them on every
answer, and structure your prompt so the expensive part (the PDF) gets cached.

> Before the session: fill in the prices in `lib/models.js` so the meter shows dollars.

## What to teach

1. **Show the meter.** Ask a question. Under the answer: model · tokens in · tokens out · ⚡ time to
   first word · ⏱ total time · cost.
2. **Prompt caching, live.**
   - First question: "0% cached" (or no cached note at all).
   - Ask a follow-up: about **90%+ cached** in green, a faster ⚡, and a lower cost.
   - Why it works: every request *starts* the same way (instructions → PDF → older messages). OpenAI
     reuses the work it already did for that identical beginning. `prompt_cache_key: fileId` helps
     route questions about the same PDF to the same cache.
   - If you change *anything* at the start (like the instructions), the cache misses.
   - Caching only starts once the shared beginning is **1,024 tokens or more**. The 4-page
     `demo/acme-q3-report.pdf` is only about 900 tokens, so it never shows "cached". **Use a longer
     PDF (10+ pages) for this demo.**
3. **Walk through the code, in this order:**
   - `lib/models.js`: the allowlist and `calculateCost()`. Cached tokens are billed at a lower price.
   - `app/api/chat/route.js`: `send({ type: "text" })` for each piece, then one `send({ type: "usage" })`
     when the `response.completed` event arrives.
   - `lib/read-json-lines.js`: why we need to keep the `leftover`. A network chunk can end in the
     middle of a line.
   - `components/UsageMeta.js`: just formatting.
4. **What's in "input tokens"?** Instructions + the whole PDF + the whole chat + the new question.
   The PDF is the big part.
5. **Reasoning tokens.** Reasoning models "think" before answering. You never see those tokens, but
   you pay for them as output.
6. **The cost of chatting grows every turn**, because the history is sent again each time. Watch the
   "This chat so far" total climb.
7. **Model trade-offs.** Ask the same question with both models. Compare quality, speed and cost.
   A common rule: small model by default, big model when it matters.
8. **Never trust the browser.** The browser only sends a model *name*. The server checks it against
   `MODELS`, so nobody can point your key at the most expensive model.
9. **Two latency numbers.** ⚡ time to first word is what users *feel*. ⏱ total time is what your
   server pays for.

## Pitfalls in this version (say these out loud)

- **Free text only.** If you want data (a table of dates, amounts, names), you have to parse prose.
  That's fragile.
- **The model does math in its head**, and LLMs are bad at arithmetic. Ask "By what % did revenue
  grow from Q2 to Q3?" and check the answer with a calculator.
- **The model can only talk.** It can't *do* anything, like open the right page in the viewer.
- Still open: the raw `fileId` is in the browser, there are no limits on chat length or requests,
  and nothing is logged. (Fixed in v6.)

## What the next branch fixes (v5-structured-tools)

- **Structured outputs:** a "Key facts" button returns JSON that *must* match a schema, so we can
  draw it as a table.
- **Tool calling:** the model can call a `calculate` tool for exact math, and a `go_to_page` tool that
  scrolls the viewer. That's the core loop behind every "AI agent".
