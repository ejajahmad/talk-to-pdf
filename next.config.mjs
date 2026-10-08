/** @type {import("next").NextConfig} */
const nextConfig = {
  // PDF.js (used to read page text for RAG) works best when Next.js does not bundle it.
  serverExternalPackages: ["pdfjs-dist"],
};

export default nextConfig;
