"use client";

import { useEffect, useRef, useState } from "react";

// v8: our own PDF viewer, built with PDF.js, so we can HIGHLIGHT the sentence an answer cites.
// (The browser's built-in viewer could only open a page.)
//
//   page, quote  which page to show, and the text to find on it (the sentence before a citation)
//   jump         changes on every citation click, so clicking the same citation twice still jumps
export default function PdfViewer({ pdfUrl, page, quote, jump }) {
  const scroller = useRef(null);
  const [pdf, setPdf] = useState(null);
  const [sizes, setSizes] = useState([]); // width and height of every page, to reserve space before drawing
  const [highlight, setHighlight] = useState(null); // { page, boxes: [{ left, top, width, height }] } in %

  // 1. Load the PDF. PDF.js only works in the browser, so we import it here instead of at the top.
  useEffect(() => {
    let cancelled = false;
    let loadingTask = null;
    let worker = null;

    async function load() {
      const pdfjs = await import("pdfjs-dist");
      if (cancelled) return;
      // PDF.js reads the file in a background "worker", so the page stays smooth.
      // Each PDF gets its own worker, so closing one PDF can't break the next one.
      worker = new Worker(new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url), { type: "module" });
      loadingTask = pdfjs.getDocument({ url: pdfUrl, worker: new pdfjs.PDFWorker({ port: worker }) });
      let doc;
      try {
        doc = await loadingTask.promise;
      } catch {
        return; // the viewer closed before the PDF finished loading
      }
      const pageSizes = [];
      for (let n = 1; n <= doc.numPages; n++) {
        const viewport = (await doc.getPage(n)).getViewport({ scale: 1 });
        pageSizes.push({ width: viewport.width, height: viewport.height });
      }
      if (!cancelled) {
        setPdf(doc);
        setSizes(pageSizes);
      }
    }

    load();
    return () => {
      cancelled = true;
      loadingTask?.destroy().then(() => worker.terminate());
    };
  }, [pdfUrl]);

  // 2. On every citation click: find the quote on the page, highlight it, and scroll to it.
  useEffect(() => {
    if (!pdf || jump === 0 || page < 1 || page > pdf.numPages) return;

    async function showCitation() {
      const pdfPage = await pdf.getPage(page);
      const boxes = quote ? findQuote(await pdfPage.getTextContent(), pdfPage.getViewport({ scale: 1 }), quote) : [];
      setHighlight({ page, boxes });

      const pageElement = scroller.current.querySelector(`[data-page="${page}"]`);
      let top = pageElement.offsetTop - 16;
      // Found it? Then scroll so the highlight sits in the top third of the viewer.
      if (boxes.length > 0) top += (boxes[0].top / 100) * pageElement.offsetHeight - scroller.current.clientHeight / 3;
      scroller.current.scrollTo({ top, behavior: "smooth" });
    }

    showCitation();
  }, [pdf, jump]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="viewer" ref={scroller}>
      {!pdf && <p className="muted viewer-loading">Opening PDF…</p>}
      {sizes.map((size, i) => (
        <PdfPage
          key={i}
          pdf={pdf}
          number={i + 1}
          size={size}
          boxes={highlight?.page === i + 1 ? highlight.boxes : []}
          flash={highlight?.page === i + 1 ? jump : 0}
        />
      ))}
    </div>
  );
}

// One page. It is only drawn once it scrolls into view, so even a 200-page PDF opens fast.
function PdfPage({ pdf, number, size, boxes, flash }) {
  const holder = useRef(null);
  const canvas = useRef(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setVisible(true);
        observer.disconnect();
      }
    }, { rootMargin: "800px" }); // start a little before the page is on screen
    observer.observe(holder.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!visible) return;
    let renderTask = null;

    pdf.getPage(number).then((page) => {
      // Draw at the on-screen size × the screen's pixel density, so text stays sharp on retina screens.
      const scale = (holder.current.clientWidth / size.width) * (window.devicePixelRatio || 1);
      const viewport = page.getViewport({ scale });
      canvas.current.width = viewport.width;
      canvas.current.height = viewport.height;
      renderTask = page.render({ canvasContext: canvas.current.getContext("2d"), viewport });
      renderTask.promise.catch(() => {}); // cancelled renders throw, that's fine
    });

    return () => renderTask?.cancel();
  }, [visible, pdf, number, size]);

  return (
    <div ref={holder} className="pdf-page" data-page={number} style={{ aspectRatio: `${size.width} / ${size.height}` }}>
      <canvas ref={canvas} />
      {boxes.map((box, i) => (
        <span
          key={`${flash}-${i}`} // a new key restarts the glow animation on every click
          className="mark"
          style={{ left: `${box.left}%`, top: `${box.top}%`, width: `${box.width}%`, height: `${box.height}%` }}
        />
      ))}
    </div>
  );
}

