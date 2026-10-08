// v7: shows how big this PDF is in tokens BEFORE the first question, and lets the user
// switch between sending the whole PDF ("Full PDF") and searching it ("RAG").
const BIG_PDF = 50000; // tokens. Above this, we suggest RAG.

export default function ModeBar({ tokens, mode, onModeChange, indexing, disabled }) {
  let message;
  if (tokens === null) {
    message = "Couldn't measure this PDF's size in tokens.";
  } else if (tokens > BIG_PDF && mode === "full") {
    message = (
      <>
        ⚠️ This PDF adds <b>{tokens.toLocaleString()} tokens</b> to every question. Try RAG.
      </>
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
      <span>{indexing ? "Building the search index… (10–30 seconds)" : message}</span>
      <span className="modes">
        <button
          className={mode === "full" ? "active" : ""}
          onClick={() => onModeChange("full")}
          disabled={disabled || indexing}
          title="The whole PDF (text + page images) with every question. Best quality, most tokens."
        >
          Full PDF
        </button>
        <button
          className={mode === "rag" ? "active" : ""}
          onClick={() => onModeChange("rag")}
          disabled={disabled || indexing}
          title="Search the PDF for the relevant passages. Far fewer tokens, but text only, and it can miss things."
        >
          RAG
        </button>
      </span>
    </div>
  );
}
