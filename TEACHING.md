# Teaching notes: v1, upload a PDF

**The idea in one sentence:** modern models read PDFs directly, so "chat with a PDF" starts as
"upload the file once, then send its id with the question".

## What to teach

1. **Show the app.** Upload `demo/acme-q3-report.pdf` (or any PDF) and ask a
   question about a table or chart in it.
2. **Walk through the code, in this order:**
   - `app/page.js`: two screens. No PDF → upload box. PDF → question box.
   - `app/api/upload/route.js`: reads the file from the form, uploads it with
     `openai.files.create(...)`, and returns the `fileId`.
   - `app/api/ask/route.js`: the `input` is now a **list of parts**: the file, then the question.
3. **Upload once, refer by id.** We don't send 5 MB of PDF with every question. The file lives at
   OpenAI and we point to it with `file_id`. `expires_after` cleans it up after 24 hours.
4. **The model reads text *and* pages as images.** Ask about a chart or a scanned page. This is why
   we didn't extract the text ourselves.
5. **Compare with v0:** the instructions barely changed. Only the input changed from a string to
   "file + text".

## Pitfalls in this version (say these out loud)

- **Still no memory.** Ask "What was revenue?" and then "And in Q2?". The second question fails
  because each question is sent on its own.
- **You wait for the whole answer.** Big PDFs mean 10–20 seconds of "Reading…" with nothing on screen.
- **Plain text answers.** The model writes markdown (`**bold**`, lists), and we show the raw asterisks.
- **Security hole: the browser holds the raw `fileId`.** Every file in your OpenAI project is reachable
  with your key. A user could send *someone else's* `fileId` to `/api/ask` and read their PDF.
  (Fixed in v6 with a signed token.)
- **We trust `file.type`.** The browser says "it's a PDF", but anyone can fake that. (Fixed in v6.)

## What the next branch fixes (v2-chat-streaming)

- **Chat with memory:** the browser keeps the conversation and sends all of it every time.
- **Streaming:** the answer appears word by word, like ChatGPT.
- **A Stop button** that actually stops the model (and the bill).
- **Markdown** answers are rendered properly.
