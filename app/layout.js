import { Poppins } from "next/font/google";
import "./globals.css";

// A friendly rounded font. Next.js downloads it at build time and serves it from our own site.
const poppins = Poppins({ subsets: ["latin"], weight: ["400", "500", "600"] });

export const metadata = {
  title: "Talk to PDF",
  description: "Upload a PDF and ask it anything, powered by OpenAI.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className={poppins.className}>{children}</body>
    </html>
  );
}
