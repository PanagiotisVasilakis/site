import type { Metadata, Viewport } from "next";
// Replacing Google font import (Geist) with system stack to avoid external fetch failures during build.
import "./globals.css";
import WebVitalsReporter from '@/components/WebVitalsReporter';
import StatusCluster from '@/components/StatusCluster';
import DataWarmup from '@/components/DataWarmup';

// Font variables removed (system fonts used)

export const metadata: Metadata = {
  manifest: "/manifest.webmanifest",
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
  <body className="antialiased">
        <div className="min-h-svh">{children}</div>
        <DataWarmup />
        <WebVitalsReporter />
        <div className="fixed bottom-2 left-2 z-50 sm:hidden">
          <StatusCluster labels={{ online:'Online', offline:'Offline', reconnecting:'Reconnected', slow:'Slow', syncPending:'Sync pending', syncIdle:'Synced' }} />
        </div>
      </body>
    </html>
  );
}
