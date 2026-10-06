import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Talk to PDF",
  description: "Upload a PDF and ask it anything, powered by OpenAI.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
