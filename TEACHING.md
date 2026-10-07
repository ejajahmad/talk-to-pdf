# Teaching notes: v2, chat and streaming

**The idea in one sentence:** the model never remembers anything, so "chat" means *your app* keeps
the conversation and sends all of it every time, and streaming makes the wait feel short.

## What to teach

1. **Show the app.** Upload `demo/acme-q3-report.pdf`, click "Summarise this document", then ask a
   follow-up: "And what about the mobile app?". The follow-up works now.
2. **Walk through the code, in this order:**
   - `app/page.js` → `sendMessage()`: it builds `conversation` = old messages + new question and
     sends **all of it** to `/api/chat`.
   - `app/api/chat/route.js`: the loop that turns our messages into the model's `input`. The PDF goes
     into the first message only.
   - Back in `app/page.js`: the `while (true) { reader.read() }` loop that adds text as it arrives.
3. **Memory is an illusion.** Open DevTools → Network → `chat` → Payload. Show the whole history
   being sent again with every question. Longer chats mean bigger requests, and more cost (we'll
   measure that in v4).
4. **Streaming.** Total time is the same, but the first words show up in about a second instead of
   after 10+ seconds. Perceived speed is a product feature.
   - Server: `stream: true`, then forward every `response.output_text.delta` event.
   - Browser: `response.body.getReader()` reads the pieces as they arrive.
5. **The Stop button.** `AbortController` cancels the `fetch` in the browser. The server notices
   (`cancel()`) and aborts the OpenAI request, so you stop paying for words nobody will read.
6. **Markdown.** Models write markdown. `<Markdown>` from `react-markdown` renders bold text and lists
   instead of raw asterisks. It's the cheapest UX win there is.

## Pitfalls in this version (say these out loud)

- **You can't check the answers.** The model sounds just as confident when it's wrong. Nothing
  shows *where* in the PDF an answer came from.
- **The prompt is loose.** "Base your answers on the document" still lets the model fill gaps with
  general knowledge or a plausible-sounding guess.
- **You can't see the PDF** next to the chat.
- **Plain-text streaming can only carry text.** We can't send anything else with the answer, such as
  token counts or a clear error. If OpenAI fails halfway through, the answer just stops. (Fixed in v4.)
- **Cost grows with every question**, because the whole history and the PDF are sent each time, and
  we can't see it. (Measured in v4.)
- The browser still holds the raw `fileId`, and nothing limits chat length. (Fixed in v6.)

## What the next branch fixes (v3-citations-viewer)

- A **grounding prompt**: answer only from the document, never guess, cite the page for every claim.
- **Clickable citations**: "(p. 4)" becomes a link.
- A **PDF viewer** next to the chat that jumps to the cited page, so users can check every claim.
