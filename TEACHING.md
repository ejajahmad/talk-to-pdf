# Teaching notes: v0, hello LLM

**The idea in one sentence:** an AI feature is just an API call made from your server, with
instructions (the rules) and input (the user's stuff).

## What to teach

1. **Show the app.** Paste text, ask "When did the app launch?", get an answer.
2. **Walk through the code, in this order:**
   - `app/page.js`: a normal React form. On submit it calls `fetch("/api/ask")`.
   - `app/api/ask/route.js`: our server route. It calls `openai.responses.create(...)`.
   - `lib/openai.js`: creates the client from `OPENAI_API_KEY`.
3. **Why the call happens on the server.** If the browser called OpenAI directly, the API key would
   be in the page source, and anyone could copy it and spend your money. Open DevTools → Network
   and show that the browser only talks to `/api/ask`.
4. **Instructions vs input.**
   - `instructions` = the system prompt, the rules ("only use the text provided").
   - `input` = what the user gave us (the text and the question).
   - Change the instructions live (for example, "answer like a pirate") to show their effect.
5. **The model has no memory.** Ask "When did the app launch?", then ask "What did I just ask you?".
   It has no idea. Every request is a brand new conversation. It only "knows" the text because we
   send it again with every question.
6. **Grounding, briefly.** Ask "Who is the CEO?". The text doesn't say, and the instructions tell the
   model to admit that instead of guessing.

## Pitfalls in this version (say these out loud)

- **You have to paste text.** Real documents are PDFs with tables, charts and many pages.
- **One question at a time, no memory.** Follow-up questions like "and in Q2?" don't work.
- **You wait for the whole answer.** Long answers mean staring at "Thinking…" for 10+ seconds.
- **No limits at all.** Anyone can send a huge text and run up your bill.

## What the next branch fixes (v1-upload-pdf)

- Upload a real **PDF** instead of pasting text. The model reads the text *and* sees each page
  as an image, so tables and charts work too.
- The PDF is uploaded **once** to OpenAI's Files API, and later questions refer to it by its id.

Memory, streaming and limits come later: v2 (chat and streaming) and v6 (limits).
