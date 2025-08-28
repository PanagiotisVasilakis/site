import fs from 'node:fs';
import path from 'node:path';

/** Inline Next.js built CSS <link> tags into provided HTML. */
export function inlineCss(html: string): string {
  const cssLinkRegex = /<link[^>]+href="(\/[_a-zA-Z0-9\-.\/]*static\/css\/[^"']+\.css)"[^>]*>/g;
  let aggregated = '';
  html = html.replace(cssLinkRegex, (_m: string, href: string) => {
    const diskPath = path.join(process.cwd(), href.replace(/^\//,''));
    try { const css = fs.readFileSync(diskPath, 'utf8'); aggregated += `\n/* inlined: ${href} */\n` + css; } catch {}
    return '';
  });
  if (aggregated) {
    const safeAggregated = aggregated.replace(/<\//g, '<\\/');
    html = html.replace('</head>', `<style id="__inlined_next_css">${safeAggregated}</style></head>`);
  }
  return html;
}

export default inlineCss;