#!/usr/bin/env tsx
import path from "node:path";
import fs from "node:fs";
import QRCode from "qrcode";

// QR Code configuration constants
const QR_MARGIN = 2;
const QR_SVG_WIDTH = 1024;
const QR_PNG_WIDTH = 2048;

async function main() {
  const url = process.env.NEXT_PUBLIC_SITE_URL || process.env.VERCEL_URL || "http://localhost:3000";
  const absolute = url.startsWith("http") ? url : `https://${url}`;
  const outDir = path.join(process.cwd(), "public", "qr");
  fs.mkdirSync(outDir, { recursive: true });

  const svg = await QRCode.toString(absolute, { type: "svg", margin: QR_MARGIN, width: QR_SVG_WIDTH });
  fs.writeFileSync(path.join(outDir, "site.svg"), svg, "utf8");

  const png = await QRCode.toBuffer(absolute, { type: "png", margin: QR_MARGIN, width: QR_PNG_WIDTH });
  fs.writeFileSync(path.join(outDir, "site.png"), png);

  console.log(`QR created for ${absolute} at public/qr/site.(svg|png)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
