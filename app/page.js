"use client";

import { useEffect, useRef, useState } from "react";
import AssistantMessage from "@/components/AssistantMessage";
import PdfViewer from "@/components/PdfViewer";
import UsageMeta, { formatDollars } from "@/components/UsageMeta";
import ToolCalls from "@/components/ToolCalls";
import FactsCard from "@/components/FactsCard";
import AnswerActions from "@/components/AnswerActions";
import ModeBar from "@/components/ModeBar";
import Orb from "@/components/Orb";
import { LIMITS } from "@/lib/guardrails";
import { MODELS } from "@/lib/models";
import { readJsonLines } from "@/lib/read-json-lines";

const SUGGESTIONS = [
  { icon: "📝", color: "purple", text: "Summarise this document" },
  { icon: "📅", color: "blue", text: "List any dates or deadlines" },
  { icon: "📊", color: "orange", text: "Show me the most important table" }, // the model should call go_to_page
  { icon: "🧮", color: "pink", text: "What's the % change between the two biggest numbers?" }, // the model should call calculate
];

export default function Home() {
  // Once a PDF is uploaded: { token, indexToken, filename, tokens, url, file }
  const [pdf, setPdf] = useState(null);
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
  const [mode, setMode] = useState("full"); // v7: "full" (send the whole PDF) or "rag" (search it)
  const [indexing, setIndexing] = useState(false);
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
        setPdf({ ...data, url, file }); // keep the file: RAG indexing sends it again
        setMessages([]);
        setViewer({ page: 1, jump: 0 });
        // Already indexed (the same PDF was uploaded before)? Then start in RAG mode.
        setMode(data.indexToken ? "rag" : "full");
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
        body: JSON.stringify({ token: pdf.token, messages: conversation, modelId, mode, indexToken: pdf.indexToken }),
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

  // v7: switching to RAG the first time builds the search index.
  async function changeMode(newMode) {
    if (newMode === "full" || pdf.indexToken) {
      setMode(newMode);
      return;
    }

    setIndexing(true);
    setError("");
    try {
      const form = new FormData();
      form.append("token", pdf.token);
      form.append("file", pdf.file);
      const response = await fetch("/api/index", { method: "POST", body: form });
      const data = await response.json();

      if (response.ok) {
        setPdf({ ...pdf, indexToken: data.indexToken });
        setMode("rag");
      } else {
        setError(data.error);
      }
    } catch {
      setError("Could not reach the server");
    }
    setIndexing(false);
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
      <main className="welcome">
        <h1>
          Your <span className="highlight">Smart PDF Assistant</span> for Any Document
        </h1>
        <div className="hero">
          <span className="hello">Hello!</span>
          <Orb size="large" />
        </div>
        <p className="muted">
          Upload a PDF (up to 32 MB) and get instant answers to anything inside it
        </p>
        <label className="get-started">
          <input
            type="file"
            accept="application/pdf"
            disabled={uploading}
            onChange={(e) => uploadPdf(e.target.files[0])}
          />
          {uploading ? "Uploading…" : "Get started →"}
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
          <button className="round" onClick={() => setPdf(null)} title="New PDF">
            ←
          </button>
          <div className="title">
            <span className="filename">{pdf.filename}</span>
            {sessionTokens > 0 ? (
              <span className="session-total">
                ✦ {sessionTokens.toLocaleString()} tokens
                {sessionCost > 0 && ` · ${formatDollars(sessionCost)}`}
              </span>
            ) : (
              <span className="muted small">Talk to PDF</span>
            )}
          </div>
          <select value={modelId} onChange={(e) => setModelId(e.target.value)} disabled={loading}>
            {MODELS.map((model) => (
              <option key={model.id} value={model.id}>
                {model.label}
              </option>
            ))}
          </select>
          <button className="pill" onClick={extractFacts} disabled={loading}>
            {extracting ? "Extracting…" : "✦ Key facts"}
          </button>
        </header>

        <ModeBar tokens={pdf.tokens} mode={mode} onModeChange={changeMode} indexing={indexing} disabled={loading} />

        <section className="messages">
          {messages.length === 0 && (
            <div className="empty">
              <Orb size="medium" />
              <h2>Hi there!</h2>
              <p className="muted">How may I help you with this PDF today?</p>
              <div className="suggestions">
                {SUGGESTIONS.map((suggestion) => (
                  <button key={suggestion.text} onClick={() => sendMessage(suggestion.text)}>
                    <span className={`icon ${suggestion.color}`}>{suggestion.icon}</span>
                    {suggestion.text}
                  </button>
                ))}
              </div>
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
                {message.role === "assistant" && (
                  <div className="author">
                    <Orb /> AI-Assistant
                  </div>
                )}
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
            <button type="button" className="stop" onClick={stop} title="Stop">
              ■
            </button>
          ) : (
            <button type="submit" disabled={input.trim() === ""} title="Send">
              ↑
            </button>
          )}
        </form>
      </main>
    </div>
  );
}
