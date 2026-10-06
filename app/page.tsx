"use client";

import { useRef, useState } from "react";

type Message = { role: "user" | "assistant"; content: string };
type Doc = { token: string; filename: string };

export default function Home() {
  const [doc, setDoc] = useState<Doc | null>(null);
  const [uploading, setUploading] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  async function handleUpload(file: File) {
    setError(null);
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Upload failed");
      setDoc(data);
      setMessages([]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function ask(question: string) {
    if (!doc || !question.trim() || busy) return;
    setError(null);
    setBusy(true);
    setInput("");

    const history: Message[] = [...messages, { role: "user", content: question }];
    setMessages([...history, { role: "assistant", content: "" }]);

    // Update the last (assistant) message as chunks stream in.
    const patchLast = (fn: (m: Message) => Message) =>
      setMessages((prev) => [...prev.slice(0, -1), fn(prev[prev.length - 1])]);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: doc.token,
          messages: history.map(({ role, content }) => ({ role, content })),
        }),
      });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Request failed");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const evt = JSON.parse(line);
          if (evt.type === "text") {
            patchLast((m) => ({ ...m, content: m.content + evt.text }));
          } else if (evt.type === "error") {
            throw new Error(evt.message);
          }
        }
        bottomRef.current?.scrollIntoView({ behavior: "smooth" });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  if (!doc) {
    return (
      <main className="upload">
        <h1>Talk to your PDF</h1>
        <p className="muted">Upload a PDF (up to 32 MB) and ask it anything.</p>
        <label className={`dropzone ${uploading ? "is-busy" : ""}`}>
          <input
            type="file"
            accept="application/pdf"
            disabled={uploading}
            onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0])}
          />
          {uploading ? "Uploading…" : "Choose a PDF"}
        </label>
        {error && <p className="error">{error}</p>}
      </main>
    );
  }

  return (
    <main className="chat">
      <header>
        <span className="filename">📄 {doc.filename}</span>
        <button className="link" onClick={() => setDoc(null)}>
          New PDF
        </button>
      </header>

      <section className="messages">
        {messages.length === 0 && (
          <div className="suggestions">
            {["Summarise this document", "What are the key points?", "List any dates or deadlines"].map(
              (q) => (
                <button key={q} onClick={() => ask(q)}>
                  {q}
                </button>
              )
            )}
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`msg ${m.role}`}>
            <div className="bubble">
              {m.content || (busy && i === messages.length - 1 ? <span className="dots">Reading</span> : null)}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </section>

      {error && <p className="error">{error}</p>}

      <form
        className="composer"
        onSubmit={(e) => {
          e.preventDefault();
          ask(input);
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask a question about the PDF…"
          disabled={busy}
        />
        <button type="submit" disabled={busy || !input.trim()}>
          Send
        </button>
      </form>
    </main>
  );
}

