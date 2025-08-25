import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import WebVitalsReporter from '@/components/WebVitalsReporter';

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  manifest: "/app.webmanifest",
  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/qr/site.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/qr/site.png",
  },
  appleWebApp: {
    capable: true,
    title: "Guest Guide",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  themeColor: "#2ec4b6",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
  {/* next/font handles Google Fonts optimizations; manual preconnect tags removed to satisfy lint */}
        <link rel="preconnect" href="https://maps.geoapify.com" />
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <div className="min-h-svh">{children}</div>
        <WebVitalsReporter />
        <div id="analytics-queue-indicator" className="hidden fixed bottom-2 right-2 z-50 text-[10px] rounded bg-teal-700 text-white px-2 py-1 shadow" />
      </body>
    </html>
  );
}
