#!/usr/bin/env node
/*
 * Local development stand-in for the production Nginx trusted-ingress hop.
 *
 * Sensitive routes resolve client identity only from the two private headers
 * that Nginx overwrites in production (docs/security/trusted-ingress.md). A
 * browser cannot send them, so `next dev` alone answers 503 on admin login,
 * guest sign-in/claims and the other limited routes. This
 * proxy listens on loopback, drops any client-supplied private headers, adds
 * the attestation (ORIGIN_PROXY_SHARED_SECRET) and the socket peer address,
 * and forwards HTTP and WebSocket (HMR) traffic to the dev server.
 *
 * Development only: it refuses to start with NODE_ENV=production.
 *
 *   npm run dev          # terminal 1: next dev on :3000
 *   npm run dev:proxy    # terminal 2: open http://localhost:3001
 */
import http from 'node:http';
import net from 'node:net';
import dotenv from 'dotenv';

dotenv.config({
  path: ['.env.development.local', '.env.local', '.env.development', '.env'],
  quiet: true,
});

const ATTESTATION_HEADER = 'x-origin-proxy-attestation';
const CLIENT_IP_HEADER = 'x-origin-verified-client-ip';
const listenPort = Number(process.env.DEV_PROXY_PORT || 3001);
const target = new URL(process.env.DEV_PROXY_TARGET || 'http://127.0.0.1:3000');
const secret = process.env.ORIGIN_PROXY_SHARED_SECRET || '';

function fail(message) {
  console.error(`[dev-proxy] ${message}`);
  process.exit(1);
}

if (process.env.NODE_ENV === 'production') fail('refusing to run with NODE_ENV=production');
if (!/^[0-9a-fA-F]{64}$/u.test(secret)) {
  fail('ORIGIN_PROXY_SHARED_SECRET must be a 64-character hex value in .env.local (run `npm run ensure-pepper`)');
}
if (target.protocol !== 'http:' || !['127.0.0.1', 'localhost', '::1', '[::1]'].includes(target.hostname)) {
  fail('DEV_PROXY_TARGET must be a loopback http:// URL');
}
if (!Number.isInteger(listenPort) || listenPort <= 0 || listenPort > 65535) fail('DEV_PROXY_PORT is invalid');

/** Rebuild the header list: drop client-supplied private headers, then add the trusted pair. */
function forwardedHeaders(rawHeaders, peerAddress) {
  const headers = [];
  for (let index = 0; index < rawHeaders.length; index += 2) {
    const name = rawHeaders[index];
    const lower = name.toLowerCase();
    if (lower === ATTESTATION_HEADER || lower === CLIENT_IP_HEADER || lower === 'x-forwarded-proto') continue;
    headers.push(name, rawHeaders[index + 1]);
  }
  headers.push(ATTESTATION_HEADER, secret, CLIENT_IP_HEADER, peerAddress || '127.0.0.1', 'x-forwarded-proto', 'http');
  return headers;
}

const server = http.createServer((request, response) => {
  const upstream = http.request({
    host: target.hostname.replace(/^\[|\]$/gu, ''),
    port: target.port || 80,
    method: request.method,
    path: request.url,
    headers: forwardedHeaders(request.rawHeaders, request.socket.remoteAddress),
  }, (upstreamResponse) => {
    response.writeHead(upstreamResponse.statusCode ?? 502, upstreamResponse.rawHeaders);
    upstreamResponse.pipe(response);
  });
  upstream.on('error', (error) => {
    if (!response.headersSent) response.writeHead(502, { 'content-type': 'text/plain' });
    response.end(`dev-proxy: upstream unavailable (${error.code ?? error.message})`);
  });
  request.pipe(upstream);
});

server.on('upgrade', (request, socket, head) => {
  const upstream = net.connect(Number(target.port || 80), target.hostname.replace(/^\[|\]$/gu, ''), () => {
    const headers = forwardedHeaders(request.rawHeaders, request.socket.remoteAddress);
    let preamble = `${request.method} ${request.url} HTTP/${request.httpVersion}\r\n`;
    for (let index = 0; index < headers.length; index += 2) preamble += `${headers[index]}: ${headers[index + 1]}\r\n`;
    upstream.write(`${preamble}\r\n`);
    if (head?.length) upstream.write(head);
    upstream.pipe(socket);
    socket.pipe(upstream);
  });
  upstream.on('error', () => socket.destroy());
  socket.on('error', () => upstream.destroy());
});

server.listen(listenPort, '127.0.0.1', () => {
  console.log(`[dev-proxy] http://localhost:${listenPort} -> ${target.origin} (trusted-ingress headers added; development only)`);
});
