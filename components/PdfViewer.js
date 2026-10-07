// Shows the PDF with the browser's own PDF viewer.
// Adding "#page=4" to the address opens the PDF at page 4.
//
// `jump` changes every time a citation is clicked. Using it as the `key` makes React
// rebuild the iframe, so the viewer jumps even when you click the same page twice.
export default function PdfViewer({ pdfUrl, page, jump }) {
  return <iframe key={jump} className="viewer" src={`${pdfUrl}#page=${page}`} title="PDF viewer" />;
}
