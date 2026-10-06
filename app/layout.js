import "./globals.css";

export const metadata = {
  title: "Talk to PDF",
  description: "Upload a PDF and ask it anything, powered by OpenAI.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
