import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Plabix Nexus — Your company's AI knowledge operating system",
  description:
    "Upload company knowledge and get grounded, source-cited answers from a local, $0-cost AI stack.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
