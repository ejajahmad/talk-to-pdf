import Markdown from "react-markdown";

// The model cites pages like "(p. 4)", or "(Doc 2, p. 4)" when there are several PDFs.
const CITATION = /\((?:Doc (\d+), )?p\. ?(\d+)\)/g;

// We turn each citation into a markdown link "[(p. 4)](#cite-0)", then show those links as buttons.
// v8: we also remember the sentence BEFORE each citation, so the viewer can find and highlight it.
function linkCitations(text) {
  const citations = [];
  let previousEnd = 0;
  const linked = text.replace(CITATION, (match, doc, page, offset) => {
    // The text since the previous citation, from the start of its line.
    const quote = text.slice(previousEnd, offset).split("\n").pop();
    previousEnd = offset + match.length;
    citations.push({ doc: Number(doc || 1), page: Number(page), quote });
    return `[${match}](#cite-${citations.length - 1})`;
  });
  return { linked, citations };
}

export default function AssistantMessage({ content, onCitationClick }) {
  const { linked, citations } = linkCitations(content);

  return (
    <Markdown
      components={{
        // Tell react-markdown how to draw links.
        a({ href, children }) {
          if (href.startsWith("#cite-")) {
            const citation = citations[Number(href.replace("#cite-", ""))];
            return (
              <button className="cite" onClick={() => onCitationClick(citation)}>
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
      {linked}
    </Markdown>
  );
}
