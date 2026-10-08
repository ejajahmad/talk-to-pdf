"use client";

import { useState } from "react";

// Copy · 👍 · 👎 under an answer.
// Users rarely tell you when an answer is bad. A one-click rating is how you find out.
export default function AnswerActions({ content, requestId }) {
  const [copied, setCopied] = useState(false);
  const [rating, setRating] = useState(null);

  async function copy() {
    await navigator.clipboard.writeText(content);
    setCopied(true);
  }

  async function rate(newRating) {
    setRating(newRating);
    await fetch("/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requestId, rating: newRating }),
    });
  }

  return (
    <div className="actions">
      <button onClick={copy}>{copied ? "✓ Copied" : "Copy"}</button>
      <button onClick={() => rate("up")} disabled={rating !== null} className={rating === "up" ? "rated" : ""}>
        👍
      </button>
      <button onClick={() => rate("down")} disabled={rating !== null} className={rating === "down" ? "rated" : ""}>
        👎
      </button>
      {rating && <span className="muted">Thanks!</span>}
    </div>
  );
}
