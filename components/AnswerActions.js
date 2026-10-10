"use client";

import { useEffect, useState } from "react";
import Icon from "./Icon";

// Copy · Listen · Show prompt · thumbs up / down, under an answer.
// Users rarely tell you when an answer is bad. A one-click rating is how you find out.
export default function AnswerActions({ content, requestId, onShowPrompt }) {
  const [copied, setCopied] = useState(false);
  const [rating, setRating] = useState(null);
  const [speaking, setSpeaking] = useState(false);

  // Stop talking if this answer disappears (e.g. "New PDF").
  useEffect(() => () => window.speechSynthesis?.cancel(), []);

  async function copy() {
    await navigator.clipboard.writeText(content);
    setCopied(true);
  }

  // v8: read the answer out loud with the browser's built-in voice. Free, no API needed.
  function speak() {
    window.speechSynthesis.cancel();
    if (speaking) {
      setSpeaking(false);
      return;
    }
    // Citations and markdown symbols sound odd when read aloud, so we drop them.
    const text = content.replace(/\((?:Doc \d+, )?p\. ?\d+\)/g, "").replace(/[*#_`>|]/g, "");
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.onend = () => setSpeaking(false);
    window.speechSynthesis.speak(utterance);
    setSpeaking(true);
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
      <button onClick={copy} title="Copy">
        <Icon name={copied ? "check" : "copy"} size={15} /> {copied ? "Copied" : "Copy"}
      </button>
      <button onClick={speak} className={speaking ? "rated" : ""} title="Read it out loud">
        <Icon name={speaking ? "stop" : "volume"} size={15} /> {speaking ? "Stop" : "Listen"}
      </button>
      {onShowPrompt && (
        <button onClick={onShowPrompt} title="See exactly what was sent to the model">
          <Icon name="code" size={15} /> Prompt
        </button>
      )}
      <button
        onClick={() => rate("up")}
        disabled={rating !== null}
        className={rating === "up" ? "rated" : ""}
        title="Good answer"
      >
        <Icon name="thumbs-up" size={15} />
      </button>
      <button
        onClick={() => rate("down")}
        disabled={rating !== null}
        className={rating === "down" ? "rated" : ""}
        title="Bad answer"
      >
        <Icon name="thumbs-down" size={15} />
      </button>
      {rating && <span className="muted">Thanks!</span>}
    </div>
  );
}
