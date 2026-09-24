import type { Metadata, Viewport } from "next";
import "./globals.css";
import WebVitalsReporter from '@/components/WebVitalsReporter';
import { headers } from 'next/headers';

export const metadata: Metadata = {
  // Route metadata already includes the localized site name where appropriate.
  // Keep the root title scalar so Next does not append the brand a second time.
  title: 'Villa Guest Guide',
  manifest: "/app.webmanifest",
  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: { url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
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
        <script
          nonce={nonce}
          // Browsers intentionally hide a nonce value from DOM attribute reads.
          // React would otherwise compare the server nonce with an empty client
          // attribute and report a false hydration mismatch in development.
          suppressHydrationWarning
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem('theme');if(t!=='light'&&t!=='dark')t=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';document.documentElement.setAttribute('data-theme',t);document.documentElement.classList.toggle('dark',t==='dark')}catch(e){document.documentElement.setAttribute('data-theme','light')}`,
          }}
        />
      </head>
      <body className="antialiased">
        <div className="min-h-svh">{children}</div>
        <WebVitalsReporter />
      </body>
    </html>
  );
}
