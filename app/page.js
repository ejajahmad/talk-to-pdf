"use client";

import { useEffect, useRef, useState } from "react";
import AssistantMessage from "@/components/AssistantMessage";
import PdfViewer from "@/components/PdfViewer";
import UsageMeta, { formatDollars } from "@/components/UsageMeta";
import ToolCalls from "@/components/ToolCalls";
import FactsCard from "@/components/FactsCard";
import AnswerActions from "@/components/AnswerActions";
import { LIMITS } from "@/lib/guardrails";
import { MODELS } from "@/lib/models";
import { readJsonLines } from "@/lib/read-json-lines";

const SUGGESTIONS = [
  "Summarise this document",
  "List any dates or deadlines",
  "Show me the most important table", // the model should call go_to_page
  "What's the % change between the two biggest numbers?", // the model should call calculate
];

export default function Home() {
  const [pdf, setPdf] = useState(null); // { token, filename, url } once a PDF is uploaded
  const [uploading, setUploading] = useState(false);
  // Chat messages: { role: "user" | "assistant", content, tools, usage }
  // Key facts cards: { role: "facts", facts }
  const [messages, setMessages] = useState([]);
  const [modelId, setModelId] = useState(MODELS[0].id);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [extracting, setExtracting] = useState(false);
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

    // Everything on screen so far, plus the new question.
    const newMessages = [...messages, { role: "user", content: question }];
    // On screen, also add an empty answer that we fill in as the text streams in.
    setMessages([...newMessages, { role: "assistant", content: "" }]);

    // What the model sees: only user and assistant text. Facts cards are just for the screen.
    const conversation = newMessages
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => ({ role: m.role, content: m.content }));
    setInput("");
    setLoading(true);
    setError("");

    const controller = new AbortController();
    stopController.current = controller;
    let answer = "";
    let usage = null;
    const tools = [];

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: pdf.token, messages: conversation, modelId }),
        signal: controller.signal,
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error);
      }

      // Each line from the server is one event: text, a tool call, the usage stats, or an error.
      await readJsonLines(response, (event) => {
        if (event.type === "text") answer += event.text;
        if (event.type === "usage") usage = event;
        if (event.type === "error") setError(event.message);
        if (event.type === "tool") {
          tools.push(event);
          // The model asked to show a page, so the browser scrolls the viewer.
          if (event.name === "go_to_page") goToPage(event.args.page);
        }
        setMessages([...newMessages, { role: "assistant", content: answer, tools, usage }]);
      });
    } catch (err) {
      // Pressing Stop throws an "AbortError". That's not a real error.
      if (err.name !== "AbortError") setError(err.message);
    }

    // Stopped before any text arrived? Then drop the empty answer bubble.
    if (answer === "") setMessages(newMessages);
    setLoading(false);
  }

  // Structured outputs: ask for the key facts as JSON and show them as a table.
  async function extractFacts() {
    setLoading(true);
    setExtracting(true);
    setError("");

    try {
      const response = await fetch("/api/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: pdf.token, modelId }),
      });
      const data = await response.json();

      if (response.ok) {
        setMessages([...messages, { role: "facts", facts: data }]);
      } else {
        setError(data.error);
      }
    } catch {
      setError("Could not reach the server");
    }
    setLoading(false);
    setExtracting(false);
  }

  function stop() {
    stopController.current.abort();
  }

  // Add up tokens and cost for the whole conversation.
  let sessionTokens = 0;
  let sessionCost = 0;
  for (const message of messages) {
    if (message.usage) {
      sessionTokens += message.usage.inputTokens + message.usage.outputTokens;
      sessionCost += message.usage.cost || 0;
    }
  }

  function goToPage(page) {
    // Using the "old" value (instead of `viewer`) keeps the count right even when
    // this runs several times during one streamed answer.
    setViewer((old) => ({ page, jump: old.jump + 1 }));
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
          <select value={modelId} onChange={(e) => setModelId(e.target.value)} disabled={loading}>
            {MODELS.map((model) => (
              <option key={model.id} value={model.id}>
                {model.label}
              </option>
            ))}
          </select>
          <button className="link" onClick={extractFacts} disabled={loading}>
            {extracting ? "Extracting…" : "Key facts"}
          </button>
          <button className="link" onClick={() => setPdf(null)}>
            New PDF
          </button>
        </header>

        {sessionTokens > 0 && (
          <div className="session-total">
            This chat so far: {sessionTokens.toLocaleString()} tokens
            {sessionCost > 0 && ` · ${formatDollars(sessionCost)}`}
          </div>
        )}

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

          {messages.map((message, i) => {
            if (message.role === "facts") {
              return (
                <div key={i} className="message">
                  <FactsCard facts={message.facts} onCitationClick={goToPage} />
                </div>
              );
            }
            return (
              <div key={i} className={`message ${message.role}`}>
                <div className="bubble">
                  {message.tools && message.tools.length > 0 && <ToolCalls tools={message.tools} />}
                  {message.role === "user" && message.content}
                  {message.role === "assistant" && message.content === "" && <span className="dots">Reading</span>}
                  {message.role === "assistant" && (
                    <AssistantMessage content={message.content} onCitationClick={goToPage} />
                  )}
                </div>
                {message.usage && <UsageMeta usage={message.usage} />}
                {message.usage && <AnswerActions content={message.content} requestId={message.usage.requestId} />}
              </div>
            );
          })}
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
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask a question about the PDF…"
            maxLength={LIMITS.maxQuestionLength}
          />
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
