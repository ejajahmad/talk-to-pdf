import Markdown from "react-markdown";

// The model cites pages like "(p. 4)". We turn each citation into a markdown link
// "[(p. 4)](#page-4)", then show those links as buttons that open that page.
function linkCitations(text) {
  return text.replace(/\(p\. ?(\d+)\)/g, "[(p. $1)](#page-$1)");
}

export default function AssistantMessage({ content, onCitationClick }) {
  return (
    <Markdown
      components={{
        // Tell react-markdown how to draw links.
        a({ href, children }) {
          if (href.startsWith("#page-")) {
            const page = Number(href.replace("#page-", ""));
            return (
              <button className="cite" onClick={() => onCitationClick(page)}>
                {children}
              </button>
            );
          }
          // A normal web link.
          return (
            <a href={href} target="_blank" rel="noreferrer">
              {children}
            </a>
          );
        },
      }}
    >
      {linkCitations(content)}
    </Markdown>
  );
}
