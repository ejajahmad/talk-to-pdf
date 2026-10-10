// Draws the JSON from /api/extract as a table.
// The schema guarantees the shape, so this is plain React: no parsing, no regex.
export default function FactsCard({ facts, doc, onCitationClick }) {
  return (
    <div className="facts">
      <p>
        <span className="badge">{facts.document_type}</span> {facts.summary}
      </p>
      <table>
        <tbody>
          {facts.facts.map((fact, i) => (
            <tr key={i}>
              <td>
                <span className="category">{fact.category}</span>
              </td>
              <td className="muted">{fact.label}</td>
              <td>{fact.value}</td>
              <td>
                <button
                  className="cite"
                  onClick={() => onCitationClick({ doc, page: fact.page, quote: `${fact.label} ${fact.value}` })}
                >
                  p. {fact.page}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
