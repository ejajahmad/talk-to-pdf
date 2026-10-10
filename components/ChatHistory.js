import Icon from "./Icon";
import { timeAgo } from "@/lib/chat-store";

// v8: the list of saved chats. Click one to open it again at its own URL.
export default function ChatHistory({ chats, currentId, onOpen, onDelete }) {
  if (chats.length === 0) {
    return <p className="muted small history-empty">Your chats will appear here.</p>;
  }

  return (
    <ul className="history">
      {chats.map((chat) => (
        <li key={chat.id} className={chat.id === currentId ? "current" : ""}>
          <button className="history-open" onClick={() => onOpen(chat.id)}>
            <span className="history-icon">
              <Icon name="message" size={16} />
            </span>
            <span className="history-text">
              <span className="history-title">{chat.title}</span>
              <span className="muted small">
                {chat.docs.map((doc) => doc.filename).join(", ")} · {timeAgo(chat.updatedAt)}
              </span>
            </span>
          </button>
          <button className="history-delete" onClick={() => onDelete(chat.id)} title="Delete this chat">
            <Icon name="trash" size={15} />
          </button>
        </li>
      ))}
    </ul>
  );
}
