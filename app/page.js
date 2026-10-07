"use client";

import { useEffect, useRef, useState } from "react";
import AssistantMessage from "@/components/AssistantMessage";
import PdfViewer from "@/components/PdfViewer";

const SUGGESTIONS = ["Summarise this document", "What are the key points?", "List any dates or deadlines"];

export default function Home() {
  const [pdf, setPdf] = useState(null); // { fileId, filename, url } once a PDF is uploaded
  const [uploading, setUploading] = useState(false);
  const [messages, setMessages] = useState([]); // [{ role: "user" | "assistant", content: "..." }]
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [viewer, setViewer] = useState({ page: 1, jump: 0 }); // which page the PDF viewer shows
  const stopController = useRef(null); // lets the Stop button cancel the request
  const bottomOfChat = useRef(null);

  // Scroll to the newest message whenever the messages change.
  useEffect(() => {
    bottomOfChat.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function uploadPdf(file) {
    setUploading(true);
    setError("");

    try {
      const form = new FormData();
      form.append("file", file);
      const response = await fetch("/api/upload", { method: "POST", body: form });
      const data = await response.json();

      if (response.ok) {
        // A local address for the file, so the viewer can show it without downloading it again.
        const url = URL.createObjectURL(file);
        setPdf({ ...data, url });
        setMessages([]);
        setViewer({ page: 1, jump: 0 });
      } else {
        setError(data.error);
      }
    } catch {
      setError("Could not reach the server");
    }
    setUploading(false);
  }

  async function sendMessage(question) {
    if (question.trim() === "" || loading) return;

    // The conversation so far, plus the new question. This is what the model will see.
    const conversation = [...messages, { role: "user", content: question }];
    // On screen, also add an empty answer that we fill in as the text streams in.
    setMessages([...conversation, { role: "assistant", content: "" }]);
    setInput("");
    setLoading(true);
    setError("");

    const controller = new AbortController();
    stopController.current = controller;
    let answer = "";

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileId: pdf.fileId, messages: conversation }),
        signal: controller.signal,
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error);
      }

      // Read the answer piece by piece as the server sends it.
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        answer += decoder.decode(value, { stream: true });
        setMessages([...conversation, { role: "assistant", content: answer }]);
      }
    } catch (err) {
      // Pressing Stop throws an "AbortError". That's not a real error.
      if (err.name !== "AbortError") setError(err.message);
    }

    // Stopped before any text arrived? Then drop the empty answer bubble.
    if (answer === "") setMessages(conversation);
    setLoading(false);
  }

  function stop() {
    stopController.current.abort();
  }

  function goToPage(page) {
    setViewer({ page, jump: viewer.jump + 1 });
  }

  if (!pdf) {
    return (
      <main className="upload">
        <h1>Talk to your PDF</h1>
        <p className="muted">Upload a PDF (up to 32 MB) and ask it anything.</p>
        <label className="dropzone">
          <input
            type="file"
            accept="application/pdf"
            disabled={uploading}
            onChange={(e) => uploadPdf(e.target.files[0])}
          />
          {uploading ? "Uploading…" : "Choose a PDF"}
        </label>
        {error && <p className="error">{error}</p>}
      </main>
    );
  }

  return (
    <div className="workspace">
      <PdfViewer pdfUrl={pdf.url} page={viewer.page} jump={viewer.jump} />

      <main className="chat">
        <header>
          <span className="filename">📄 {pdf.filename}</span>
          <button className="link" onClick={() => setPdf(null)}>
            New PDF
          </button>
        </header>

        <section className="messages">
          {messages.length === 0 && (
            <div className="suggestions">
              {SUGGESTIONS.map((suggestion) => (
                <button key={suggestion} onClick={() => sendMessage(suggestion)}>
                  {suggestion}
                </button>
              ))}
            </div>
          )}

          {messages.map((message, i) => (
            <div key={i} className={`message ${message.role}`}>
              <div className="bubble">
                {message.role === "user" && message.content}
                {message.role === "assistant" && message.content === "" && <span className="dots">Reading</span>}
                {message.role === "assistant" && (
                  <AssistantMessage content={message.content} onCitationClick={goToPage} />
                )}
              </div>
            </div>
          ))}
          <div ref={bottomOfChat} />
        </section>

        {error && <p className="error">{error}</p>}

        <form
          className="composer"
          onSubmit={(e) => {
            e.preventDefault();
            sendMessage(input);
          }}
        >
          <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask a question about the PDF…" />
          {loading ? (
            <button type="button" className="stop" onClick={stop}>
              Stop
            </button>
          ) : (
            <button type="submit" disabled={input.trim() === ""}>
              Send
            </button>
          )}
        </form>
      </main>
    </div>
  );
}
