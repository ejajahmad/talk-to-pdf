import Icon from "./Icon";

// v7: shows how big the PDF is in tokens BEFORE the first question, and lets the user
// switch between sending the whole PDF ("Full PDF") and searching it ("RAG").
// v8: "Compare" asks both ways at once and shows the answers side by side.
const BIG_PDF = 50000; // tokens. Above this, we suggest RAG.

const MODES = [
  { id: "full", label: "Full PDF", title: "The whole PDF (text + page images) with every question. Best quality, most tokens." },
  { id: "rag", label: "RAG", title: "Search the PDF for the relevant passages. Far fewer tokens, but text only, and it can miss things." },
  { id: "compare", label: "Compare", title: "Ask both ways at once and compare quality, tokens, speed and cost side by side." },
];

export default function ModeBar({ tokens, docCount, mode, onModeChange, indexing, disabled }) {
  let message;
  if (indexing) {
    message = "Building the search index… (10–30 seconds)";
  } else if (docCount > 1) {
    message = (
      <>
        {docCount} PDFs: <b>{tokens === null ? "?" : tokens.toLocaleString()} tokens</b> per question. RAG works with one PDF.
      </>
    );
  } else if (tokens === null) {
    message = "Couldn't measure this PDF's size in tokens.";
  } else if (tokens > BIG_PDF && mode === "full") {
    message = (
      <span className="warning">
        <Icon name="alert" size={14} /> This PDF adds <b>{tokens.toLocaleString()} tokens</b> to every question. Try RAG.
      </span>
    );
  } else {
    message = (
      <>
        This PDF: <b>{tokens.toLocaleString()} tokens</b> per question in Full PDF mode.
      </>
    );
  }

  return (
    <div className="modebar">
      <span>{message}</span>
      <span className="modes">
        {MODES.map((m) => (
          <button
            key={m.id}
            className={mode === m.id ? "active" : ""}
            onClick={() => onModeChange(m.id)}
            disabled={disabled || indexing || (docCount > 1 && m.id !== "full")}
            title={m.title}
          >
            {m.id === "compare" && <Icon name="columns" size={13} />} {m.label}
          </button>
        ))}
      </span>
    </div>
  );
}
