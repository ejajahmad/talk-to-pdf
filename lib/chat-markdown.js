// v8: turns the chat into a Markdown file you can download, citations and all.
export function chatToMarkdown(messages, filenames) {
  let markdown = `# Chat about ${filenames.join(", ")}\n\n`;
  markdown += `_Exported from Talk to PDF on ${new Date().toLocaleString()}_\n\n---\n\n`;

  for (const message of messages) {
    if (message.role === "user") {
      markdown += `**You:** ${message.content}\n\n`;
    }
    if (message.role === "assistant") {
      markdown += `**AI-Assistant:**\n\n${message.content}\n\n`;
    }
    if (message.role === "compare") {
      for (const answer of message.answers) {
        markdown += `**AI-Assistant (${answer.mode === "rag" ? "RAG" : "Full PDF"}):**\n\n${answer.content}\n\n`;
      }
    }
    if (message.role === "facts") {
      markdown += `**Key facts** (${message.facts.document_type}): ${message.facts.summary}\n\n`;
      markdown += "| Category | Fact | Value | Page |\n|---|---|---|---|\n";
      for (const fact of message.facts.facts) {
        markdown += `| ${fact.category} | ${fact.label} | ${fact.value} | ${fact.page} |\n`;
      }
      markdown += "\n";
    }
  }
  return markdown;
}

// Makes the browser download some text as a file.
export function downloadFile(text, filename) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/markdown" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
