#!/usr/bin/env ts-node
import fs from "node:fs";
import path from "node:path";
import QRCode from "qrcode";

async function main() {
  const url = process.env.NEXT_PUBLIC_SITE_URL || process.env.VERCEL_URL || "http://localhost:3000";
  const absolute = url.startsWith("http") ? url : `https://${url}`;
  const outDir = path.join(process.cwd(), "public", "qr");
  fs.mkdirSync(outDir, { recursive: true });

  const svg = await QRCode.toString(absolute, { type: "svg", margin: 2, width: 1024 });
  fs.writeFileSync(path.join(outDir, "site.svg"), svg, "utf8");

  const png = await QRCode.toBuffer(absolute, { type: "png", margin: 2, width: 2048 });
  fs.writeFileSync(path.join(outDir, "site.png"), png);

  console.log(`QR created for ${absolute} at public/qr/site.(svg|png)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
