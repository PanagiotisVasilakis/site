import { NextResponse } from 'next/server';
import { openApiSpec } from '@/lib/openapi';

export const dynamic = 'force-dynamic';

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character] ?? character);
}

export async function GET() {
  const paths = Object.entries(openApiSpec.paths)
    .flatMap(([path, operations]) => Object.entries(operations).map(([method, operation]) => {
      const summary = 'summary' in operation && typeof operation.summary === 'string' ? operation.summary : '';
      return `<tr><td><code>${escapeHtml(method.toUpperCase())}</code></td><td><code>${escapeHtml(path)}</code></td><td>${escapeHtml(summary)}</td></tr>`;
    }))
    .join('');

  const html = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>API Documentation</title></head>
<body>
<main>
<h1>${escapeHtml(openApiSpec.info.title)}</h1>
<p>${escapeHtml(openApiSpec.info.description)}</p>
<p><a href="/api/docs/openapi">Download the OpenAPI 3 specification</a></p>
<table><caption>Documented endpoints</caption><thead><tr><th>Method</th><th>Path</th><th>Summary</th></tr></thead><tbody>${paths}</tbody></table>
</main>
</body>
</html>`;

  return new NextResponse(html, {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'public, max-age=3600',
      'x-content-type-options': 'nosniff',
    },
  });
}