// ---- Finding the quote on the page ----
// The answer rarely copies the PDF word for word, so we don't search for the exact text.
// Instead we score every LINE of the page by how many of its words also appear in the quote,
// and highlight the best line plus any good neighbours (a sentence often spans a few lines).

const STOP_WORDS = new Set(["the", "and", "for", "with", "that", "this", "from", "are", "was", "were", "has", "have", "its", "per", "our", "you", "your", "their", "which", "into", "than", "also"]);

function words(text) {
  return (text.toLowerCase().match(/[a-z0-9$%.,']+/g) || [])
    .map((word) => word.replace(/^[$.,']+|[.,%']+$/g, ""))
    .filter((word) => (word.length >= 3 || /\d/.test(word)) && !STOP_WORDS.has(word));
}

function findQuote(textContent, viewport, quote) {
  const quoteWords = new Set(words(quote));

  // Group the page's text pieces into lines, by their vertical position.
  const lines = [];
  for (const item of textContent.items) {
    if (!item.str || !item.str.trim()) continue;
    const y = Math.round(item.transform[5]);
    let line = lines[lines.length - 1];
    if (!line || Math.abs(line.y - y) > 2) {
      line = { y, text: "", items: [] };
      lines.push(line);
    }
    line.text += item.str + " ";
    line.items.push(item);
  }

  // Score each line: what share of its words are in the quote?
  for (const line of lines) {
    const lineWords = words(line.text);
    const matches = lineWords.filter((word) => quoteWords.has(word)).length;
    line.matches = matches;
    line.score = lineWords.length === 0 ? 0 : matches / lineWords.length;
  }

  let best = -1;
  lines.forEach((line, i) => {
    if (line.matches >= 2 && (best === -1 || line.score * line.matches > lines[best].score * lines[best].matches)) best = i;
  });
  if (best === -1) return [];

  // Grow the highlight to neighbouring lines that also match well (at most 4 lines).
  const good = (line) => line && line.matches >= 2 && line.score >= 0.5;
  let first = best;
  let last = best;
  while (last - first < 3 && good(lines[first - 1])) first--;
  while (last - first < 3 && good(lines[last + 1])) last++;

  return lines.slice(first, last + 1).map((line) => lineBox(line, viewport));
}

// The rectangle around one line, in % of the page, so it fits the page at any zoom.
function lineBox(line, viewport) {
  let left = Infinity;
  let right = -Infinity;
  let top = Infinity;
  let bottom = -Infinity;
  for (const item of line.items) {
    // transform = [scaleX, skewY, skewX, scaleY, x, y]. PDF y goes UP from the bottom, screen y goes DOWN.
    const [x, y] = viewport.convertToViewportPoint(item.transform[4], item.transform[5]);
    const fontHeight = Math.hypot(item.transform[2], item.transform[3]);
    left = Math.min(left, x);
    right = Math.max(right, x + item.width);
    top = Math.min(top, y - fontHeight);
    bottom = Math.max(bottom, y + fontHeight * 0.25);
  }
  const pad = 2; // a little breathing room around the text
  return {
    left: ((left - pad) / viewport.width) * 100,
    top: ((top - pad) / viewport.height) * 100,
    width: ((right - left + pad * 2) / viewport.width) * 100,
    height: ((bottom - top + pad * 2) / viewport.height) * 100,
  };
}
