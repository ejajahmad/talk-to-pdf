"use client";

import { useState } from "react";

export default function Home() {
  const [pdf, setPdf] = useState(null); // { fileId, filename } once a PDF is uploaded
  const [uploading, setUploading] = useState(false);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function uploadPdf(file) {
    setUploading(true);
    setError("");

    try {
      // Files are sent as "form data", like a classic HTML file upload.
      const form = new FormData();
      form.append("file", file);
      const response = await fetch("/api/upload", { method: "POST", body: form });
      const data = await response.json();

      if (response.ok) {
        setPdf(data);
        setAnswer("");
      } else {
        setError(data.error);
      }
    } catch {
      setError("Could not reach the server");
    }
    setUploading(false);
  }

  async function askQuestion(event) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setAnswer("");

    try {
      const response = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileId: pdf.fileId, question }),
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

  // Screen 1: no PDF yet, so show the upload box.
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

  // Screen 2: a PDF is uploaded, so show the question box.
  return (
    <main className="page">
      <p>
        📄 <b>{pdf.filename}</b>{" "}
        <button className="link" onClick={() => setPdf(null)}>
          New PDF
        </button>
      </p>

      <form className="ask-form" onSubmit={askQuestion}>
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Ask a question about the PDF…"
        />
        <button type="submit" disabled={loading || question.trim() === ""}>
          {loading ? "Reading…" : "Ask"}
        </button>
      </form>

      {error && <p className="error">{error}</p>}
      {answer && <div className="answer">{answer}</div>}
    </main>
  );
}
