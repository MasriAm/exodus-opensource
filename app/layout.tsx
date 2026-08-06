import type { Metadata, Viewport } from "next";

import { Analytics } from "@vercel/analytics/next";
import { AppProviders } from "@/components/app-providers";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Exodus — Time Capsule",
    template: "%s · Exodus",
  },
  description:
    "Meet your past self. Explore Instagram and WhatsApp exports privately in your browser.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/icon-192.svg", sizes: "192x192", type: "image/svg+xml" },
      { url: "/icon-512.svg", sizes: "512x512", type: "image/svg+xml" },
    ],
  },
};

export const viewport: Viewport = {
  themeColor: "#EADBC3",
  colorScheme: "light",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        <AppProviders>{children}</AppProviders>
        <Analytics />
      </body>
    </html>
  );
}
