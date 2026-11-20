import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: {
    default: "Freery Admin",
    template: "%s | Freery Admin",
  },
  description:
    "Freery head station admin console and the station staff passenger counter.",
  applicationName: "Freery",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/logo/freery-icon.svg",
    apple: "/logo/freery-icon.svg",
  },
};

export const viewport: Viewport = {
  themeColor: "#087e83",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="min-h-screen bg-page font-sans text-ink antialiased">
        {children}
      </body>
    </html>
  );
}
