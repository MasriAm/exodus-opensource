import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Exodus",
  description: "Explore your data exports privately in your browser.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
