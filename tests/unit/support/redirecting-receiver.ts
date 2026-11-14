import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

// An in-process receiver on an ephemeral loopback port: `/hook` answers with a
// redirect to `/moved`, which would answer 200. It records every request, so a
// test can prove the redirect target was never contacted.
export async function startRedirectingReceiver(redirectStatus: number) {
  const requests: string[] = [];
  const server = createServer((request, response) => {
    requests.push(`${request.method} ${request.url}`);
    request.resume();
    if (request.url === '/hook') response.writeHead(redirectStatus, { location: '/moved' }).end();
    else response.writeHead(200).end('ok');
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const host = `127.0.0.1:${(server.address() as AddressInfo).port}`;
  return {
    url: `http://${host}/hook`,
    host,
    requests,
    close: () => new Promise<void>((resolve) => {
      server.closeAllConnections();
      server.close(() => resolve());
    }),
  };
}
