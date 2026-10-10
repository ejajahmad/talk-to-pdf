import Icon from "./Icon";

// v8: "Under the hood". Shows EXACTLY what was sent to the model for one answer:
// the system prompt, the tools it may call, and every message (the PDF shown as a placeholder).
export default function PromptDrawer({ prompt, onClose }) {
  return (
    <div className="backdrop" onClick={onClose}>
      <aside className="drawer" onClick={(e) => e.stopPropagation()}>
        <header>
          <div>
            <h2>Under the hood</h2>
            <p className="muted small">The model has no memory: this whole request is rebuilt and sent for every question.</p>
          </div>
          <button className="round" onClick={onClose} title="Close">
            <Icon name="x" />
          </button>
        </header>

        <h3>Instructions (system prompt)</h3>
        <pre>{prompt.instructions}</pre>

        <h3>Tools the model may call</h3>
        <div className="tools">
          {prompt.tools.map((tool) => (
            <span key={tool} className="tool">
              {tool}
            </span>
          ))}
        </div>

        <h3>Messages</h3>
        {prompt.input.map((message, i) => (
          <div key={i} className="prompt-message">
            <span className={`role ${message.role}`}>{message.role}</span>
            <pre>{message.text}</pre>
          </div>
        ))}
      </aside>
    </div>
  );
}
