import type { Metadata, Viewport } from "next";
// Replacing Google font import (Geist) with system stack to avoid external fetch failures during build.
import "./globals.css";
import "../styles/01-tokens.css";
import "../styles/02-layout.css";
import "../styles/03-home.css";
import "../styles/04-theme.css";
import "../styles/05-primitives.css";
import "../styles/06-semantic-surfaces.css";
import "../styles/07-search-listing.css";
import "../styles/08-vendor.css";
import "../styles/09-utilities.css";
import "../styles/10-moments.css";
import "../styles/11-contact.css";
import "../styles/12-apartment-checkin.css";
import "../styles/13-compatibility-admin.css";
import WebVitalsReporter from '@/components/WebVitalsReporter';
import DataWarmup from '@/components/DataWarmup';
import { headers } from 'next/headers';

// Font variables removed (system fonts used)

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
  themeColor: "#36b9ab",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const requestHeaders = await headers();
  const locale = requestHeaders.get('x-locale') === 'el' ? 'el' : 'en';
  const nonce = requestHeaders.get('x-nonce') ?? undefined;
  return (
    <html lang={locale} suppressHydrationWarning>
      <head>
  {/* next/font handles Google Fonts optimizations; manual preconnect tags removed to satisfy lint */}
        <script
          nonce={nonce}
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem('theme');if(t!=='light'&&t!=='dark')t=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';document.documentElement.setAttribute('data-theme',t);document.documentElement.classList.toggle('dark',t==='dark')}catch(e){document.documentElement.setAttribute('data-theme','light')}`,
          }}
        />
        <link rel="preconnect" href="https://maps.geoapify.com" />
      </head>
  <body className="antialiased">
        <div className="min-h-svh">{children}</div>
        <DataWarmup />
        <WebVitalsReporter />
      </body>
    </html>
  );
}
