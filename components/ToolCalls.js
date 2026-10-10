import Icon from "./Icon";

// Shows which tools the model used for an answer, so the "agent" isn't a black box.
export default function ToolCalls({ tools, onCitationClick }) {
  return (
    <div className="tools">
      {tools.map((tool, i) => {
        if (tool.name === "calculate") {
          return (
            <span key={i} className="tool">
              <Icon name="calculator" size={14} /> <code>{tool.args.expression}</code> = <b>{tool.output}</b>
            </span>
          );
        }
        if (tool.name === "go_to_page") {
          return (
            <button key={i} className="tool" onClick={() => onCitationClick({ ...tool.args, quote: tool.args.reason })}>
              <Icon name="file" size={14} /> Opened p. {tool.args.page}: {tool.args.reason}
            </button>
          );
        }
        if (tool.name === "report_injection") {
          // v8: the document tried to give the AI orders, and the AI refused.
          return (
            <button key={i} className="tool blocked" onClick={() => onCitationClick({ ...tool.args, quote: "" })}>
              <Icon name="shield" size={14} /> Blocked hidden instructions on p. {tool.args.page}: {tool.args.summary}
            </button>
          );
        }
        if (tool.name === "file_search") {
          return (
            <span key={i} className="tool">
              <Icon name="search" size={14} /> Searched &ldquo;{tool.args.queries[0]}&rdquo; → {tool.output} from p.{" "}
              {tool.pages.join(", ")}
            </span>
          );
        }
        return null;
      })}
    </div>
  );
}
