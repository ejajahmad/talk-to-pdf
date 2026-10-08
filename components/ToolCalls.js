// Shows which tools the model used for an answer, so the "agent" isn't a black box.
export default function ToolCalls({ tools }) {
  return (
    <div className="tools">
      {tools.map((tool, i) => (
        <span key={i} className="tool">
          {tool.name === "calculate" && (
            <>
              🧮 <code>{tool.args.expression}</code> = <b>{tool.output}</b>
            </>
          )}
          {tool.name === "go_to_page" && `📄 Opened p. ${tool.args.page}: ${tool.args.reason}`}
          {tool.name === "file_search" &&
            `🔎 Searched "${tool.args.queries[0]}" → ${tool.output} from p. ${tool.pages.join(", ")}`}
        </span>
      ))}
    </div>
  );
}
