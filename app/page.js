"use client";

import { useState } from "react";

const SAMPLE_TEXT = `Acme Corp - Q3 Report
Revenue grew 18% year over year to $4.2M.
The new mobile app launched on August 14 and reached 25,000 users in six weeks.
Headcount rose from 32 to 41. The next board meeting is on November 3.`;

export default function Home() {
  const [text, setText] = useState(SAMPLE_TEXT);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function askQuestion(event) {
    event.preventDefault(); // stop the form from reloading the page
    setLoading(true);
    setError("");
    setAnswer("");

    try {
      // Our own API route calls OpenAI. The browser never sees the API key.
      const response = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, question }),
      });
      const data = await response.json();

      if (response.ok) {
        setAnswer(data.answer);
      } else {
        setError(data.error);
      }
    } catch {
      setError("Could not reach the server");
    }
    setLoading(false);
  }

  return (
    <main className="page">
      <h1>Hello, LLM</h1>
      <p className="muted">Paste some text, then ask a question about it.</p>

      <label className="label" htmlFor="text">Text</label>
      <textarea id="text" rows={7} value={text} onChange={(e) => setText(e.target.value)} />

      <form className="ask-form" onSubmit={askQuestion}>
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="e.g. When did the app launch?"
        />
        <button type="submit" disabled={loading || question.trim() === ""}>
          {loading ? "Thinking…" : "Ask"}
        </button>
      </form>

      {error && <p className="error">{error}</p>}
      {answer && <div className="answer">{answer}</div>}
    </main>
  );
}
