# Teaching notes: v3, citations you can check

**The idea in one sentence:** you can't stop a model from ever being wrong, so make every answer
easy to check: each claim links to the page it came from.

## What to teach

1. **Show the problem first.** On `v2-chat-streaming`, ask "Who is Acme's CEO?" about
   `demo/acme-q3-report.pdf`. Only the CFO is named, so watch whether the model guesses.
2. **Switch to this branch** and ask again. It should say "I couldn't find that in the document".
3. **Ask "What was revenue in Q3?"** and click the orange **(p. 2)** button. The PDF jumps to that page.
4. **Walk through the code, in this order:**
   - `app/api/chat/route.js`: compare the v2 prompt with this one. It has three parts: **grounding**
     (only the document, never guess), **citations** (an exact format we can detect in code) and **style**.
   - `components/AssistantMessage.js`: one regex turns `(p. 4)` into a markdown link, and a custom
     `a` component draws that link as a button.
   - `components/PdfViewer.js`: one `<iframe>`. `#page=4` at the end of the address opens page 4.
   - `app/page.js`: `URL.createObjectURL(file)` gives the file already in the browser a local
     address, so the PDF is never downloaded again.
5. **Hallucination is the core risk of AI products.** Models sound equally sure when they're right
   and when they're wrong. You can't remove that, so design around it: **trust through verification**.
6. **Prompting is product design.** The citation format isn't decoration. Our code depends on it.
7. **Page labels vs page positions.** Many PDFs print "Page 12" on what is really the 2nd page of the
   file. The viewer needs the position, so the prompt says so explicitly.

## Pitfalls in this version (say these out loud)

- **A prompt is a request, not a guarantee.** If the model writes "(pp. 4–5)" or "page 4" instead of
  "(p. 4)", that citation isn't clickable. When you need a guaranteed shape, use structured
  outputs (v5).
- **No idea what each answer costs.** Every question re-sends the whole PDF and the whole chat.
  How many tokens is that? How long until the first word? We can't tell.
- **One fixed model.** No way to try a cheaper or faster model.
- **Streaming is still plain text**, so we can't send token counts or a clear error along with the answer.
- **Safari** may ignore `#page=` in the built-in viewer.
- Still open from earlier: the raw `fileId` is in the browser, and nothing limits chat length. (Fixed in v6.)

## What the next branch fixes (v4-cost-caching)

- A **meter under every answer**: tokens in and out, how much was **cached**, time to first word, and cost.
- A **model picker** (big vs small model), checked against an allowlist on the server.
- **Prompt caching**: we keep the start of every request identical, so follow-up questions are
  cheaper and faster.
- The stream switches from plain text to **JSON lines**, so it can carry the answer *and* the usage stats.
