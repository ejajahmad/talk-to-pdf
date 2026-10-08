import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

// Reads the text of every page of a PDF with PDF.js (Mozilla's PDF library).
// Returns one string per page: pages[0] is page 1.
//
// Scanned PDFs are just pictures, with no text inside, so their pages come back empty.
export async function readPageTexts(pdfBytes) {
  const loadingTask = getDocument({ data: new Uint8Array(pdfBytes), verbosity: 0 });
  const pdf = await loadingTask.promise;

  const pages = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    // Each item is a piece of text. hasEOL means "a line ends here".
    let text = "";
    for (const item of content.items) {
      text += item.str + (item.hasEOL ? "\n" : " ");
    }
    pages.push(text);
  }

  await loadingTask.destroy(); // free the memory PDF.js used
  return pages;
}
